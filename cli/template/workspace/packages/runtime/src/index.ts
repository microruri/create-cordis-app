import { parseArgs } from "node:util";
import { Context, FiberState } from "cordis";
import Loader from "@cordisjs/plugin-loader";
import type {} from "@cordisjs/plugin-server";

export async function createApp(baseUrl: URL, development = false) {
  process.env.NODE_ENV ??= development ? "development" : "production";
  const ctx = new Context();
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= ctx.fiber.dispose());

  try {
    await ctx.plugin(Loader, { baseUrl: baseUrl.href });
    const loader = ctx.get("loader");
    if (!loader) throw new Error("Cordis Loader did not start.");
    if (development && !loader.internal) {
      throw new Error("Plugin HMR requires Node 24 with --expose-internals. Run pnpm dev.");
    }

    // Register Include with Loader so its children participate in HMR and startup checks.
    await loader.create({
      name: "@cordisjs/plugin-include",
      config: { path: development ? "./cordis.dev.yml" : "./cordis.yml" },
    });
    await loader.await();
    for (const entry of loader.entries()) {
      if (entry.options.disabled || entry.disabled) continue;
      if (!entry.fiber) throw new Error(`Plugin did not load: ${entry.options.name}`);
      try {
        await entry.fiber.await();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Plugin failed: ${entry.options.name}: ${message}`, { cause });
      }
      if (entry.fiber.state !== FiberState.ACTIVE) {
        throw new Error(`Plugin is not active: ${entry.options.name}`);
      }
    }
    return { ctx, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function runApp(baseUrl: URL) {
  try {
    const { values } = parseArgs({ options: { dev: { type: "boolean", default: false } } });
    const app = await createApp(baseUrl, values.dev);
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void app.close().catch((error: unknown) => {
        console.error("Shutdown failed:", error);
        process.exitCode = 1;
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Startup failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
