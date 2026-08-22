import { auth } from "@clerk/nextjs/server";

import { createComparisonSchema } from "@/features/arena/contract";
import {
  ComparisonConflictError,
  createComparison,
  findIdempotentComparison,
} from "@/features/arena/server/comparisons";
import {
  arcjetDenialResponse,
  jsonError,
  parseJson,
} from "@/features/arena/server/http";
import { validateFreeModelSelection } from "@/features/model-catalog/server/catalog";
import { comparisonCreationArcjet } from "@/features/model-connection/server/arcjet";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return jsonError("Sign in to send a prompt.", 401);
  }

  const parsedBody = createComparisonSchema.safeParse(await parseJson(request));

  if (!parsedBody.success) {
    return jsonError(
      "Enter a prompt and choose between one and three distinct models.",
      400,
    );
  }

  try {
    const existing = await findIdempotentComparison(userId, parsedBody.data);
    if (existing) {
      return Response.json(existing);
    }
  } catch (error: unknown) {
    if (error instanceof ComparisonConflictError) {
      return jsonError(error.message, 409);
    }
    console.error("Idempotency lookup failed", {
      clientRequestId: parsedBody.data.clientRequestId,
      error,
    });
    return jsonError("The comparison could not be created. Try again.", 500);
  }

  const decision = await comparisonCreationArcjet
    .protect(request, {
      userId,
      requested: parsedBody.data.modelIds.length,
      detectPromptInjectionMessage: parsedBody.data.prompt,
      correlationId: parsedBody.data.clientRequestId,
      metadata: {
        selectedModelCount: parsedBody.data.modelIds.length,
      },
    })
    .catch((error: unknown) => {
      console.error("Arcjet comparison protection threw and failed open", {
        clientRequestId: parsedBody.data.clientRequestId,
        error,
      });
      return null;
    });

  if (decision?.isErrored()) {
    console.error("Arcjet comparison protection failed open", {
      clientRequestId: parsedBody.data.clientRequestId,
      reason: decision.reason,
    });
  }

  if (decision?.isDenied()) {
    return arcjetDenialResponse(decision);
  }

  const models = await validateFreeModelSelection(
    parsedBody.data.modelIds,
  ).catch((error: unknown) => {
    console.error("Free model catalog validation failed", {
      clientRequestId: parsedBody.data.clientRequestId,
      error,
    });
    return null;
  });

  if (!models) {
    return jsonError(
      "The free model list changed. Refresh and choose your models again.",
      409,
    );
  }

  try {
    const comparison = await createComparison(userId, {
      clientRequestId: parsedBody.data.clientRequestId,
      threadId: parsedBody.data.threadId,
      prompt: parsedBody.data.prompt,
      models,
    });

    return Response.json(comparison, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ComparisonConflictError) {
      return jsonError(error.message, 409);
    }

    console.error("Comparison creation failed", {
      clientRequestId: parsedBody.data.clientRequestId,
      error,
    });
    return jsonError("The comparison could not be created. Try again.", 500);
  }
}
