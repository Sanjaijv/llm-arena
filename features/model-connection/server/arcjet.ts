import "server-only";

import arcjet, {
  createRemoteClient,
  detectBot,
  detectPromptInjection,
  shield,
  slidingWindow,
  tokenBucket,
} from "@arcjet/next";

import { serverEnv } from "@/features/config/server-env";

export const baseArcjet = arcjet({
  client: createRemoteClient({ timeout: 2_000 }),
  key: serverEnv.ARCJET_KEY,
  rules: [shield({ mode: "LIVE" })],
});

const humanRequestArcjet = baseArcjet.withRule(
  detectBot({ mode: "LIVE", allow: [] }),
);

export const comparisonCreationArcjet = humanRequestArcjet
  .withRule(detectPromptInjection({ mode: "LIVE" }))
  .withRule(
    tokenBucket({
      mode: "LIVE",
      characteristics: ["userId"],
      refillRate: 10,
      interval: "1h",
      capacity: 30,
    }),
  );

export const modelRunArcjet = humanRequestArcjet;

export const publicThreadArcjet = baseArcjet
  .withRule(
    detectBot({
      mode: "LIVE",
      allow: [
        "CATEGORY:MONITOR",
        "CATEGORY:PREVIEW",
        "CATEGORY:SEARCH_ENGINE",
        "CATEGORY:SLACK",
        "CATEGORY:SOCIAL",
        "CATEGORY:VERCEL",
      ],
    }),
  )
  .withRule(
    slidingWindow({
      mode: "LIVE",
      characteristics: ["ip.src"],
      interval: "1m",
      max: 60,
    }),
  );

export const modelRouteArcjet = humanRequestArcjet
  .withRule(detectPromptInjection({ mode: "LIVE" }))
  .withRule(
    tokenBucket({
      mode: "LIVE",
      characteristics: ["userId"],
      refillRate: 10,
      interval: "1h",
      capacity: 30,
    }),
  );
