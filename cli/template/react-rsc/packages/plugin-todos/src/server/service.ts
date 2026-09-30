import type { Context } from "cordis";
import type { DatabaseExecutor } from "@acme/plugin-database";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { todos, type Todo } from "./schema.ts";

declare module "cordis" {
  interface Context {
    todos: Todos;
  }
}

const title = z.string().trim().min(1).max(200);

export const createTodoInput = z.object({ title });
export const updateTodoInput = z
  .object({
    id: z.uuid(),
    title: title.optional(),
    completed: z.boolean().optional(),
  })
  .refine(
    (input) => input.title !== undefined || input.completed !== undefined,
    "No changes provided",
  );
export const deleteTodoInput = z.object({ id: z.uuid() });

export type CreateTodoInput = z.infer<typeof createTodoInput>;
export type UpdateTodoInput = z.infer<typeof updateTodoInput>;
export type DeleteTodoInput = z.infer<typeof deleteTodoInput>;

export interface TodoOptions {
  tx?: DatabaseExecutor;
}

export class TodoNotFoundError extends Error {
  constructor() {
    super("Todo not found.");
    this.name = "TodoNotFoundError";
  }
}

export class Todos {
  private ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  async list(options?: TodoOptions): Promise<Todo[]> {
    const db = options?.tx ?? this.ctx.database.db;
    return db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
  }

  async create(input: CreateTodoInput, options?: TodoOptions): Promise<Todo> {
    const values = createTodoInput.parse(input);
    const db = options?.tx ?? this.ctx.database.db;
    const [todo] = await db.insert(todos).values(values).returning();
    return todo!;
  }

  async update(input: UpdateTodoInput, options?: TodoOptions): Promise<Todo> {
    const { id, ...values } = updateTodoInput.parse(input);
    const db = options?.tx ?? this.ctx.database.db;
    const [todo] = await db.update(todos).set(values).where(eq(todos.id, id)).returning();
    if (!todo) throw new TodoNotFoundError();
    return todo;
  }

  async delete(input: DeleteTodoInput, options?: TodoOptions): Promise<{ id: string }> {
    const { id } = deleteTodoInput.parse(input);
    const db = options?.tx ?? this.ctx.database.db;
    const [todo] = await db.delete(todos).where(eq(todos.id, id)).returning();
    if (!todo) throw new TodoNotFoundError();
    return { id: todo.id };
  }
}
