import { Context, Service } from "cordis";
import type {} from "@cordisjs/plugin-server";
import { initTRPC, type AnyTRPCRouter } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { toRequest } from "./http.ts";

declare module "cordis" {
  interface Context {
    rpc: Rpc;
  }
}

export const t = initTRPC.context<{ cordis: Context; request: Request }>().create();

export interface Config {
  app: string;
  prefix: string;
}

export default class Rpc extends Service {
  static inject = ["server"];
  private config: Config;
  private plugins = new Map<string, { router: AnyTRPCRouter; ctx: Context }>();

  constructor(ctx: Context, config: Config) {
    super(ctx, "rpc");
    this.config = config;
    ctx.server.get("/healthz", async (_req, res) => {
      res.json({ ok: true, app: config.app, pid: process.pid });
    });
  }

  register(id: string, router: AnyTRPCRouter) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`Invalid RPC plugin id: ${id}`);
    if (this.plugins.has(id)) throw new Error(`RPC plugin already registered: ${id}`);
    const ctx = this.ctx;
    const endpoint = `${this.config.prefix}/trpc/${id}`;
    const route = ctx.server.all(`${endpoint}{/*path}`, async (req, res) => {
      return fetchRequestHandler({
        endpoint,
        req: toRequest(ctx, req, res),
        router,
        createContext: ({ req: request }) => ({ cordis: ctx, request }),
        onError: ({ error }) => {
          if (error.code === "INTERNAL_SERVER_ERROR") ctx.logger.error(error);
        },
      });
    });
    return ctx.effect(() => {
      this.plugins.set(id, { router, ctx });
      return () => {
        route.dispose();
        this.plugins.delete(id);
      };
    });
  }

  caller<TRouter extends AnyTRPCRouter>(id: string, request: Request) {
    const entry = this.plugins.get(id);
    if (!entry) throw new Error(`RPC plugin unavailable: ${id}`);
    return entry.router.createCaller({ cordis: entry.ctx, request }) as ReturnType<
      TRouter["createCaller"]
    >;
  }
}
