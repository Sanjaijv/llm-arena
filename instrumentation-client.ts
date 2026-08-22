import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken || !host) {
  throw new Error("Missing PostHog browser environment variables.");
}

// Exception autocapture also records the Next.js dev overlay, so a local
// compile error opens an error tracking issue. Keep it off in development.
posthog.init(projectToken, {
  api_host: host,
  capture_exceptions: process.env.NODE_ENV !== "development",
  capture_heatmaps: true,
  defaults: "2026-05-30",
  disable_session_recording: false,
});
