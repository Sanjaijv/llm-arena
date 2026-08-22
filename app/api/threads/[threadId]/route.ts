import { auth } from "@clerk/nextjs/server";

import { jsonError } from "@/features/arena/server/http";
import { getThreadSnapshot } from "@/features/arena/server/threads";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/threads/[threadId]">,
) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    return jsonError("Sign in to view this thread.", 401);
  }

  const { threadId } = await context.params;
  const thread = await getThreadSnapshot(userId, threadId);

  return thread
    ? Response.json(thread)
    : jsonError("That thread was not found.", 404);
}
