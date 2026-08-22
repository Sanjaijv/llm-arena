import { auth } from "@clerk/nextjs/server";

import { voteSchema } from "@/features/arena/contract";
import { jsonError, parseJson } from "@/features/arena/server/http";
import {
  castVote,
  VoteConflictError,
  VoteEligibilityError,
} from "@/features/arena/server/votes";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/comparisons/[comparisonId]/vote">,
) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    return jsonError("Sign in to vote.", 401);
  }

  const parsedBody = voteSchema.safeParse(await parseJson(request));
  if (!parsedBody.success) {
    return jsonError("Choose a completed answer.", 400);
  }

  const { comparisonId } = await context.params;

  try {
    const vote = await castVote(
      userId,
      comparisonId,
      parsedBody.data.selectedRunId,
    );
    return Response.json({ selectedRunId: vote.selectedRunId });
  } catch (error: unknown) {
    if (error instanceof VoteConflictError) {
      return jsonError(error.message, 409);
    }
    if (error instanceof VoteEligibilityError) {
      return jsonError(error.message, 400);
    }

    console.error("Vote creation failed", { comparisonId, error });
    return jsonError("Your vote could not be saved. Try again.", 500);
  }
}
