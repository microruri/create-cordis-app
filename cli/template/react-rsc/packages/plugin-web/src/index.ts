import { FiberState, type Context } from "cordis";
import type {} from "@cordisjs/plugin-server";
import type {} from "@cordisjs/plugin-loader";
import type {} from "@acme/plugin-rpc";
import { toRequest } from "@acme/plugin-rpc/http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import type { Socket } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import sirv from "sirv";
import { discover } from "./discover.ts";
import type { ServerEntry, WebState } from "./types.ts";

export const name = "@acme/plugin-web";
export const inject = ["server", "loader", "rpc"];
export interface Config {
  title?: string;
  development?: boolean;
}
type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

export async function apply(ctx: Context, config: Config) {
  const appRoot = fileURLToPath(new URL("./", ctx.baseUrl));
  let middleware: Middleware;
  let entry: () => Promise<ServerEntry>;
  if (config.development) {
    const { development } = await import("./dev.ts");
    const dev = await development(ctx, appRoot);
    middleware = dev.vite.middlewares;
    entry = dev.entry;
  } else {
    const discovered = await discover(appRoot);
    const path = join(appRoot, "dist/web/rsc/index.js");
    if (!existsSync(path)) throw new Error("Missing RSC build. Run pnpm build before pnpm start.");
    const built: string[] = JSON.parse(
      await readFile(join(appRoot, "dist/web-manifest.json"), "utf8"),
    );
    const missing = discovered.plugins.filter(({ name }) => !built.includes(name));
    if (missing.length)
      throw new Error(
        "Frontend plugins are not built: " + missing.map(({ name }) => name).join(", "),
      );
    const server: ServerEntry = await import(pathToFileURL(path).href);
    server.validate();
    entry = async () => server;
    middleware = sirv(join(appRoot, "dist/web/client"), {
      etag: true,
      setHeaders(response, pathname) {
        response.setHeader(
          "Cache-Control",
          pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    });
  }
  function snapshot(): WebState {
    return {
      title: config.title ?? "Cordis",
      activePlugins: [...ctx.loader.entries()]
        .filter((entry) => !entry.disabled && entry.fiber?.state === FiberState.ACTIVE)
        .map((entry) => entry.options.name),
    };
  }
  const connections = new Set<Socket>();
  ctx.effect(() => () => {
    for (const socket of connections) socket.destroy();
  });
  ctx.server.use(async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || /^\/(api(?:\/|$)|healthz$)/.test(req.path))
      return next();
    const socket = req._req.socket;
    if (!connections.has(socket)) {
      connections.add(socket);
      socket.once("close", () => connections.delete(socket));
    }
    let request: Request | undefined;
    const render = async () => {
      if (/\/(?:\.|assets(?:\/|$)|@)/.test(req.path)) {
        res._res.statusCode = 404;
        res._res.end();
        return;
      }
      request = toRequest(ctx, req, res);
      const response = await (await entry()).render({ cordis: ctx, request, web: snapshot() });
      if (res._res.destroyed) {
        await response.body?.cancel();
        return;
      }
      res._res.statusCode = response.status;
      for (const [key, value] of response.headers)
        if (key !== "set-cookie") res._res.setHeader(key, value);
      for (const cookie of response.headers.getSetCookie())
        res._res.appendHeader("Set-Cookie", cookie);
      if (!response.body || req.method === "HEAD") {
        res._res.end();
        await response.body?.cancel();
        return;
      }
      await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), res._res, {
        signal: request.signal,
      });
    };
    const fail = (error: unknown) => {
      if (request?.signal.aborted || res._res.destroyed) return;
      ctx.logger.error(error);
      if (res._res.headersSent) {
        res._res.destroy();
        return;
      }
      res._res.statusCode = 500;
      res._res.setHeader("Cache-Control", "no-store");
      res._res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res._res.end("Internal server error");
    };
    await new Promise<void>((resolve) => {
      const finish = () => {
        res._res.off("finish", finish);
        res._res.off("close", finish);
        resolve();
      };
      res._res.once("finish", finish);
      res._res.once("close", finish);
      middleware(req._req, res._res, (error) => {
        if (error) fail(error);
        else void render().catch(fail);
      });
    });
  });
}
