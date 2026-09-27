import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

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
process.send({ ready: app.ctx.get("server").baseUrl });
process.on("message", async (action) => {
  if (action === "close") {
    app.ctx.get("server")._http.closeAllConnections();
    await app.close();
    process.disconnect();
  } else {
    const entry = [...app.ctx.get("loader").entries()].find(
      (entry) => entry.options.name === "@acme/plugin-todos",
    );
    if (action === "disable" || action === "enable")
      await entry.update({ disabled: action === "disable" });
    await app.ctx.get("loader").await();
    assert.equal(
      app.ctx.get("database").db,
      db,
      "Business HMR must reuse the database connection pool",
    );
    process.send({ done: action });
  }
});
