import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { normalizePath, searchForWorkspaceRoot, type Plugin, type InlineConfig } from "vite";
import react from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import tailwindcss from "@tailwindcss/vite";
import type { WebEntry } from "./discover.ts";

export const webRoot = fileURLToPath(new URL("../web/", import.meta.url));
const registryId = "virtual:cordis-pages";

export function webConfig(appRoot: string, entries: () => WebEntry[]): InlineConfig {
  function serverOnly(id: string) {
    return /(?:\/src\/server\/|\.server\.)/.test(normalizePath(id));
  }
  const registry: Plugin = {
    name: "cordis-pages",
    enforce: "pre",
    resolveId(id) {
      if (
        this.environment.name === "client" &&
        (serverOnly(id) ||
          /^(?:node:|pg(?:\/|$)|drizzle-orm(?:\/|$)|@acme\/plugin-database(?:\/|$))/.test(id))
      )
        throw new Error("Server-only module imported by the browser: " + id);
      if (id === registryId) {
        if (this.environment.name !== "rsc")
          throw new Error("Page manifests are only available in the RSC environment");
        return "\0" + id;
      }
    },
    load(id) {
      if (this.environment.name === "client" && serverOnly(id))
        throw new Error("Server-only module imported by the browser: " + id);
      if (id !== "\0" + registryId) return;
      const imports = entries().map(
        (plugin, index) =>
          "import { pages as pages" +
          index +
          " } from " +
          JSON.stringify(normalizePath(plugin.module)) +
          ";",
      );
      return (
        imports.join("\n") +
        "\nexport default [" +
        entries()
          .map(
            (plugin, index) =>
              "{name:" + JSON.stringify(plugin.name) + ",pages:pages" + index + "}",
          )
          .join(",") +
        "];"
      );
    },
  };
  return {
    configFile: false,
    root: webRoot,
    appType: "custom",
    cacheDir: join(appRoot, ".cordis/vite"),
    envDir: appRoot,
    plugins: [registry, rsc({ serverHandler: false }), react(), tailwindcss()],
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-query"] },
    environments: Object.fromEntries(
      (["rsc", "ssr", "client"] as const).map((name) => [
        name,
        {
          resolve:
            name === "client"
              ? {}
              : { noExternal: [/^@acme\//, /^@tanstack\//, /^@trpc\//, /^rsc-html-stream/] },
          // Keep RSC client references and Query context on the same module path.
          optimizeDeps: { exclude: ["@tanstack/react-query"] },
          build: {
            outDir: join(appRoot, "dist/web", name),
            emptyOutDir: true,
            manifest: name === "client",
            rolldownOptions: {
              input: { index: join(webRoot, "entry-" + name + ".tsx") },
              output: name === "client" ? {} : { entryFileNames: "[name].js" },
            },
          },
        },
      ]),
    ),
    server: {
      middlewareMode: true,
      fs: {
        allow: [searchForWorkspaceRoot(appRoot), fileURLToPath(new URL("../", import.meta.url))],
      },
    },
  };
}
