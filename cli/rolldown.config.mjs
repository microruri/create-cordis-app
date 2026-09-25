import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "rolldown";

const templateRoot = fileURLToPath(new URL("./template/", import.meta.url));
const outputRoot = fileURLToPath(new URL("./dist/", import.meta.url));
const excluded = new Set([
  "node_modules",
  "dist",
  ".git",
  ".turbo",
  ".cordis",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

async function* templateFiles(directory, prefix = "template") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      excluded.has(entry.name) ||
      entry.name.startsWith("pnpm-lock") ||
      entry.name.endsWith(".log") ||
      entry.name.endsWith(".tsbuildinfo") ||
      ((entry.name === ".env" || entry.name.startsWith(".env.")) && entry.name !== ".env.example")
    ) {
      continue;
    }
    const source = join(directory, entry.name);
    // npm omits .gitignore files; the CLI restores this name when copying.
    const name = entry.name === ".gitignore" ? "_gitignore" : entry.name;
    const fileName = `${prefix}/${name}`;
    if (entry.isDirectory()) yield* templateFiles(source, fileName);
    else if (entry.isFile()) yield { source, fileName };
  }
}

export default defineConfig({
  input: "src/index.ts",
  platform: "node",
  external: ["@clack/prompts"],
  output: { file: "dist/index.js", format: "esm" },
  plugins: [
    {
      name: "bundle-templates",
      async buildStart() {
        await rm(outputRoot, { recursive: true, force: true });
        for await (const { source, fileName } of templateFiles(templateRoot)) {
          this.addWatchFile(source);
          this.emitFile({ type: "asset", fileName, source: await readFile(source) });
        }
      },
    },
  ],
});
