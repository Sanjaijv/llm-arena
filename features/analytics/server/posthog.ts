import "server-only";

import { PostHog } from "posthog-node";

import { serverEnv } from "@/features/config/server-env";

export const createPostHogServerClient = () =>
  new PostHog(serverEnv.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    host: serverEnv.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
