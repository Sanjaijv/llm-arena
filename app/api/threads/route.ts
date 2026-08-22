import { auth } from "@clerk/nextjs/server";

import { jsonError } from "@/features/arena/server/http";
import { listThreads } from "@/features/arena/server/threads";

export const runtime = "nodejs";

export async function GET() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    return jsonError("Sign in to view threads.", 401);
  }

  const threads = await listThreads(userId);
  return Response.json(
    threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt.toISOString(),
      modelRecords: thread.modelRecords,
    })),
  );
}
