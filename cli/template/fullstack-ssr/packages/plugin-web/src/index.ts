import { FiberState, type Context } from "cordis";
import type {} from "@cordisjs/plugin-server";
import type {} from "@cordisjs/plugin-loader";
import type {} from "@acme/plugin-rpc";
import { toRequest } from "@acme/plugin-rpc/http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import type { Socket } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { renderPage } from "vike/server";
import sirv from "sirv";
import { discover } from "./discover.ts";
import type { WebState } from "./types.ts";

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
  if (config.development) {
    const { development } = await import("./dev.ts");
    middleware = await development(ctx, appRoot);
  } else {
    const discovered = await discover(appRoot);
    const entry = join(appRoot, "dist/web/server/entry.mjs");
    if (!existsSync(entry)) throw new Error("Missing SSR build. Run pnpm build before pnpm start.");
    const built: string[] = JSON.parse(
      await readFile(join(appRoot, "dist/web-manifest.json"), "utf8"),
    );
    const missing = discovered.plugins.filter(({ name }) => !built.includes(name));
    if (missing.length)
      throw new Error(
        "Frontend plugins are not built: " + missing.map(({ name }) => name).join(", "),
      );
    await import(pathToFileURL(entry).href);
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
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        res._res.off("finish", finish);
        res._res.off("close", finish);
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      res._res.once("finish", finish);
      res._res.once("close", finish);
      middleware(req._req, res._res, (error) => {
        if (error) {
          cleanup();
          reject(error);
          return;
        }
        void (async () => {
          // Missing assets and dotfiles must not become HTML pages.
          if (/\/(?:\.|assets\/)/.test(req.path)) {
            res._res.statusCode = 404;
            res._res.end();
            return;
          }
          const request = toRequest(ctx, req, res);
          const { httpResponse } = await renderPage({
            urlOriginal: req.url,
            headersOriginal: req._req.headers,
            cordis: ctx,
            request,
            web: snapshot(),
          });
          if (res._res.destroyed) return;
          res._res.statusCode = httpResponse.statusCode;
          for (const [key, value] of httpResponse.headers) res._res.appendHeader(key, value);
          res._res.setHeader("Cache-Control", "no-store");
          if (req.method === "HEAD") res._res.end();
          else res._res.end(httpResponse.body);
        })().catch((cause) => {
          ctx.logger.error(cause);
          if (res._res.destroyed) return;
          if (!res._res.headersSent) res._res.statusCode = 500;
          res._res.end("Internal server error");
        });
      });
    });
  });
}
