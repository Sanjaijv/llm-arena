import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { captureServerException } =
    await import("./features/analytics/server/events");
  await captureServerException(error, {
    request_method: request.method,
    router_kind: context.routerKind,
    route_path: context.routePath,
    route_type: context.routeType,
    render_source: context.renderSource ?? null,
    revalidate_reason: context.revalidateReason ?? null,
  });
};
