import {
  jsonError,
  publicThreadArcjetDenialResponse,
} from "@/features/arena/server/http";
import { getThread } from "@/features/arena/server/threads";
import { protectPublicThreadRequest } from "@/features/model-connection/server/public-thread-protection";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/threads/[threadId]">,
) {
  const decision = await protectPublicThreadRequest(request, "api");

  if (decision?.isDenied()) {
    return publicThreadArcjetDenialResponse(decision);
  }

  const { threadId } = await context.params;
  const thread = await getThread(threadId);

  return thread
    ? Response.json(thread.snapshot)
    : jsonError("That thread was not found.", 404);
}
