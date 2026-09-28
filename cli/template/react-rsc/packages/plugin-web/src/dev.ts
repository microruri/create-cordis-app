import type { Context } from "cordis";
import type {} from "@cordisjs/plugin-server";
import { dirname, join } from "node:path";
import { createServer, isRunnableDevEnvironment, type ViteDevServer } from "vite";
import { discover } from "./discover.ts";
import { webConfig, webRoot } from "./vite.ts";
import type { ServerEntry } from "./types.ts";

export async function development(ctx: Context, appRoot: string) {
  let config = await discover(appRoot, true);
  const options = webConfig(appRoot, () => config.plugins);
  const vite: ViteDevServer = await createServer({
    ...options,
    server: {
      ...options.server,
      ws: { server: ctx.server._http, path: "/@vite/hmr", clientPort: ctx.server.port },
    },
  });
  const environment = vite.environments.rsc!;
  if (!isRunnableDevEnvironment(environment)) throw new Error("RSC environment is not runnable");
  const entry = async () =>
    (await environment.runner.import(join(webRoot, "entry-rsc.tsx"))) as ServerEntry;
  try {
    (await entry()).validate();
  } catch (error) {
    await vite.close();
    throw error;
  }
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
    clearTimeout(timer);
    if (!stopped)
      timer = setTimeout(() => {
        if (!stopped) vite.ws.send({ type: "full-reload", path: "*" });
      }, 150);
  };
  const watch = () =>
    vite.watcher.add([...config.files, ...config.plugins.map((plugin) => dirname(plugin.module))]);
  const changed = (file: string) => {
    const configuration = config.files.includes(file);
    const manifest = config.plugins.some((plugin) => plugin.module === file);
    if (!configuration && !manifest) return;
    pending = pending
      .then(async () => {
        if (stopped) return;
        config = await discover(appRoot, true);
        for (const environment of Object.values(vite.environments))
          environment.moduleGraph.invalidateAll();
        watch();
        (await entry()).validate();
        refreshBrowser();
      })
      .catch((error: unknown) => {
        ctx.logger.error(error);
        vite.ws.send({ type: "error", err: { message: String(error), stack: "" } });
      });
  };
  watch();
  vite.watcher.on("add", changed);
  vite.watcher.on("change", changed);
  vite.watcher.on("unlink", changed);
  ctx.on("internal/status", refreshBrowser, { global: true });
  ctx.effect(() => async () => {
    stopped = true;
    clearTimeout(timer);
    vite.watcher.off("add", changed);
    vite.watcher.off("change", changed);
    vite.watcher.off("unlink", changed);
    await pending;
    await vite.close();
  });
  return { vite, entry };
}
