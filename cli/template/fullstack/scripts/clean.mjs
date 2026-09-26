import { existsSync, readdirSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const directories = [root];

for (const parent of ["apps", "packages"]) {
  const base = join(root, parent);
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory = join(base, entry.name);
    if (existsSync(join(directory, "package.json"))) directories.push(directory);
  }
}

for (const directory of directories.reverse()) {
  for (const name of ["dist", ".turbo", ".cordis", "node_modules"]) {
    const target = resolve(realpathSync(directory), name);
    const path = relative(root, target);
    if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
      throw new Error(`Refusing to clean outside the workspace: ${target}`);
    }
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

console.log(
  "Removed build outputs, caches, and installed dependencies. Run pnpm install before continuing.",
);
