import "server-only";

import type { ChatStreamChunk } from "@openrouter/sdk/models/chatstreamchunk.js";
import type { ChatUsage } from "@openrouter/sdk/models/chatusage.js";

import {
  encodeModelStreamEvent,
  type ModelStreamEvent,
} from "@/features/arena/contract";
import {
  captureGenerationEvent,
  captureProductEvent,
} from "@/features/analytics/server/events";
import { prisma } from "@/features/database/server/client";
import { openRouter } from "@/features/model-connection/server/openrouter";

const MODEL_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 2_048;
const activeModelRunControllers = new Map<string, AbortController>();

export const isModelRunActive = (runId: string): boolean =>
  activeModelRunControllers.has(runId);

type ClaimedRun = NonNullable<Awaited<ReturnType<typeof claimModelRun>>>;

class ModelRunFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

const isChatStream = (
  value: unknown,
): value is AsyncIterable<ChatStreamChunk> =>
  typeof value === "object" && value !== null && Symbol.asyncIterator in value;

const toUsage = (usage: ChatUsage | undefined) => ({
  promptTokens: usage?.promptTokens ?? null,
  completionTokens: usage?.completionTokens ?? null,
  totalTokens: usage?.totalTokens ?? null,
  cost: usage?.cost ?? null,
});

const enqueue = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: ModelStreamEvent,
): boolean => {
  try {
    controller.enqueue(encodeModelStreamEvent(event));
    return true;
  } catch {
    return false;
  }
};

