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

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error(
        typeof signal.reason === "string" ? signal.reason : "operation_aborted",
      );

const awaitAbortable = <T>(
  operation: PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    Promise.resolve(operation).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });

const closeIteratorWithin = async (
  iterator: AsyncIterator<ChatStreamChunk> | null,
  timeoutMs: number,
): Promise<void> => {
  if (!iterator?.return) {
    return;
  }

  let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve()
        .then(() => iterator.return?.())
        .then(() => undefined)
        .catch(() => undefined),
      new Promise<void>((resolve) => {
        cleanupTimeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(cleanupTimeout);
  }
};

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

type ComparisonFinished = Readonly<{
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  totalRunCount: number;
  completedRunCount: number;
  failedRunCount: number;
  cancelledRunCount: number;
}>;

type PersistTerminalResult = Readonly<{
  persisted: boolean;
  comparisonFinished: ComparisonFinished | null;
}>;

const persistTerminalRun = async (
  run: ClaimedRun,
  terminal: TerminalRun,
): Promise<PersistTerminalResult> => {
  const completedAt = new Date();

  return prisma.$transaction(async (transaction) => {
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
      return { persisted: false, comparisonFinished: null };
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
      const cancelled =
        statuses.find(({ status }) => status === "CANCELLED")?._count._all ?? 0;
      const status =
        completed > 0 ? "COMPLETED" : failed > 0 ? "FAILED" : "CANCELLED";

      await transaction.comparison.update({
        where: { id: run.comparisonId },
        data: { status, completedAt },
      });

      return {
        persisted: true,
        comparisonFinished: {
          status,
          totalRunCount: total,
          completedRunCount: completed,
          failedRunCount: failed,
          cancelledRunCount: cancelled,
        },
      };
    }

    return { persisted: true, comparisonFinished: null };
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

const captureComparisonFinished = async (
  run: ClaimedRun,
  comparison: ComparisonFinished,
): Promise<void> =>
  captureProductEvent(run.comparison.userId, "comparison_finished", {
    thread_id: run.comparison.threadId,
    comparison_id: run.comparisonId,
    turn_sequence: run.comparison.sequence,
    status: comparison.status,
    selected_model_count: comparison.totalRunCount,
    completed_model_count: comparison.completedRunCount,
    failed_model_count: comparison.failedRunCount,
    cancelled_model_count: comparison.cancelledRunCount,
    duration_ms: Date.now() - run.comparison.createdAt.getTime(),
    vote_eligible: comparison.completedRunCount >= 2,
  });

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
      if (requestSignal.aborted) {
        abortFromRequest();
      } else {
        requestSignal.addEventListener("abort", abortFromRequest, {
          once: true,
        });
      }
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
        const messages = await awaitAbortable(
          buildConversation(run),
          abortController.signal,
        );
        providerStartedAt = performance.now();
        const upstream = await awaitAbortable(
          openRouter.chat.send(
            {
              chatRequest: {
                model: run.requestedModel,
                messages,
                maxTokens: MAX_OUTPUT_TOKENS,
                stream: true,
              },
            },
            { signal: abortController.signal },
          ),
          abortController.signal,
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
          const next = await awaitAbortable(
            iterator.next(),
            abortController.signal,
          );
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
        await closeIteratorWithin(iterator, 1_000);

        try {
          if (terminal) {
            const persisted = await persistTerminalRun(run, terminal);
            if (persisted.persisted) {
              await Promise.all([
                captureTerminalAnalytics(run, terminal),
                persisted.comparisonFinished
                  ? captureComparisonFinished(run, persisted.comparisonFinished)
                  : Promise.resolve(),
              ]);
            }

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

  const result = await prisma.$transaction(async (transaction) => {
    const ownedRun = await transaction.modelRun.findFirst({
      where: { id: runId, comparison: { userId } },
      select: {
        comparisonId: true,
        requestedModel: true,
        comparison: {
          select: { threadId: true, sequence: true, createdAt: true },
        },
      },
    });
    if (!ownedRun) {
      return { cancelled: false, analytics: null };
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
      return { cancelled: false, analytics: null };
    }
    if (run.status === "CANCELLED") {
      return { cancelled: true, analytics: null };
    }

    const updated = await transaction.modelRun.updateMany({
      where: { id: runId, status: { in: ["PENDING", "STREAMING"] } },
      data: { status: "CANCELLED", completedAt },
    });
    if (updated.count !== 1) {
      return { cancelled: false, analytics: null };
    }

    const remaining = await transaction.modelRun.count({
      where: {
        comparisonId: ownedRun.comparisonId,
        status: { in: ["PENDING", "STREAMING"] },
      },
    });
    let comparisonFinished: ComparisonFinished | null = null;
    if (remaining === 0) {
      const [completed, failed, cancelled] = await Promise.all([
        transaction.modelRun.count({
          where: {
            comparisonId: ownedRun.comparisonId,
            status: "COMPLETED",
          },
        }),
        transaction.modelRun.count({
          where: { comparisonId: ownedRun.comparisonId, status: "FAILED" },
        }),
        transaction.modelRun.count({
          where: { comparisonId: ownedRun.comparisonId, status: "CANCELLED" },
        }),
      ]);
      const status =
        completed > 0 ? "COMPLETED" : failed > 0 ? "FAILED" : "CANCELLED";
      await transaction.comparison.update({
        where: { id: ownedRun.comparisonId },
        data: { status, completedAt },
      });
      comparisonFinished = {
        status,
        totalRunCount: completed + failed + cancelled,
        completedRunCount: completed,
        failedRunCount: failed,
        cancelledRunCount: cancelled,
      };
    }

    return {
      cancelled: true,
      analytics: {
        comparisonId: ownedRun.comparisonId,
        requestedModel: ownedRun.requestedModel,
        threadId: ownedRun.comparison.threadId,
        turnSequence: ownedRun.comparison.sequence,
        comparisonCreatedAt: ownedRun.comparison.createdAt,
        comparisonFinished,
      },
    };
  });

  if (result.cancelled) {
    activeModelRunControllers.get(runId)?.abort("client_cancelled");
  }

  if (result.analytics) {
    await Promise.all([
      captureProductEvent(userId, "model_response_cancelled", {
        thread_id: result.analytics.threadId,
        comparison_id: result.analytics.comparisonId,
        model_run_id: runId,
        requested_model: result.analytics.requestedModel,
        error_code: "client_cancelled",
      }),
      result.analytics.comparisonFinished
        ? captureProductEvent(userId, "comparison_finished", {
            thread_id: result.analytics.threadId,
            comparison_id: result.analytics.comparisonId,
            turn_sequence: result.analytics.turnSequence,
            status: result.analytics.comparisonFinished.status,
            selected_model_count:
              result.analytics.comparisonFinished.totalRunCount,
            completed_model_count:
              result.analytics.comparisonFinished.completedRunCount,
            failed_model_count:
              result.analytics.comparisonFinished.failedRunCount,
            cancelled_model_count:
              result.analytics.comparisonFinished.cancelledRunCount,
            duration_ms:
              Date.now() - result.analytics.comparisonCreatedAt.getTime(),
            vote_eligible:
              result.analytics.comparisonFinished.completedRunCount >= 2,
          })
        : Promise.resolve(),
    ]);
  }

  return result.cancelled;
};
