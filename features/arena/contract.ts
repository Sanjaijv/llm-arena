import { z } from "zod";

import { freeModelSchema } from "@/features/model-catalog/contract";

const modelIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Choose distinct models.",
  });

export const createComparisonSchema = z.object({
  clientRequestId: z.uuid(),
  threadId: z.string().min(1).nullable(),
  prompt: z.string().trim().min(1).max(8_000),
  modelIds: modelIdsSchema,
});

export const voteSchema = z.object({
  selectedRunId: z.string().min(1),
});

export const runStatusSchema = z.enum([
  "PENDING",
  "STREAMING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const comparisonResponseSchema = z.object({
  comparisonId: z.string(),
  threadId: z.string(),
  sequence: z.number().int().positive(),
  prompt: z.string(),
  runs: z.array(
    z.object({
      id: z.string(),
      position: z.number().int().nonnegative(),
      model: freeModelSchema,
    }),
  ),
});

const nullableMetricSchema = z.number().nonnegative().nullable();

export const modelStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("started"),
    runId: z.string(),
    model: z.string(),
    startedAt: z.string(),
  }),
  z.object({
    type: z.literal("delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("complete"),
    runId: z.string(),
    model: z.string(),
    durationMs: z.number().int().nonnegative(),
    timeToFirstTokenMs: nullableMetricSchema,
    usage: z.object({
      promptTokens: nullableMetricSchema,
      completionTokens: nullableMetricSchema,
      totalTokens: nullableMetricSchema,
      cost: nullableMetricSchema,
    }),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
]);

export type ComparisonResponse = z.infer<typeof comparisonResponseSchema>;
export type ModelStreamEvent = z.infer<typeof modelStreamEventSchema>;

export const threadSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  turns: z.array(
    z.object({
      comparisonId: z.string(),
      sequence: z.number().int().positive(),
      prompt: z.string(),
      voteRunId: z.string().nullable(),
      runs: z.array(
        z.object({
          id: z.string(),
          position: z.number().int().nonnegative(),
          model: freeModelSchema,
          status: runStatusSchema,
          content: z.string(),
          resolvedModel: z.string().nullable(),
          durationMs: nullableMetricSchema,
          timeToFirstTokenMs: nullableMetricSchema,
          completionTokens: nullableMetricSchema,
          totalTokens: nullableMetricSchema,
          errorCode: z.string().nullable(),
        }),
      ),
    }),
  ),
});

export type ThreadSnapshot = z.infer<typeof threadSnapshotSchema>;

export const threadListSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.iso.datetime(),
    modelRecords: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        wins: z.number().int().nonnegative(),
      }),
    ),
  }),
);

export type ThreadList = z.infer<typeof threadListSchema>;

export const THREAD_HISTORY_CHANGED_EVENT = "arena:thread-history-changed";

export const encodeModelStreamEvent = (event: ModelStreamEvent): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(event)}\n`);
