import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import yaml from "js-yaml";

const schema = yaml.JSON_SCHEMA.extend(
  new yaml.Type("tag:yaml.org,2002:js", {
    kind: "scalar",
    construct: (source: string) => ({ __jsExpr: source }),
  }),
);

export interface WebEntry {
  name: string;
  module: string;
}

export async function discover(appRoot: string, development = false) {
  const files = new Set<string>();
  const plugins: WebEntry[] = [];
  const stack = new Set<string>();
  let title = "Cordis";
  let webEnabled = false;

  async function visit(filename: string, disabled = false) {
    filename = resolve(filename);
    if (stack.has(filename)) throw new Error(`Circular include: ${filename}`);
    stack.add(filename);
    files.add(filename);
    const source = await readFile(filename, "utf8");
    const rows: unknown = filename.endsWith(".json")
      ? JSON.parse(source)
      : yaml.load(source, { schema });
    await walk(rows, filename, disabled);
    stack.delete(filename);
  }

  async function walk(rows: unknown, filename: string, disabled = false) {
    if (!Array.isArray(rows)) throw new Error(`Expected a plugin array in ${filename}`);
    for (const row of rows) {
      if (!row || typeof row !== "object" || typeof row.name !== "string") {
        throw new Error(`Plugin names must be literal strings in ${filename}`);
      }
      if (row.group !== undefined && typeof row.group !== "boolean") {
        throw new Error(`Dynamic plugin groups are unsupported in ${filename}`);
      }
      if (row.name === "@cordisjs/plugin-include") {
        if (
          typeof row.config?.path !== "string" ||
          row.config.patches !== undefined ||
          row.config.initial !== undefined
        ) {
          throw new Error(
            `Use a literal include path without patches or initial config in ${filename}`,
          );
        }
        await visit(resolve(dirname(filename), row.config.path), disabled || row.disabled === true);
      } else if (row.group) {
        await walk(row.config ?? [], filename, disabled || row.disabled === true);
      } else if (row.name === "@acme/plugin-web") {
        if (row.config?.title !== undefined && typeof row.config.title !== "string") {
          throw new Error(`Web title must be a literal string in ${filename}`);
        }
        title = row.config?.title ?? title;
        webEnabled ||= !disabled && row.disabled !== true;
      } else {
        const require = createRequire(join(dirname(filename), "package.json"));
        let module: string;
        try {
          module = require.resolve(`${row.name}/web`);
        } catch (error) {
          if (
            ["ERR_PACKAGE_PATH_NOT_EXPORTED", "MODULE_NOT_FOUND"].includes(
              (error as NodeJS.ErrnoException).code ?? "",
            )
          ) {
            // Resolve the server entry too: a missing dependency is not a backend-only plugin.
            let directory = dirname(require.resolve(row.name));
            while (!existsSync(join(directory, "package.json"))) {
              const parent = dirname(directory);
              if (parent === directory) throw error;
              directory = parent;
            }
            const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
            if (pkg.exports?.["./web"]) {
              throw new Error(`Cannot resolve the ./web export of ${row.name} in ${filename}`, {
                cause: error,
              });
            }
            continue;
          }
          throw error;
        }
        if (plugins.some((plugin) => plugin.name === row.name)) {
          throw new Error(`Duplicate frontend plugin ${row.name} in ${filename}`);
        }
        plugins.push({ name: row.name, module });
      }
    }
  }

  await visit(join(appRoot, development ? "cordis.dev.yml" : "cordis.yml"));
  return { plugins, files: [...files], title, webEnabled };
}
