import "server-only";

import { PostHog } from "posthog-node";

import { serverEnv } from "@/features/config/server-env";

export const createPostHogServerClient = () =>
  new PostHog(serverEnv.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    host: serverEnv.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    // Analytics must never hold an application request open. In particular,
    // the SDK retries immediate captures by default, which can turn a slow
    // ingestion endpoint into a minute-long user-facing delay.
    requestTimeout: 2_000,
    fetchRetryCount: 0,
  });
