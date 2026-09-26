import type { Context } from "cordis";
import type {} from "@cordisjs/plugin-server";
import { dirname, relative } from "node:path";
import { createDevMiddleware } from "vike/server";
import { generate } from "./generate.ts";
import { webConfig } from "./vite.ts";

export async function development(ctx: Context, appRoot: string) {
  let config = await generate(appRoot, true);
  const options = webConfig(appRoot);
  const { viteServer } = await createDevMiddleware({
    root: config.root,
    viteConfig: {
      ...options,
      server: {
        ...options.server,
        ws: { server: ctx.server._http, path: "/@vite/hmr", clientPort: ctx.server.port },
      },
    },
  });
  ctx.on("server/upgrade", async (req, next) => {
    if (
      req.path === "/@vite/hmr" &&
      ["vite-hmr", "vite-ping"].includes(req.headers.get("sec-websocket-protocol") ?? "")
    )
      return;
    await next();
  });
  let pending = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const refreshBrowser = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped) viteServer.ws.send({ type: "full-reload", path: "*" });
    }, 150);
  };
  const watch = () =>
    viteServer.watcher.add([
      ...config.files,
      ...config.plugins.map((plugin) => dirname(plugin.module)),
    ]);
  const changed = (file: string) => {
    const inPlugin = config.plugins.some((plugin) => {
      const path = relative(dirname(plugin.module), file);
      return !path.startsWith("..") && /(^|[\\/])\+/.test(path);
    });
    if (!config.files.includes(file) && !inPlugin) return;
    pending = pending
      .then(async () => {
        if (stopped) return;
        config = await generate(appRoot, true);
        if (config.changed) {
          // Recreate Vike's route graph after adding or removing generated entries.
          await viteServer.restart();
          attach();
        }
        watch();
        // Vike handles component edits; changed generated entries need a reload.
        if (config.changed || config.files.includes(file)) refreshBrowser();
      })
      .catch((error: unknown) => {
        ctx.logger.error(error);
        viteServer.ws.send({ type: "error", err: { message: String(error), stack: "" } });
      });
  };
  function attach() {
    viteServer.watcher.on("add", changed);
    viteServer.watcher.on("change", changed);
    viteServer.watcher.on("unlink", changed);
  }
  watch();
  attach();
  ctx.on("internal/status", refreshBrowser, { global: true });
  ctx.effect(() => async () => {
    stopped = true;
    clearTimeout(timer);
    viteServer.watcher.off("add", changed);
    viteServer.watcher.off("change", changed);
    viteServer.watcher.off("unlink", changed);
    await pending;
    await viteServer.close();
  });
  return (...args: Parameters<typeof viteServer.middlewares>) => viteServer.middlewares(...args);
}
