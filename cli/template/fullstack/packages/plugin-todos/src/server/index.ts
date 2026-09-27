import type { Context } from "cordis";
import type {} from "@acme/plugin-rpc";
import type {} from "@acme/plugin-database";
import { createRouter } from "./router.ts";

export const name = "@acme/plugin-todos";
export const inject = ["rpc", "database"];
export function apply(ctx: Context) {
  ctx.rpc.register("todos", createRouter(ctx.database.db));
}
