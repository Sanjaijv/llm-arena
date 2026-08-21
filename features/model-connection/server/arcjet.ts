import "server-only";

import arcjet, {
  createRemoteClient,
  detectBot,
  detectPromptInjection,
  shield,
  tokenBucket,
} from "@arcjet/next";

import { serverEnv } from "@/features/config/server-env";

const baseArcjet = arcjet({
  client: createRemoteClient({ timeout: 2_000 }),
  key: serverEnv.ARCJET_KEY,
  rules: [shield({ mode: "LIVE" })],
});

export const modelRouteArcjet = baseArcjet
  .withRule(detectBot({ mode: "LIVE", allow: [] }))
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
