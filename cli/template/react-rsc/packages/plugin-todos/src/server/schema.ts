import { boolean, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const todos = pgTable("todos", {
  id: uuid().defaultRandom().primaryKey(),
  title: varchar({ length: 200 }).notNull(),
  completed: boolean().default(false).notNull(),
  createdAt: timestamp({ withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