export const claimModelRun = async (userId: string, runId: string) => {
  const claimed = await prisma.modelRun.updateMany({
    where: {
      id: runId,
      status: "PENDING",
      comparison: { userId },
    },
    data: { status: "STREAMING", startedAt: new Date() },
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.modelRun.findUnique({
    where: { id: runId },
    include: {
      model: true,
      comparison: { include: { thread: true } },
    },
  });
};

const buildConversation = async (run: ClaimedRun) => {
  const earlierTurns = await prisma.comparison.findMany({
    where: {
      threadId: run.comparison.threadId,
      sequence: { lt: run.comparison.sequence },
    },
    orderBy: { sequence: "asc" },
    select: {
      prompt: true,
      runs: {
        where: { modelId: run.modelId, status: "COMPLETED" },
        select: { content: true },
        take: 1,
      },
    },
  });

  return [
    ...earlierTurns.flatMap((turn) => {
      const answer = turn.runs[0]?.content;
      return answer
        ? [
            { role: "user" as const, content: turn.prompt },
            { role: "assistant" as const, content: answer },
          ]
        : [];
    }),
    { role: "user" as const, content: run.comparison.prompt },
  ];
};

type TerminalRun = Readonly<{
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  content: string;
  resolvedModel: string;
  providerRequestId: string | null;
  durationMs: number;
  timeToFirstTokenMs: number | null;
  usage: ReturnType<typeof toUsage>;
  errorCode: string | null;
}>;

const persistTerminalRun = async (
  run: ClaimedRun,
  terminal: TerminalRun,
): Promise<void> => {
  const completedAt = new Date();

  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id" FROM "comparisons"
      WHERE "id" = ${run.comparisonId}
      FOR UPDATE
    `;

    const updated = await transaction.modelRun.updateMany({
      where: { id: run.id, status: "STREAMING" },
      data: {
        status: terminal.status,
        content: terminal.content || null,
        resolvedModel: terminal.resolvedModel,
        providerRequestId: terminal.providerRequestId,
        durationMs: terminal.durationMs,
        timeToFirstTokenMs: terminal.timeToFirstTokenMs,
        promptTokens: terminal.usage.promptTokens,
        completionTokens: terminal.usage.completionTokens,
        totalTokens: terminal.usage.totalTokens,
        costUsd: terminal.usage.cost,
        errorCode: terminal.errorCode,
        completedAt,
      },
    });

    if (updated.count !== 1) {
      return;
    }

    const statuses = await transaction.modelRun.groupBy({
      by: ["status"],
      where: { comparisonId: run.comparisonId },
      _count: { _all: true },
    });
    const total = statuses.reduce((sum, row) => sum + row._count._all, 0);
    const pending = statuses
      .filter(({ status }) => status === "PENDING" || status === "STREAMING")
      .reduce((sum, row) => sum + row._count._all, 0);

    if (total > 0 && pending === 0) {
      const completed =
        statuses.find(({ status }) => status === "COMPLETED")?._count._all ?? 0;
      const failed =
        statuses.find(({ status }) => status === "FAILED")?._count._all ?? 0;
      const status =
        completed > 0 ? "COMPLETED" : failed > 0 ? "FAILED" : "CANCELLED";

      await transaction.comparison.update({
        where: { id: run.comparisonId },
        data: { status, completedAt },
      });
    }
  });
};

const captureTerminalAnalytics = async (
  run: ClaimedRun,
  terminal: TerminalRun,
): Promise<void> => {
  await Promise.all([
    terminal.status === "COMPLETED"
      ? captureProductEvent(run.comparison.userId, "answer_finished", {
          thread_id: run.comparison.threadId,
          comparison_id: run.comparisonId,
          model_run_id: run.id,
          requested_model: run.requestedModel,
          resolved_model: terminal.resolvedModel,
          duration_ms: terminal.durationMs,
          time_to_first_token_ms: terminal.timeToFirstTokenMs,
          total_tokens: terminal.usage.totalTokens,
        })
      : captureProductEvent(run.comparison.userId, "model_response_failed", {
          thread_id: run.comparison.threadId,
          comparison_id: run.comparisonId,
          model_run_id: run.id,
          requested_model: run.requestedModel,
          status: terminal.status,
          error_code: terminal.errorCode,
          duration_ms: terminal.durationMs,
        }),
    captureGenerationEvent({
      userId: run.comparison.userId,
      threadId: run.comparison.threadId,
      comparisonId: run.comparisonId,
      runId: run.id,
      requestedModel: run.requestedModel,
      resolvedModel: terminal.resolvedModel,
      latencySeconds: terminal.durationMs / 1_000,
      timeToFirstTokenSeconds:
        terminal.timeToFirstTokenMs === null
          ? null
          : terminal.timeToFirstTokenMs / 1_000,
      promptTokens: terminal.usage.promptTokens,
      completionTokens: terminal.usage.completionTokens,
      costUsd: terminal.usage.cost,
      isError: terminal.status !== "COMPLETED",
      errorCode: terminal.errorCode,
    }),
  ]);
};

export const createClaimedModelRunStream = (
  run: ClaimedRun,
  requestSignal: AbortSignal,
): ReadableStream<Uint8Array> => {
  let activeAbortController: AbortController | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const abortController = new AbortController();
      activeAbortController = abortController;
      activeModelRunControllers.set(run.id, abortController);
      const abortFromRequest = () => abortController.abort("client_disconnect");
      requestSignal.addEventListener("abort", abortFromRequest, { once: true });
      const timeout = setTimeout(
        () => abortController.abort("model_timeout"),
        MODEL_TIMEOUT_MS,
      );

      let providerStartedAt = performance.now();
      let firstTokenAt: number | null = null;
      let content = "";
      let finalUsage: ChatUsage | undefined;
      let resolvedModel = run.requestedModel;
      let providerRequestId: string | null = null;
      let iterator: AsyncIterator<ChatStreamChunk> | null = null;
      let terminal: TerminalRun | null = null;
      let clientError: Readonly<{
        message: string;
        retryable: boolean;
      }> | null = null;

      enqueue(controller, {
        type: "started",
        runId: run.id,
        model: run.requestedModel,
        startedAt: new Date().toISOString(),
      });

      try {
        const messages = await buildConversation(run);
        providerStartedAt = performance.now();
        const upstream = await openRouter.chat.send(
          {
            chatRequest: {
              model: run.requestedModel,
              messages,
              maxTokens: MAX_OUTPUT_TOKENS,
              stream: true,
            },
          },
          { signal: abortController.signal },
        );

        if (!isChatStream(upstream)) {
          throw new ModelRunFailure(
            "invalid_provider_response",
            true,
            "This model returned an invalid response.",
          );
        }

        iterator = upstream[Symbol.asyncIterator]();

        while (true) {
          const next = await iterator.next();
          if (next.done) {
            break;
          }

          const chunk = next.value;
          providerRequestId ||= chunk.id;
          resolvedModel = chunk.model || resolvedModel;
          finalUsage = chunk.usage ?? finalUsage;

          if (chunk.error) {
            throw new ModelRunFailure(
              chunk.error.metadata?.errorType ?? "provider_stream_error",
              true,
              "This model stopped responding.",
            );
          }

          const text = chunk.choices[0]?.delta.content;
          if (text) {
            firstTokenAt ??= performance.now();
            content += text;
            enqueue(controller, { type: "delta", text });
          }
        }

        if (!content) {
          throw new ModelRunFailure(
            "empty_response",
            true,
            "This model returned an empty response.",
          );
        }

        const finishedAt = performance.now();
        terminal = {
          status: "COMPLETED",
          content,
          resolvedModel,
          providerRequestId,
          durationMs: Math.round(finishedAt - providerStartedAt),
          timeToFirstTokenMs:
            firstTokenAt === null
              ? null
              : Math.round(firstTokenAt - providerStartedAt),
          usage: toUsage(finalUsage),
          errorCode: null,
        };
      } catch (error: unknown) {
        const finishedAt = performance.now();
        const wasCancelled = abortController.signal.aborted;
        const timedOut = abortController.signal.reason === "model_timeout";
        const failure =
          error instanceof ModelRunFailure
            ? error
            : new ModelRunFailure(
                timedOut ? "model_timeout" : "provider_error",
                true,
                timedOut
                  ? "This model took too long to respond."
                  : "This model stopped responding.",
              );

        terminal = {
          status: wasCancelled && !timedOut ? "CANCELLED" : "FAILED",
          content,
          resolvedModel,
          providerRequestId,
          durationMs: Math.round(finishedAt - providerStartedAt),
          timeToFirstTokenMs:
            firstTokenAt === null
              ? null
              : Math.round(firstTokenAt - providerStartedAt),
          usage: toUsage(finalUsage),
          errorCode:
            wasCancelled && !timedOut ? "client_cancelled" : failure.code,
        };

        clientError = {
          message: failure.message,
          retryable: failure.retryable,
        };

        console.error("Model run failed", {
          comparisonId: run.comparisonId,
          runId: run.id,
          requestedModel: run.requestedModel,
          errorCode: terminal.errorCode,
          error,
        });
      } finally {
        activeAbortController = null;
        clearTimeout(timeout);
        requestSignal.removeEventListener("abort", abortFromRequest);
        await iterator?.return?.().catch(() => undefined);

        try {
          if (terminal) {
            await persistTerminalRun(run, terminal);
            await captureTerminalAnalytics(run, terminal);

            if (terminal.status === "COMPLETED" && !requestSignal.aborted) {
              enqueue(controller, {
                type: "complete",
                runId: run.id,
                model: terminal.resolvedModel,
                durationMs: terminal.durationMs,
                timeToFirstTokenMs: terminal.timeToFirstTokenMs,
                usage: terminal.usage,
              });
            } else if (
              terminal.status === "FAILED" &&
              clientError &&
              !requestSignal.aborted
            ) {
              enqueue(controller, {
                type: "error",
                code: terminal.errorCode ?? "provider_error",
                message: clientError.message,
                retryable: clientError.retryable,
              });
            }
          }

          try {
            controller.close();
          } catch {
            // The browser may already have cancelled its reader.
          }
        } finally {
          if (activeModelRunControllers.get(run.id) === abortController) {
            activeModelRunControllers.delete(run.id);
          }
        }
      }
    },
    cancel() {
      activeAbortController?.abort("client_disconnect");
    },
  });
};

export const cancelModelRun = async (
  userId: string,
  runId: string,
): Promise<boolean> => {
  const completedAt = new Date();

  const cancelled = await prisma.$transaction(async (transaction) => {
    const ownedRun = await transaction.modelRun.findFirst({
      where: { id: runId, comparison: { userId } },
      select: { comparisonId: true },
    });
    if (!ownedRun) {
      return false;
    }

    await transaction.$queryRaw`
      SELECT "id" FROM "comparisons"
      WHERE "id" = ${ownedRun.comparisonId}
      FOR UPDATE
    `;
    const run = await transaction.modelRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (!run || run.status === "COMPLETED" || run.status === "FAILED") {
      return false;
    }
    if (run.status === "CANCELLED") {
      return true;
    }

    const updated = await transaction.modelRun.updateMany({
      where: { id: runId, status: { in: ["PENDING", "STREAMING"] } },
      data: { status: "CANCELLED", completedAt },
    });
    if (updated.count !== 1) {
      return false;
    }

    const remaining = await transaction.modelRun.count({
      where: {
        comparisonId: ownedRun.comparisonId,
        status: { in: ["PENDING", "STREAMING"] },
      },
    });
    if (remaining === 0) {
      const [completed, failed] = await Promise.all([
        transaction.modelRun.count({
          where: {
            comparisonId: ownedRun.comparisonId,
            status: "COMPLETED",
          },
        }),
        transaction.modelRun.count({
          where: { comparisonId: ownedRun.comparisonId, status: "FAILED" },
        }),
      ]);
      const status =
        completed > 0 ? "COMPLETED" : failed > 0 ? "FAILED" : "CANCELLED";
      await transaction.comparison.update({
        where: { id: ownedRun.comparisonId },
        data: { status, completedAt },
      });
    }

    return true;
  });

  if (cancelled) {
    activeModelRunControllers.get(runId)?.abort("client_cancelled");
  }
  return cancelled;
};
