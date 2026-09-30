import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "dotenv";
import { expand } from "dotenv-expand";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as runMigrations } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const root = fileURLToPath(new URL("../", import.meta.url));
const apps = ["app-a", "app-b"];
const [action, selected, ...extra] = process.argv.slice(2);
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Database command failed. Check the output above.");
}
async function databaseUrl(app) {
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
  return env.DATABASE_URL;
}
// Each app manifest selects its migration history through the "database" field,
// for example "database": { "migrations": "@acme/app-database/migrations" }.
// Resolution runs through the app's own dependency graph and imports only the
// pure migrations module, never the app's runtime or schema code.
async function migrationsFolder(app) {
  const manifestPath = join(root, "apps", app, "package.json");
  try {
    const { database } = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!database?.migrations || typeof database.migrations !== "string")
      throw new Error('Declare "database": { "migrations": "..." } in the app manifest.');
    const resolved = createRequire(manifestPath).resolve(database.migrations);
    const info = (await import(pathToFileURL(resolved).href)).migrations?.();
    if (typeof info?.migrationsFolder !== "string" || !info.migrationsFolder)
      throw new Error(
        database.migrations + " must export migrations() returning a migrationsFolder.",
      );
    return resolve(info.migrationsFolder);
  } catch (error) {
    throw new Error(app + ": " + error.message, { cause: error });
  }
}

async function migrate(app) {
  const connectionString = await databaseUrl(app);
  const folder = await migrationsFolder(app);
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    // A session lock also covers the migrator's history-table initialization.
    await client.query("select pg_advisory_lock(716302, 1)");
    try {
      await runMigrations(drizzle(client), { migrationsFolder: folder });
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
  const folders = await Promise.all(apps.map(migrationsFolder));
  if (new Set(folders).size !== 1)
    throw new Error(
      "The apps must share one migration history, but they select different folders.",
    );
  const [folder] = folders;
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const previous = journal.entries.at(-1);
  const idx = (previous?.idx ?? -1) + 1;
  const tag = String(idx).padStart(4, "0") + "_" + name;
  await writeFile(join(folder, tag + ".sql"), "-- Write the migration SQL here.\n", {
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
  console.log(
    "Created " +
      relative(root, join(folder, tag + ".sql")) +
      ". Update the TypeScript schema and SQL together.",
  );
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
      "Usage: node scripts/database.mjs <setup|up|down>, migrate [app-a|app-b], or new <name>",
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
