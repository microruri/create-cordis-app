import { t } from "@acme/plugin-rpc";
import { z } from "zod";

export interface Config {
  app: string;
  greeting: string;
}

export function createRouter(config: Config) {
  return t.router({
    hello: t.procedure.query(() => ({ app: config.app, message: config.greeting })),
    greet: t.procedure
      .input(z.object({ name: z.string().trim().min(1).max(80) }))
      .mutation(({ input }) => ({
        app: config.app,
        message: config.greeting + " " + input.name + "!",
      })),
  });
}

export type Router = ReturnType<typeof createRouter>;
