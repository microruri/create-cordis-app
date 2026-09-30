import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const [name, mode] = process.argv.slice(2);
const development = mode === "dev";
const { createApp } = await import(
  `./packages/runtime/${development ? "src/index.ts" : "dist/index.js"}`
);
const app = await createApp(pathToFileURL(resolve("apps", name) + "/"), development).catch(
  (error) => {
    console.error(error.message);
    process.exit(1);
  },
);
const db = app.ctx.get("database").db;
const consumerPath = resolve("apps", name, "todos-consumer.mjs");
const consumer = existsSync(consumerPath)
  ? await (await import(pathToFileURL(consumerPath).href)).installConsumer(app.ctx)
  : undefined;
process.send({ ready: app.ctx.get("server").baseUrl });
process.on("message", async (action) => {
  const loader = app.ctx.get("loader");
  const entry = (name) => [...loader.entries()].find((entry) => entry.options.name === name);
  switch (action) {
    case "close":
      app.ctx.get("server")._http.closeAllConnections();
      await app.close();
      process.disconnect();
      return;
    case "check-service":
      await consumer.checkData();
      break;
    case "check-without-rpc": {
      const rpc = entry("@acme/plugin-rpc");
      const todos = app.ctx.get("todos");
      await rpc.update({ disabled: true });
      try {
        await loader.await();
        assert.equal(app.ctx.get("todos"), todos);
        await consumer.checkLifecycle(true);
        const before = await todos.list();
        const todo = await todos.create({ title: "Without RPC" });
        await todos.delete({ id: todo.id });
        assert.deepEqual(await todos.list(), before);
      } finally {
        await rpc.update({ disabled: false });
      }
      break;
    }
    case "check-pool":
      break;
    case "disable":
    case "enable":
      await entry("@acme/plugin-todos").update({ disabled: action === "disable" });
      break;
    default:
      throw new Error("Unknown database test command: " + action);
  }
  await loader.await();
  if (consumer) await consumer.checkLifecycle(action !== "disable");
  assert.equal(
    app.ctx.get("database").db,
    db,
    "Business HMR must reuse the database connection pool",
  );
  process.send({ done: action });
});
