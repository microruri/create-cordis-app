import { FiberState, type Context } from "cordis";
import type {} from "@cordisjs/plugin-server";
import type {} from "@cordisjs/plugin-loader";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Socket } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import sirv from "sirv";
import { discover } from "./discover.ts";
import type { WebState } from "./shared.ts";

export const name = "@acme/plugin-web";
export const inject = ["server", "loader"];
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
  const revisions = new Map<string, number>();
  let names: string[] = [];
  let previous = "";
  const subscribers = new Set<(state: WebState) => void>();
  const snapshot = (): WebState => {
    const active = new Set(
      [...ctx.loader.entries()]
        .filter((entry) => !entry.disabled && entry.fiber?.state === FiberState.ACTIVE)
        .map((entry) => entry.options.name),
    );
    return {
      title: config.title ?? "Cordis",
      plugins: names
        .filter((name) => active.has(name))
        .map((name) => ({ name, revision: revisions.get(name) ?? 0 })),
    };
  };
  const publish = () => {
    const state = snapshot();
    const serialized = JSON.stringify(state);
    if (serialized === previous) return;
    previous = serialized;
    for (const send of subscribers) send(state);
  };
  ctx.on(
    "internal/status",
    (fiber) => {
      const name = fiber.entry?.options.name;
      if (name && names.includes(name) && fiber.state === FiberState.ACTIVE) {
        revisions.set(name, (revisions.get(name) ?? 0) + 1);
      }
      publish();
    },
    { global: true },
  );
  ctx.on("loader/config-update", publish);

  let middleware: Middleware;
  if (config.development) {
    const { development } = await import("./dev.ts");
    middleware = await development(ctx, appRoot, (next) => {
      names = next;
      publish();
    });
  } else {
    const discovered = await discover(appRoot);
    names = discovered.plugins.map(({ name }) => name);
    const root = join(appRoot, "dist/client");
    if (!existsSync(join(root, "index.html")))
      throw new Error("Missing web build. Run pnpm build before pnpm start.");
    const built: string[] = JSON.parse(
      await readFile(join(appRoot, "dist/web-manifest.json"), "utf8"),
    );
    const missing = names.filter((name) => !built.includes(name));
    if (missing.length)
      throw new Error(`Frontend plugins are not built: ${missing.join(", ")}. Run pnpm build.`);
    middleware = sirv(root, {
      single: true,
      etag: true,
      ignores: [/^\/api(?:\/|$)/, /^\/healthz$/, /\/\./],
      setHeaders(response, pathname) {
        response.setHeader(
          "Cache-Control",
          pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    });
  }

  ctx.server.get("/api/web/events", async (_req, res) => {
    let dispose = () => {};
    let cancelled = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (state: WebState) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
        const timer = setInterval(
          () => controller.enqueue(encoder.encode(": heartbeat\n\n")),
          15000,
        );
        timer.unref();
        dispose = ctx.effect(() => {
          subscribers.add(send);
          return () => {
            subscribers.delete(send);
            clearInterval(timer);
            res._res.off("close", dispose);
            if (!cancelled) controller.close();
          };
        });
        res._res.once("close", dispose);
        send(snapshot());
      },
      cancel() {
        cancelled = true;
        dispose();
      },
    });
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "close",
        "x-accel-buffering": "no",
      },
    });
  });

  const connections = new Set<Socket>();
  ctx.effect(() => () => {
    for (const socket of connections) socket.destroy();
  });
  ctx.server.use(async (req, res, next) => {
    const socket = req._req.socket;
    if (!connections.has(socket)) {
      connections.add(socket);
      socket.once("close", () => connections.delete(socket));
    }
    if (!["GET", "HEAD"].includes(req.method) || /^\/(api(?:\/|$)|healthz$)/.test(req.path))
      return next();
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        res._res.off("finish", finish);
        res._res.off("close", finish);
        resolve();
      };
      res._res.once("finish", finish);
      res._res.once("close", finish);
      middleware(req._req, res._res, (error) => {
        res._res.off("finish", finish);
        res._res.off("close", finish);
        if (error) reject(error);
        else next().then(resolve, reject);
      });
    });
  });
}
