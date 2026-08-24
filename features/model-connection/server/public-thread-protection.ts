import "server-only";

import type { ArcjetDecision, ArcjetNextRequest } from "@arcjet/next";

import { publicThreadArcjet } from "./arcjet";

type PublicThreadSurface = "api" | "page";

export const protectPublicThreadRequest = async (
  request: ArcjetNextRequest,
  surface: PublicThreadSurface,
): Promise<ArcjetDecision | null> => {
  const decision = await publicThreadArcjet
    .protect(request, {
      metadata: { publicThreadSurface: surface },
    })
    .catch((error: unknown) => {
      console.error("Arcjet public-thread protection threw and failed open", {
        error,
        surface,
      });
      return null;
    });

  if (decision?.isErrored()) {
    console.error("Arcjet public-thread protection failed open", {
      reason: decision.reason,
      surface,
    });
  }

  return decision;
};
