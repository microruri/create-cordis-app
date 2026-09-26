import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { normalizePath, searchForWorkspaceRoot, type Plugin, type InlineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { WebEntry } from "./discover.ts";

export const registryId = "virtual:cordis-web";
export const resolvedRegistryId = "\0" + registryId;

export function webConfig(appRoot: string, entries: () => WebEntry[]): InlineConfig {
  const registry: Plugin = {
    name: "cordis-web",
    resolveId(id) {
      if (id === registryId) return resolvedRegistryId;
    },
    load(id) {
      if (id !== resolvedRegistryId) return;
      const plugins = entries();
      return (
        plugins
          .map(
            (plugin, index) =>
              `import { createPlugin as factory${index} } from ${JSON.stringify(normalizePath(plugin.module))};`,
          )
          .join("\n") +
        "\nexport default [" +
        plugins
          .map(
            (plugin, index) =>
              `{ name: ${JSON.stringify(plugin.name)}, createPlugin: factory${index} }`,
          )
          .join(",") +
        "];"
      );
    },
  };
  return {
    configFile: false,
    root: fileURLToPath(new URL("../client/", import.meta.url)),
    cacheDir: join(appRoot, ".cordis/vite"),
    envDir: appRoot,
    plugins: [registry, react()],
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/react-router"] },
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(appRoot), fileURLToPath(new URL("../", import.meta.url))],
      },
    },
    build: { outDir: join(appRoot, "dist/client"), emptyOutDir: true },
  };
}
