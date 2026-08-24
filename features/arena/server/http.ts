import "server-only";

export const jsonError = (message: string, status: number): Response =>
  Response.json({ message }, { status });

export const parseJson = async (request: Request): Promise<unknown> =>
  request
    .clone()
    .json()
    .catch(() => null);

export const arcjetDenialResponse = (decision: {
  reason: {
    isRateLimit(): boolean;
    isPromptInjection(): boolean;
  };
}): Response => {
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
};

export const publicThreadArcjetDenialResponse = (decision: {
  reason: { isRateLimit(): boolean };
}): Response =>
  decision.reason.isRateLimit()
    ? jsonError("Too many thread requests. Please try again shortly.", 429)
    : jsonError("This request was blocked. Please try again.", 403);
