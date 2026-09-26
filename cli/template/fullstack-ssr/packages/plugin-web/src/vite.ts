import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { searchForWorkspaceRoot, type InlineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { getVikeConfig } from "vike/plugin";

export function webConfig(appRoot: string): InlineConfig & {
  vitePluginServerEntry: { disableAutoImport: boolean };
} {
  return {
    configFile: false,
    root: join(appRoot, ".cordis/web"),
    cacheDir: join(appRoot, ".cordis/vite"),
    envDir: appRoot,
    // Production imports each app's server entry explicitly.
    vitePluginServerEntry: { disableAutoImport: true },
    // Vike's API adds its plugin after establishing the application root.
    plugins: [
      react(),
      {
        name: "cordis-page-routes",
        buildStart() {
          const routes = new Map<string, string>();
          for (const [id, page] of Object.entries(getVikeConfig().pages)) {
            if (typeof page.route !== "string") continue;
            const previous = routes.get(page.route);
            if (previous)
              throw new Error(`Duplicate page route ${page.route}: ${previous} and ${id}`);
            routes.set(page.route, id);
          }
        },
      },
    ],
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-query", "vike", "vike-react"] },
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(appRoot), fileURLToPath(new URL("../", import.meta.url))],
      },
    },
    build: { outDir: join(appRoot, "dist/web"), emptyOutDir: true },
  };
}
