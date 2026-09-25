import type { Context } from "cordis";
import { ValidationError } from "@cordisjs/plugin-server";
import { createMessage } from "./message.ts";

export const name = "@acme/plugin-hello-b";
export const inject = ["server"];

export interface Config {
  app: string;
  greeting: string;
}

export function apply(ctx: Context, config: Config) {
  ctx.server.use(async (_request, response, next) => {
    try {
      await next();
      if (response.status === 404 && response.body === null) {
        response.json({ error: "Not found" });
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      ctx.logger?.error(error);
      response.status = 500;
      response.json({ error: "Internal server error" });
    }
  });

  ctx.server.get("/healthz", async (_request, response) => {
    response.json({ ok: true, app: config.app, pid: process.pid });
  });
  ctx.server.get("/api/hello", async (_request, response) => {
    response.json(createMessage(config.app, config.greeting));
  });
}
