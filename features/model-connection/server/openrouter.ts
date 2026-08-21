import "server-only";

import { OpenRouter } from "@openrouter/sdk";

import { serverEnv } from "@/features/config/server-env";

export const FOUNDATION_MODEL = "openrouter/free";

export const openRouter = new OpenRouter({
  apiKey: serverEnv.OPENROUTER_API_KEY,
  appTitle: "LLM Arena",
});
