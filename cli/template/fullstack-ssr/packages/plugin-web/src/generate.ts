import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { discover } from "./discover.ts";

const hostRoot = fileURLToPath(new URL("../web/", import.meta.url));

export async function generate(appRoot: string, development = false) {
  const config = await discover(appRoot, development);
  const root = join(appRoot, ".cordis/web");
  const outputs = new Map<string, string>();
  const sources = new Set(config.files);

  async function forward(source: string, destination: string, specifier: string, owner?: string) {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["node_modules", "dist"].includes(entry.name)) continue;
      const original = join(source, entry.name);
      const output = join(destination, entry.name);
      if (entry.isDirectory()) {
        await forward(original, output, specifier + "/" + entry.name);
      } else if (/^\+.*\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        sources.add(original);
        const ref = JSON.stringify(specifier + "/" + entry.name);
        outputs.set(
          output,
          entry.name === "+config.ts" || entry.name === "+config.js"
            ? `import config from ${ref};\nexport default { ...config${owner ? ", cordisPlugin: " + JSON.stringify(owner) : ""} };\n`
            : `export { default } from ${ref};\n`,
        );
      }
    }
  }

  await forward(hostRoot, join(root, "pages"), "@acme/plugin-web/web");
  for (const [index, plugin] of config.plugins.entries()) {
    await forward(
      dirname(plugin.module),
      join(root, "pages", "(plugin-" + index + ")"),
      plugin.name + "/web",
      plugin.name,
    );
  }
  await mkdir(root, { recursive: true });
  const indexFile = join(root, "generated.json");
  const previous: string[] = await readFile(indexFile, "utf8")
    .then(JSON.parse)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return [];
    });
  let changed = false;
  for (const [file, content] of outputs) {
    const before = await readFile(file, "utf8").catch(() => "");
    if (before === content) continue;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
    changed = true;
  }
  const names = [...outputs.keys()].map((file) => relative(root, file));
  for (const name of previous) {
    if (names.includes(name)) continue;
    // Only remove files produced by this generator inside its own root.
    if (name.split(/[\\/]/).includes("..") || name.startsWith("/") || name.includes(":"))
      throw new Error("Invalid generated path: " + name);
    await unlink(join(root, name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    changed = true;
  }
  await writeFile(indexFile, JSON.stringify(names));
  return { ...config, root, sources: [...sources], changed };
}
