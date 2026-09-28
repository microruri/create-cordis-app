import type { Context } from "cordis";
import type { Request as ServerRequest, Response as ServerResponse } from "@cordisjs/plugin-server";

export function toRequest(ctx: Context, req: ServerRequest, res: ServerResponse) {
  const controller = new AbortController();
  const dispose = ctx.effect(() => () => {
    res._res.off("close", dispose);
    controller.abort();
  });
  res._res.once("close", dispose);
  const init: RequestInit & { duplex: "half" } = {
    method: req.method,
    headers: req.headers,
    signal: controller.signal,
    duplex: "half",
  };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = req.body;
  return new Request(new URL(req.url, ctx.server.baseUrl), init);
}
