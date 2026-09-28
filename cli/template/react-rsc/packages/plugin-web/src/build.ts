import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createBuilder } from "vite";
import { discover } from "./discover.ts";
import { webConfig } from "./vite.ts";
import type { ServerEntry } from "./types.ts";

export async function buildWeb(appRoot: string) {
  const config = await discover(appRoot);
  if (!config.webEnabled) return;
  const builder = await createBuilder(webConfig(appRoot, () => config.plugins));
  await builder.buildApp();
  const entry: ServerEntry = await import(
    pathToFileURL(join(appRoot, "dist/web/rsc/index.js")).href + "?validate=" + Date.now()
  );
  entry.validate();
  await writeFile(
    join(appRoot, "dist/web-manifest.json"),
    JSON.stringify(config.plugins.map(({ name }) => name)),
  );
}
