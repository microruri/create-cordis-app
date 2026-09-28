import type { Context } from "cordis";
import type {} from "@acme/plugin-rpc";
import { createRouter, type Config } from "./router.ts";

export const name = "@acme/plugin-hello-b";
export const inject = ["rpc"];
export type { Config };

export function apply(ctx: Context, config: Config) {
  ctx.rpc.register("hello-b", createRouter(config));
}
