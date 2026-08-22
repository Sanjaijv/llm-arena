import "server-only";

import { createHash } from "node:crypto";

import type { ComparisonResponse } from "@/features/arena/contract";
import { captureProductEvent } from "@/features/analytics/server/events";
import { prisma } from "@/features/database/server/client";
import type { FreeModel } from "@/features/model-catalog/contract";

type CreateComparisonInput = Readonly<{
  clientRequestId: string;
  threadId: string | null;
  prompt: string;
  models: readonly FreeModel[];
}>;

const MAX_TRANSACTION_ATTEMPTS = 3;

export class ComparisonConflictError extends Error {}

const hasPrismaCode = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === code;

const createFingerprint = (
  threadId: string | null,
  prompt: string,
  modelIds: readonly string[],
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        threadId,
        prompt,
        modelIds,
      }),
    )
    .digest("hex");

const createThreadTitle = (prompt: string): string => {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length <= 72 ? compact : `${compact.slice(0, 69).trimEnd()}…`;
};

const toResponse = (comparison: {
  id: string;
  threadId: string;
  sequence: number;
  prompt: string;
  runs: readonly {
    id: string;
    position: number;
    requestedModel: string;
    model: {
      displayName: string;
      contextLength: number | null;
    } | null;
  }[];
}): ComparisonResponse => ({
  comparisonId: comparison.id,
  threadId: comparison.threadId,
  sequence: comparison.sequence,
  prompt: comparison.prompt,
  runs: comparison.runs
    .toSorted((left, right) => left.position - right.position)
    .map((run) => ({
      id: run.id,
      position: run.position,
      model: {
        id: run.requestedModel,
        name: run.model?.displayName ?? run.requestedModel,
        provider: run.requestedModel.split("/")[0] || "OpenRouter",
        contextLength: run.model?.contextLength ?? null,
        promptPrice: 0,
        completionPrice: 0,
      },
    })),
});

const loadComparisonResponse = async (
  userId: string,
  clientRequestId: string,
): Promise<
  Readonly<{ fingerprint: string; response: ComparisonResponse }> | undefined
> => {
  const comparison = await prisma.comparison.findUnique({
    where: { userId_clientRequestId: { userId, clientRequestId } },
    include: { runs: { include: { model: true } } },
  });

  return comparison
    ? {
        fingerprint: comparison.requestFingerprint,
        response: toResponse(comparison),
      }
    : undefined;
};

export const createComparison = async (
  userId: string,
  input: CreateComparisonInput,
): Promise<ComparisonResponse> => {
  const fingerprint = createFingerprint(
    input.threadId,
    input.prompt,
    input.models.map(({ id }) => id),
  );
  const existing = await loadComparisonResponse(userId, input.clientRequestId);

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new ComparisonConflictError(
        "That request identifier was already used for a different prompt.",
      );
    }

    return existing.response;
  }

  let response: ComparisonResponse | undefined;

  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      response = await prisma.$transaction(
        async (transaction) => {
          const thread = input.threadId
            ? await transaction.thread.findFirst({
                where: { id: input.threadId, userId },
              })
            : await transaction.thread.create({
                data: { userId, title: createThreadTitle(input.prompt) },
              });

          if (!thread) {
            throw new ComparisonConflictError("That thread is not available.");
          }

          await transaction.$queryRaw`
        SELECT "id" FROM "threads" WHERE "id" = ${thread.id} FOR UPDATE
      `;

          const activeComparison = await transaction.comparison.findFirst({
            where: { threadId: thread.id, status: "IN_PROGRESS" },
            select: { id: true },
          });

          if (activeComparison) {
            throw new ComparisonConflictError(
              "Wait for the current answers to finish before sending a follow-up.",
            );
          }

          const latest = await transaction.comparison.aggregate({
            where: { threadId: thread.id },
            _max: { sequence: true },
          });

          const storedModels = await Promise.all(
            input.models.map((model) =>
              transaction.model.upsert({
                where: {
                  provider_providerModelId: {
                    provider: "openrouter",
                    providerModelId: model.id,
                  },
                },
                create: {
                  provider: "openrouter",
                  providerModelId: model.id,
                  displayName: model.name,
                  contextLength: model.contextLength,
                },
                update: {
                  displayName: model.name,
                  contextLength: model.contextLength,
                  isActive: true,
                },
              }),
            ),
          );

          const comparison = await transaction.comparison.create({
            data: {
              threadId: thread.id,
              userId,
              sequence: (latest._max.sequence ?? 0) + 1,
              clientRequestId: input.clientRequestId,
              requestFingerprint: fingerprint,
              prompt: input.prompt,
              runs: {
                create: storedModels.map((model, position) => ({
                  modelId: model.id,
                  position,
                  requestedModel: model.providerModelId,
                })),
              },
            },
            include: { runs: { include: { model: true } } },
          });

          await transaction.thread.update({
            where: { id: thread.id },
            data: { updatedAt: new Date() },
          });

          return toResponse(comparison);
        },
        { isolationLevel: "Serializable" },
      );
      break;
    } catch (error: unknown) {
      if (hasPrismaCode(error, "P2034") && attempt < MAX_TRANSACTION_ATTEMPTS) {
        continue;
      }

      if (hasPrismaCode(error, "P2002")) {
        const concurrent = await loadComparisonResponse(
          userId,
          input.clientRequestId,
        );
        if (concurrent?.fingerprint === fingerprint) {
          response = concurrent.response;
          break;
        }
      }

      throw error;
    }
  }

  if (!response) {
    throw new Error("Comparison transaction exhausted its retry budget.");
  }

  await captureProductEvent(userId, "prompt_sent", {
    thread_id: response.threadId,
    comparison_id: response.comparisonId,
    turn_sequence: response.sequence,
    selected_model_count: response.runs.length,
  });

  return response;
};

export const findIdempotentComparison = async (
  userId: string,
  input: Readonly<{
    clientRequestId: string;
    threadId: string | null;
    prompt: string;
    modelIds: readonly string[];
  }>,
): Promise<ComparisonResponse | undefined> => {
  const existing = await loadComparisonResponse(userId, input.clientRequestId);
  if (!existing) {
    return undefined;
  }

  const fingerprint = createFingerprint(
    input.threadId,
    input.prompt,
    input.modelIds,
  );
  if (existing.fingerprint !== fingerprint) {
    throw new ComparisonConflictError(
      "That request identifier was already used for a different prompt.",
    );
  }

  return existing.response;
};
