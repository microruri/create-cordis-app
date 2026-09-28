import type { Context } from "cordis";
import type {} from "@cordisjs/plugin-server";
import { createServer } from "vite";
import { discover } from "./discover.ts";
import { webConfig, resolvedRegistryId } from "./vite.ts";

export async function development(
  ctx: Context,
  appRoot: string,
  onConfig: (names: string[]) => void,
) {
  let config = await discover(appRoot, true);
  onConfig(config.plugins.map(({ name }) => name));
  const options = webConfig(appRoot, () => config.plugins);
  const vite = await createServer({
    ...options,
    appType: "spa",
    server: {
      ...options.server,
      middlewareMode: true,
      ws: { server: ctx.server._http, path: "/@vite/hmr", clientPort: ctx.server.port },
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
  const refresh = (filename: string) => {
    if (!config.files.includes(filename)) return;
    pending = pending
      .then(async () => {
        const next = await discover(appRoot, true);
        const changed = JSON.stringify(next.plugins) !== JSON.stringify(config.plugins);
        config = next;
        vite.watcher.add(config.files);
        onConfig(config.plugins.map(({ name }) => name));
        if (changed) {
          const module = vite.moduleGraph.getModuleById(resolvedRegistryId);
          if (module) await vite.reloadModule(module);
        }
      })
      .catch((error: unknown) => {
        ctx.logger.error(error);
        vite.ws.send({ type: "error", err: { message: String(error), stack: "" } });
      });
  };
  vite.watcher.add(config.files);
  vite.watcher.on("change", refresh);
  vite.watcher.on("add", refresh);
  vite.watcher.on("unlink", refresh);
  ctx.effect(() => async () => {
    vite.watcher.off("change", refresh);
    vite.watcher.off("add", refresh);
    vite.watcher.off("unlink", refresh);
    await pending;
    await vite.close();
  });
  return vite.middlewares;
}
