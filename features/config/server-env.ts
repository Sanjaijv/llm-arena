import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  ARCJET_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z.url(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_HOST: z.url(),
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
});

const parsedServerEnv = serverEnvSchema.safeParse(process.env);

if (!parsedServerEnv.success) {
  const missingNames = parsedServerEnv.error.issues
    .map(({ path }) => path.join("."))
    .filter(Boolean)
    .join(", ");

  throw new Error(`Missing or invalid environment variables: ${missingNames}`);
}

export const serverEnv = Object.freeze(parsedServerEnv.data);
