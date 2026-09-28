import { readFileSync } from "node:fs";
import { defineConfig } from "rolldown";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const entries = Object.values(pkg.exports ?? {})
  .filter(
    (entry): entry is { development: string; default: string } =>
      typeof entry === "object" && entry !== null && "development" in entry && "default" in entry,
  )
  .map((entry) => [
    entry.default.replace(/^\.\/dist\//, "").replace(/\.js$/, ""),
    entry.development,
  ]);

export default defineConfig({
  input: entries.length ? Object.fromEntries(entries) : { index: "src/index.ts" },
  platform: "node",
  external: (id) => dependencies.some((name) => id === name || id.startsWith(`${name}/`)),
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
  },
});
