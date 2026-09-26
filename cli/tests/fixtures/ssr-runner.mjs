import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [app, mode] = process.argv.slice(2);
const development = mode === "dev";
if (!development) {
  registerHooks({
    resolve(specifier, context, next) {
      assert.ok(!/^(vite|@vitejs\/plugin-react)$/.test(specifier), "Production must not load Vite");
      return next(specifier, context);
    },
  });
}
const { createApp } = await import(
  `./packages/runtime/${development ? "src/index.ts" : "dist/index.js"}`
);
const instance = await createApp(pathToFileURL(resolve("apps", app) + "/"), development).catch(
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
const { t } = await import(
  `./packages/plugin-rpc/${development ? "src/index.ts" : "dist/index.js"}`
);
const contextRouter = t.router({
  read: t.procedure.query(async ({ ctx }) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      cookie: ctx.request.headers.get("cookie"),
      owner: ctx.cordis.fiber.uid,
      sameServer: ctx.cordis.server.baseUrl === instance.ctx.server.baseUrl,
    };
  }),
});
const plugin = instance.ctx.plugin({
  inject: ["rpc", "server"],
  apply(ctx) {
    ctx.rpc.register("request-test", contextRouter);
  },
});
await plugin;
const cookies = ["session=first", "session=second"];
assert.deepEqual(
  await Promise.all(
    cookies.map((cookie) =>
      instance.ctx.rpc
        .caller("request-test", new Request("http://localhost/", { headers: { cookie } }))
        .read(),
    ),
  ),
  cookies.map((cookie) => ({ cookie, owner: plugin.uid, sameServer: true })),
);
const http = await fetch(instance.ctx.server.baseUrl + "/api/trpc/request-test/read", {
  headers: { cookie: cookies[0] },
}).then((r) => r.json());
assert.deepEqual(http.result.data, { cookie: cookies[0], owner: plugin.uid, sameServer: true });
await plugin.dispose();
assert.throws(
  () => instance.ctx.rpc.caller("request-test", new Request("http://localhost/")),
  /unavailable/,
);
assert.equal(
  (await fetch(instance.ctx.server.baseUrl + "/api/trpc/request-test/read")).status,
  404,
);
process.send({ ready: instance.ctx.server.baseUrl });
process.on("message", async (message) => {
  if (message !== "close") return;
  await instance.close();
  process.disconnect();
});
