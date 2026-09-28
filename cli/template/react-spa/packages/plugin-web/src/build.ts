#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
import { discover } from "./discover.ts";
import { webConfig } from "./vite.ts";

export async function buildWeb(appRoot: string) {
  const config = await discover(appRoot);
  if (!config.webEnabled) return;
  await build(webConfig(appRoot, () => config.plugins));
  await mkdir(join(appRoot, "dist"), { recursive: true });
  await writeFile(
    join(appRoot, "dist/web-manifest.json"),
    JSON.stringify(config.plugins.map(({ name }) => name)),
  );
}
