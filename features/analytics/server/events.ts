import "server-only";

import { createPostHogServerClient } from "./posthog";

type AnalyticsProperties = Readonly<
  Record<string, boolean | number | string | null>
>;

export const captureProductEvent = async (
  distinctId: string,
  event: string,
  properties: AnalyticsProperties,
): Promise<void> => {
  const posthog = createPostHogServerClient();

  try {
    await posthog.captureImmediate({ distinctId, event, properties });
  } catch (error: unknown) {
    console.error("PostHog product event failed", { event, error });
  } finally {
    await posthog.shutdown(2_000).catch(() => undefined);
  }
};

type GenerationEvent = Readonly<{
  userId: string;
  threadId: string;
  comparisonId: string;
  runId: string;
  requestedModel: string;
  resolvedModel: string;
  latencySeconds: number;
  timeToFirstTokenSeconds: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  isError: boolean;
  errorCode: string | null;
}>;

export const captureGenerationEvent = async (
  generation: GenerationEvent,
): Promise<void> => {
  const posthog = createPostHogServerClient();

  try {
    await posthog.captureAiImmediate({
      distinctId: generation.userId,
      event: "$ai_generation",
      properties: {
        $ai_trace_id: generation.comparisonId,
        $ai_session_id: generation.threadId,
        $ai_span_id: generation.runId,
        $ai_provider: "openrouter",
        $ai_model: generation.resolvedModel,
        $ai_requested_model: generation.requestedModel,
        $ai_stream: true,
        $ai_latency: generation.latencySeconds,
        $ai_time_to_first_token: generation.timeToFirstTokenSeconds,
        $ai_input_tokens: generation.promptTokens,
        $ai_output_tokens: generation.completionTokens,
        $ai_total_cost_usd: generation.costUsd,
        $ai_is_error: generation.isError,
        $ai_error: generation.errorCode,
        comparison_id: generation.comparisonId,
        model_run_id: generation.runId,
        privacy_mode: true,
      },
    });
  } catch (error: unknown) {
    console.error("PostHog AI generation event failed", {
      comparisonId: generation.comparisonId,
      runId: generation.runId,
      error,
    });
  } finally {
    await posthog.shutdown(2_000).catch(() => undefined);
  }
};
