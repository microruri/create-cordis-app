import type { Context } from "cordis";
import type { Request as ServerRequest, Response as ServerResponse } from "@cordisjs/plugin-server";

const nativeRequests = new WeakMap<Request, { req: ServerRequest; res: ServerResponse }>();

/** Access the original HTTP objects inside the backend handling this request. */
export function nativeRequest(request: Request) {
  const native = nativeRequests.get(request);
  if (!native) throw new Error("Native HTTP request is unavailable.");
  return native;
}

export function toRequest(ctx: Context, req: ServerRequest, res: ServerResponse) {
  const controller = new AbortController();
  const dispose = ctx.effect(() => () => {
    res._res.off("close", dispose);
    controller.abort();
  });
  res._res.once("close", dispose);
  if (res._res.destroyed) dispose();
  const init: RequestInit & { duplex: "half" } = {
    method: req.method,
    headers: req.headers,
    signal: controller.signal,
    duplex: "half",
  };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = req.body;
  const request = new Request(new URL(req.url, ctx.server.baseUrl), init);
  nativeRequests.set(request, { req, res });
  return request;
}
