import { auth } from "@clerk/nextjs/server";

import { modelRequestSchema } from "@/features/model-connection/contract";
import { modelRouteArcjet } from "@/features/model-connection/server/arcjet";
import { createModelResponseStream } from "@/features/model-connection/server/stream-response";

export const runtime = "nodejs";

const jsonError = (message: string, status: number) =>
  Response.json({ message }, { status });

export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return jsonError("Sign in to send a prompt.", 401);
  }

  const parsedBody = modelRequestSchema.safeParse(
    await request
      .clone()
      .json()
      .catch(() => null),
  );

  if (!parsedBody.success) {
    return jsonError("Enter a prompt between 1 and 8,000 characters.", 400);
  }

  const decision = await modelRouteArcjet
    .protect(request, {
      userId,
      requested: 1,
      detectPromptInjectionMessage: parsedBody.data.prompt,
    })
    .catch((error: unknown) => {
      console.error("Arcjet protection threw and failed open", error);
      return null;
    });

  if (decision?.isErrored()) {
    console.error("Arcjet protection failed open", decision.reason);
  }

  if (decision?.isDenied()) {
    if (decision.reason.isRateLimit()) {
      return jsonError(
        "You’ve reached the model limit. Please try again later.",
        429,
      );
    }

    if (decision.reason.isPromptInjection()) {
      return jsonError(
        "That prompt could not be sent safely. Please revise it.",
        400,
      );
    }

    return jsonError("This request was blocked. Please try again.", 403);
  }

  return new Response(
    createModelResponseStream(parsedBody.data.prompt, request.signal),
    {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
