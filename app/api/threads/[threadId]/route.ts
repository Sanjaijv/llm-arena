import { jsonError } from "@/features/arena/server/http";
import { getThread } from "@/features/arena/server/threads";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/threads/[threadId]">,
) {
  const { threadId } = await context.params;
  const thread = await getThread(threadId);

  return thread
    ? Response.json(thread.snapshot)
    : jsonError("That thread was not found.", 404);
}
