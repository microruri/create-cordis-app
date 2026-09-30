import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { todos } from "@acme/plugin-todos/schema";
import { todos as appTodos } from "@acme/app-database";

export async function installConsumer(root) {
  assert.equal(todos, appTodos, "The application model must reuse the plugin's table object");
  let active;
  let activations = 0;
  let disposals = 0;
  const consumer = await root.plugin({
    name: "test-todos-consumer",
    inject: ["database", "todos"],
    apply(ctx) {
      active = ctx;
      activations++;
      ctx.effect(() => () => {
        active = undefined;
        disposals++;
      });
    },
  });
  return {
    async checkLifecycle(enabled) {
      await consumer.await();
      assert.equal(Boolean(active), enabled);
      assert.equal(activations - disposals, enabled ? 1 : 0);
    },
    async checkData() {
      assert.ok(active);
      const ctx = active;
      const db = ctx.database.db;
      const before = await ctx.todos.list();
      for (const title of [" ", "x".repeat(201)]) {
        await assert.rejects(async () => ctx.todos.create({ title }), { name: "ZodError" });
      }
      const created = await ctx.todos.create({ title: "  Direct consumer  " });
      assert.equal(created.title, "Direct consumer");
      await assert.rejects(async () => ctx.todos.update({ id: created.id }), { name: "ZodError" });
      assert.equal((await ctx.todos.update({ id: created.id, completed: true })).completed, true);
      await ctx.todos.delete({ id: created.id });
      await assert.rejects(async () => ctx.todos.delete({ id: created.id }), {
        name: "TodoNotFoundError",
      });

      // A consumer-owned table exercises SQL joins and atomic writes across domains.
      await db.execute(sql`create table consumer_audit (todo_id uuid references todos(id))`);
      try {
        let rolledBackId;
        await assert.rejects(
          db.transaction(async (tx) => {
            const todo = await ctx.todos.create({ title: "Rollback consumer" }, { tx });
            rolledBackId = todo.id;
            await ctx.todos.update({ id: todo.id, completed: true }, { tx });
            assert.ok(
              (await ctx.todos.list({ tx })).some((row) => row.id === todo.id && row.completed),
            );
            const disposable = await ctx.todos.create({ title: "Temporary" }, { tx });
            await ctx.todos.delete({ id: disposable.id }, { tx });
            await tx.execute(sql`insert into consumer_audit (todo_id) values (${todo.id})`);
            const joined = await tx
              .select({ id: todos.id })
              .from(todos)
              .innerJoin(sql`consumer_audit`, sql`consumer_audit.todo_id = ${todos.id}`);
            assert.deepEqual(joined, [{ id: todo.id }]);
            throw new Error("Rollback probe");
          }),
          /Rollback probe/,
        );
        assert.deepEqual(await db.select().from(todos).where(eq(todos.id, rolledBackId)), []);
        assert.equal((await db.execute(sql`select * from consumer_audit`)).rows.length, 0);
        assert.deepEqual(await ctx.todos.list(), before);

        const committed = await db.transaction(async (tx) => {
          const todo = await ctx.todos.create({ title: "Committed consumer" }, { tx });
          await tx.execute(sql`insert into consumer_audit (todo_id) values (${todo.id})`);
          return todo;
        });
        assert.equal((await db.select().from(todos).where(eq(todos.id, committed.id))).length, 1);
        assert.equal((await db.execute(sql`select * from consumer_audit`)).rows.length, 1);
        await db.execute(sql`delete from consumer_audit`);
        await ctx.todos.delete({ id: committed.id });
      } finally {
        await db.execute(sql`drop table consumer_audit`);
      }
      assert.deepEqual(await ctx.todos.list(), before);
    },
  };
}
