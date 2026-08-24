import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { serverEnv } from "@/features/config/server-env";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// A comparison runs up to three model runs at once, and each terminal write
// briefly holds a connection while it waits on the same FOR UPDATE row lock.
// Give the pool and the interactive-transaction timers room above their low
// defaults so contention retries instead of timing out.
const DATABASE_POOL_SIZE = 10;
const TRANSACTION_MAX_WAIT_MS = 5_000;
const TRANSACTION_TIMEOUT_MS = 15_000;

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: serverEnv.DATABASE_URL,
      max: DATABASE_POOL_SIZE,
    }),
    transactionOptions: {
      maxWait: TRANSACTION_MAX_WAIT_MS,
      timeout: TRANSACTION_TIMEOUT_MS,
    },
  });

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
