import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken || !host) {
  throw new Error("Missing PostHog browser environment variables.");
}

posthog.init(projectToken, {
  api_host: host,
  capture_heatmaps: true,
  capture_exceptions: true,
  capture_performance: {
    web_vitals: true,
  },
  defaults: "2026-05-30",
  disable_session_recording: false,
  person_profiles: "identified_only",
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: "[data-private]",
  },
});
