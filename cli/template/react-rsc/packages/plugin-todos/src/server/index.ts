import type { Context } from "cordis";
import type {} from "@acme/plugin-rpc";
import type {} from "@acme/plugin-database";
import { Todos } from "./service.ts";
import { createRouter } from "./router.ts";

export const name = "@acme/plugin-todos";
export const inject = ["database"];

export {
  Todos,
  TodoNotFoundError,
  createTodoInput,
  updateTodoInput,
  deleteTodoInput,
} from "./service.ts";
export type { CreateTodoInput, UpdateTodoInput, DeleteTodoInput, TodoOptions } from "./service.ts";
export type { Router } from "./router.ts";

export function apply(ctx: Context) {
  ctx.provide("todos", new Todos(ctx));
  ctx.inject(["rpc"], (rpcCtx) => {
    rpcCtx.rpc.register("todos", createRouter(rpcCtx.todos));
  });
}
