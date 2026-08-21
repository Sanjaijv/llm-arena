import { z } from "zod";

export const modelRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
});

export type ModelStreamEvent =
  | Readonly<{
      type: "started";
      model: string;
      startedAt: string;
    }>
  | Readonly<{
      type: "delta";
      text: string;
    }>
  | Readonly<{
      type: "complete";
      model: string;
      durationMs: number;
      timeToFirstTokenMs: number | null;
      usage: Readonly<{
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        cost: number;
      }>;
    }>
  | Readonly<{
      type: "error";
      message: string;
      retryable: boolean;
    }>;

export const encodeModelStreamEvent = (event: ModelStreamEvent): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(event)}\n`);
