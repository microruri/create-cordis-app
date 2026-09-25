import { readFileSync } from "node:fs";
import { defineConfig } from "rolldown";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

export default defineConfig({
  input: "src/index.ts",
  platform: "node",
  external: (id) => dependencies.some((name) => id === name || id.startsWith(`${name}/`)),
  output: {
    file: "dist/index.js",
    format: "esm",
    sourcemap: true,
  },
});
