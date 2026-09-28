import { t } from "@acme/plugin-rpc";
import type Database from "@acme/plugin-database";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { todos } from "./schema.ts";

const title = z.string().trim().min(1).max(200);
export function createRouter(db: Database["db"]) {
  return t.router({
    list: t.procedure.query(() =>
      db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id)),
    ),
    create: t.procedure.input(z.object({ title })).mutation(async ({ input }) => {
      const [todo] = await db.insert(todos).values(input).returning();
      return todo!;
    }),
    update: t.procedure
      .input(
        z
          .object({
            id: z.uuid(),
            title: title.optional(),
            completed: z.boolean().optional(),
          })
          .refine(
            (input) => input.title !== undefined || input.completed !== undefined,
            "No changes provided",
          ),
      )
      .mutation(async ({ input: { id, ...values } }) => {
        const [todo] = await db.update(todos).set(values).where(eq(todos.id, id)).returning();
        if (!todo) throw new TRPCError({ code: "NOT_FOUND", message: "Todo not found." });
        return todo;
      }),
    delete: t.procedure.input(z.object({ id: z.uuid() })).mutation(async ({ input }) => {
      const [todo] = await db.delete(todos).where(eq(todos.id, input.id)).returning();
      if (!todo) throw new TRPCError({ code: "NOT_FOUND", message: "Todo not found." });
      return { id: todo.id };
    }),
  });
}
export type Router = ReturnType<typeof createRouter>;
