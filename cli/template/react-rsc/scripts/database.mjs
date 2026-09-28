import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parse } from "dotenv";
import { expand } from "dotenv-expand";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as runMigrations } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const root = fileURLToPath(new URL("../", import.meta.url));
const apps = ["app-a", "app-b"];
const [action, selected, ...extra] = process.argv.slice(2);
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Database command failed. Check the output above.");
}
async function environment(app) {
  const env = { ...process.env };
  const mode = env.NODE_ENV ?? "development";
  const parsed = {};
  for (const name of [".env", ".env.local", ".env." + mode, ".env." + mode + ".local"]) {
    try {
      Object.assign(parsed, parse(await readFile(join(root, "apps", app, name))));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  expand({ parsed, processEnv: env });
  if (!env.DATABASE_URL) throw new Error(app + ": DATABASE_URL is missing. Run pnpm db:setup.");
  return env;
}
async function migrate(app) {
  const env = await environment(app);
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    // A session lock also covers the migrator's history-table initialization.
    await client.query("select pg_advisory_lock(716302, 1)");
    try {
      await runMigrations(drizzle(client), { migrationsFolder: join(root, "drizzle") });
    } finally {
      await client.query("select pg_advisory_unlock(716302, 1)");
    }
  } finally {
    await client.end();
  }
}
async function newMigration(name) {
  if (!name || !/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error(
      "Use a migration name such as add_users (lowercase letters, digits, underscores).",
    );
  const journalPath = join(root, "drizzle/meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const previous = journal.entries.at(-1);
  const idx = (previous?.idx ?? -1) + 1;
  const tag = String(idx).padStart(4, "0") + "_" + name;
  await writeFile(join(root, "drizzle", tag + ".sql"), "-- Write the migration SQL here.\n", {
    flag: "wx",
  });
  journal.entries.push({
    idx,
    version: journal.version,
    when: Math.max(Date.now(), (previous?.when ?? 0) + 1),
    tag,
    breakpoints: true,
  });
  await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n");
  console.log("Created drizzle/" + tag + ".sql. Update the TypeScript schema and SQL together.");
}
try {
  if (
    extra.length ||
    !["setup", "up", "down", "new", "migrate"].includes(action) ||
    (selected !== undefined &&
      action !== "new" &&
      (action !== "migrate" || !apps.includes(selected)))
  )
    throw new Error(
      "Usage: node scripts/database.mjs <setup|up|down|migrate> [app-a|app-b], or new <name>",
    );
  if (action === "setup") {
    for (const app of apps) {
      await copyFile(
        join(root, "apps", app, ".env.example"),
        join(root, "apps", app, ".env"),
        constants.COPYFILE_EXCL,
      ).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
    }
  }
  if (action === "up" || action === "setup")
    run("docker", ["compose", "up", "-d", "--wait", "--wait-timeout", "90"]);
  if (action === "down") run("docker", ["compose", "down"]);
  if (action === "new") await newMigration(selected);
  if (action === "migrate" || action === "setup") {
    for (const app of selected ? [selected] : apps) {
      console.log("Migrating " + app);
      await migrate(app);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
