import "server-only";

import type { ChatStreamChunk } from "@openrouter/sdk/models/chatstreamchunk.js";
import type { ChatUsage } from "@openrouter/sdk/models/chatusage.js";

import {
  encodeModelStreamEvent,
  type ModelStreamEvent,
} from "@/features/model-connection/contract";
import {
  FOUNDATION_MODEL,
  openRouter,
} from "@/features/model-connection/server/openrouter";

const EMPTY_USAGE = Object.freeze({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cost: 0,
});

const toUsage = (usage: ChatUsage | undefined) =>
  usage
    ? Object.freeze({
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        cost: usage.cost ?? 0,
      })
    : EMPTY_USAGE;

const safeStreamError = (): ModelStreamEvent => ({
  type: "error",
  message: "This model stopped responding. Please retry it.",
  retryable: true,
});

const isChatStream = (
  value: unknown,
): value is AsyncIterable<ChatStreamChunk> =>
  typeof value === "object" &&
  value !== null &&
  Symbol.asyncIterator in value;

export const createModelResponseStream = (
  prompt: string,
  signal: AbortSignal,
): ReadableStream<Uint8Array> => {
  const startedAtIso = new Date().toISOString();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let providerStartedAt = performance.now();
      let firstTokenAt: number | null = null;
      let finalUsage: ChatUsage | undefined;
      let resolvedModel = FOUNDATION_MODEL;

      controller.enqueue(
        encodeModelStreamEvent({
          type: "started",
          model: FOUNDATION_MODEL,
          startedAt: startedAtIso,
        }),
      );

      try {
        providerStartedAt = performance.now();
        const upstream = await openRouter.chat.send(
          {
            chatRequest: {
              model: FOUNDATION_MODEL,
              messages: [{ role: "user", content: prompt }],
              stream: true,
            },
          },
          { signal },
        );

        if (!isChatStream(upstream)) {
          throw new Error("OpenRouter returned a non-streaming response");
        }

        for await (const chunk of upstream) {
          if (signal.aborted) {
            break;
          }

          resolvedModel = chunk.model || resolvedModel;
          finalUsage = chunk.usage ?? finalUsage;

          if (chunk.error) {
            throw new Error(`OpenRouter stream error ${chunk.error.code}`);
          }

          const text = chunk.choices[0]?.delta.content;

          if (text) {
            firstTokenAt ??= performance.now();
            controller.enqueue(encodeModelStreamEvent({ type: "delta", text }));
          }
        }

        if (!signal.aborted) {
          const finishedAt = performance.now();
          controller.enqueue(
            encodeModelStreamEvent({
              type: "complete",
              model: resolvedModel,
              durationMs: Math.round(finishedAt - providerStartedAt),
              timeToFirstTokenMs:
                firstTokenAt === null
                  ? null
                  : Math.round(firstTokenAt - providerStartedAt),
              usage: toUsage(finalUsage),
            }),
          );
        }
      } catch (error: unknown) {
        if (!signal.aborted) {
          console.error("Model stream failed", error);
          controller.enqueue(encodeModelStreamEvent(safeStreamError()));
        }
      } finally {
        controller.close();
      }
    },
  });
};
