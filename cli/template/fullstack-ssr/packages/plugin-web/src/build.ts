import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vike/api";
import { generate } from "./generate.ts";
import { webConfig } from "./vite.ts";

export async function buildWeb(appRoot: string) {
  const config = await generate(appRoot);
  if (!config.webEnabled) return;
  await build({ viteConfig: webConfig(appRoot) });
  await writeFile(
    join(appRoot, "dist/web-manifest.json"),
    JSON.stringify(config.plugins.map(({ name }) => name)),
  );
}
