import { t } from "@acme/plugin-rpc";
import { TRPCError } from "@trpc/server";
import {
  createTodoInput,
  deleteTodoInput,
  TodoNotFoundError,
  updateTodoInput,
  type Todos,
} from "./service.ts";

function notFound(error: unknown): never {
  if (error instanceof TodoNotFoundError)
    throw new TRPCError({ code: "NOT_FOUND", message: "Todo not found." });
  throw error;
}

export function createRouter(todos: Todos) {
  return t.router({
    list: t.procedure.query(() => todos.list()),
    create: t.procedure.input(createTodoInput).mutation(({ input }) => todos.create(input)),
    update: t.procedure.input(updateTodoInput).mutation(async ({ input }) => {
      try {
        return await todos.update(input);
      } catch (error) {
        notFound(error);
      }
    }),
    delete: t.procedure.input(deleteTodoInput).mutation(async ({ input }) => {
      try {
        return await todos.delete(input);
      } catch (error) {
        notFound(error);
      }
    }),
  });
}
export type Router = ReturnType<typeof createRouter>;
