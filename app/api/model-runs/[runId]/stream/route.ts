import { auth } from "@clerk/nextjs/server";

import { arcjetDenialResponse, jsonError } from "@/features/arena/server/http";
import {
  claimModelRun,
  cancelModelRun,
  createClaimedModelRunStream,
} from "@/features/arena/server/model-runs";
import { modelRunArcjet } from "@/features/model-connection/server/arcjet";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/model-runs/[runId]/stream">,
) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return jsonError("Sign in to run a model.", 401);
  }

  const { runId } = await context.params;
  const decision = await modelRunArcjet
    .protect(request, {
      userId,
      correlationId: runId,
      metadata: { modelRunId: runId },
    })
    .catch((error: unknown) => {
      console.error("Arcjet model-run protection threw and failed open", {
        runId,
        error,
      });
      return null;
    });

  if (decision?.isErrored()) {
    console.error("Arcjet model-run protection failed open", {
      runId,
      reason: decision.reason,
    });
  }

  if (decision?.isDenied()) {
    return arcjetDenialResponse(decision);
  }

  const run = await claimModelRun(userId, runId);

  if (!run) {
    return jsonError(
      "This model run is unavailable or has already been started.",
      409,
    );
  }

  return new Response(createClaimedModelRunStream(run, request.signal), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/model-runs/[runId]/stream">,
) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    return jsonError("Sign in to cancel a model.", 401);
  }

  const { runId } = await context.params;
  const cancelled = await cancelModelRun(userId, runId);
  return cancelled
    ? Response.json({ status: "CANCELLED" })
    : jsonError("This model run can no longer be cancelled.", 409);
}
