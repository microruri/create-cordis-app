import { temporary, copyTemplate, linkDependencies, eventually, nodeProcess } from "./helpers.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";

async function fixture(t: TestContext, template: string) {
  const source = fileURLToPath(new URL(`../template/${template}/`, import.meta.url));
  const { target, cleanups } = await temporary(t, "cca-postgres-test-");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    NODE_OPTIONS: "",
    COMPOSE_PROJECT_NAME: basename(target).toLowerCase(),
    APP_A_DB_PORT: "0",
    APP_B_DB_PORT: "0",
  };
  for (const key of ["DATABASE_URL", "PORT", "HOST", "GREETING"]) delete env[key];
  function run(command: string, args: string[], cwd = target, expectedStatus = 0) {
    const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 120000 });
    assert.ifError(result.error);
    assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
    return result.stdout;
  }
  const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  run(process.execPath, [cli, "project", "--template", template]);
  await cp(join(target, "project"), target, { recursive: true });
  const directories = await linkDependencies(source, target);
  await cp(new URL("./fixtures/database-runner.mjs", import.meta.url), join(target, "runner.mjs"));
  if (template === "react-rsc") {
    const appRoot = join(target, "apps/app-a");
    await cp(
      new URL("./fixtures/todos-consumer.mjs", import.meta.url),
      join(appRoot, "todos-consumer.mjs"),
    );
    await symlink(
      await realpath(join(source, "packages/plugin-todos/node_modules/drizzle-orm")),
      join(appRoot, "node_modules/drizzle-orm"),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  cleanups.push(() => {
    run("docker", ["compose", "down", "--volumes"]);
  });
  run(process.execPath, ["scripts/database.mjs", "up"]);
  for (const app of ["app-a", "app-b"]) {
    const address = run("docker", ["compose", "port", `db-${app}`, "5432"]).trim();
    // Keep the allocated port when repeated setup asks Compose to reconcile containers.
    env[app === "app-a" ? "APP_A_DB_PORT" : "APP_B_DB_PORT"] = new URL("http://" + address).port;
    await writeFile(
      join(target, "apps", app, ".env"),
      `PORT=0\nDATABASE_URL=postgresql://acme:acme@${address}/${app.replace("-", "_")}\n`,
    );
  }
  for (let i = 0; i < 2; i++) run(process.execPath, ["scripts/database.mjs", "setup"]);
  for (const path of directories)
    run(
      process.execPath,
      [
        join(target, "node_modules/rolldown/bin/cli.mjs"),
        "-c",
        "../../rolldown.config.ts",
        "--configLoader",
        "native",
      ],
      join(target, path),
    );
  for (const app of ["app-a", "app-b"])
    run(
      process.execPath,
      [join(target, "packages/plugin-web/bin/cordis-web.mjs"), "build"],
      join(target, "apps", app),
    );
  async function start(app: string, dev = false, override: NodeJS.ProcessEnv = {}) {
    const running = nodeProcess(
      [
        ...(dev ? ["--expose-internals", "--conditions=development"] : []),
        "runner.mjs",
        app,
        dev ? "dev" : "prod",
      ],
      target,
      { ...env, NODE_ENV: dev ? "development" : "production", ...override },
      cleanups,
    );
    const reply = await running.message();
    return {
      ...running,
      url: reply?.ready ?? "",
      exitCode: running.process.exitCode,
      async command(action: string) {
        const reply = await running.message(action);
        assert.equal(reply?.done, action, running.logs());
      },
    };
  }
  async function concurrentMigrations() {
    await Promise.all(
      [1, 2].map(async () => {
        const running = nodeProcess(
          ["scripts/database.mjs", "migrate", "app-a"],
          target,
          env,
          cleanups,
          false,
        );
        assert.deepEqual(await running.exit, [0, null], running.logs());
      }),
    );
  }
  return { target, run, start, concurrentMigrations };
}

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}
async function rpc<T>(url: string, action: string, input?: unknown, status = 200): Promise<T> {
  const response = await fetch(
    `${url}/api/trpc/todos/${action}`,
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
  );
  const data = (await response.json()) as { result?: { data: T }; error?: unknown };
  assert.equal(response.status, status, JSON.stringify(data));
  return data.result?.data as T;
}

for (const template of ["react-spa", "react-rsc"]) {
  const migrations = template === "react-rsc" ? "packages/app-database/drizzle" : "drizzle";
  test(`${template} creates manual migrations and rejects invalid names without changing history`, async (t) => {
    const source = fileURLToPath(new URL(`../template/${template}/`, import.meta.url));
    const { target } = await temporary(t, "cca-migration-test-");
    await copyTemplate(source, target);
    await linkDependencies(source, target);
    const journalPath = join(target, migrations, "meta/_journal.json");
    const original = await readFile(journalPath, "utf8");
    const initialSql = await readFile(join(target, migrations, "0000_create_todos.sql"));
    for (const args of [[], ["../escape"], ["Bad name"], ["add_users", "extra"]]) {
      const result = spawnSync(process.execPath, ["scripts/database.mjs", "new", ...args], {
        cwd: target,
        encoding: "utf8",
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(await readFile(journalPath, "utf8"), original);
    }
    for (const name of ["add_users", "add_roles"]) {
      const result = spawnSync(process.execPath, ["scripts/database.mjs", "new", name], {
        cwd: target,
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    assert.deepEqual(journal.entries[0], JSON.parse(original).entries[0]);
    assert.deepEqual(
      journal.entries.map((entry: { tag: string }) => entry.tag),
      ["0000_create_todos", "0001_add_users", "0002_add_roles"],
    );
    assert.ok(
      journal.entries[2].when > journal.entries[1].when &&
        journal.entries[1].when > journal.entries[0].when,
    );
    assert.match(
      await readFile(join(target, migrations, "0001_add_users.sql"), "utf8"),
      /Write the migration SQL/,
    );
    assert.deepEqual(await readFile(join(target, migrations, "0000_create_todos.sql")), initialSql);
    if (template === "react-rsc") {
      const manifestPath = join(target, "apps/app-b/package.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      // A second data model must not silently receive the first model's new SQL.
      const other = join(target, "packages/other-database");
      await copyTemplate(join(target, "packages/app-database"), other);
      const otherManifest = JSON.parse(await readFile(join(other, "package.json"), "utf8"));
      otherManifest.name = "@acme/other-database";
      await writeFile(join(other, "package.json"), JSON.stringify(otherManifest));
      await symlink(
        other,
        join(target, "apps/app-b/node_modules/@acme/other-database"),
        process.platform === "win32" ? "junction" : "dir",
      );
      manifest.dependencies["@acme/other-database"] = "workspace:*";
      manifest.database.migrations = "@acme/other-database/migrations";
      await writeFile(manifestPath, JSON.stringify(manifest));
      const saved = await readFile(journalPath, "utf8");
      const otherJournal = join(other, "drizzle/meta/_journal.json");
      const otherSaved = await readFile(otherJournal, "utf8");
      const ambiguous = spawnSync(process.execPath, ["scripts/database.mjs", "new", "ambiguous"], {
        cwd: target,
        encoding: "utf8",
      });
      assert.equal(ambiguous.status, 1, ambiguous.stdout + ambiguous.stderr);
      assert.match(ambiguous.stderr, /different|multiple|shared|ambiguous/i);
      assert.equal(await readFile(journalPath, "utf8"), saved);
      assert.equal(await readFile(otherJournal, "utf8"), otherSaved);
      assert.ok(
        !(await readdir(join(target, migrations))).some((name) => name.includes("ambiguous")),
      );
      assert.ok(
        !(await readdir(join(other, "drizzle"))).some((name) => name.includes("ambiguous")),
      );
    }
  });

  test(
    `${template} PostgreSQL CRUD, independent databases, migrations, and plugin lifecycle`,
    {
      skip: process.env.CCA_TEST_DATABASE !== "1",
      timeout: 180000,
    },
    async (t) => {
      const f = await fixture(t, template);
      function sql(app: string, query: string) {
        return f
          .run("docker", [
            "compose",
            "exec",
            "-T",
            `db-${app}`,
            "psql",
            "-U",
            "acme",
            "-d",
            app.replace("-", "_"),
            "-Atc",
            query,
          ])
          .trim();
      }
      assert.equal(sql("app-a", "select count(*) from drizzle.__drizzle_migrations"), "1");
      f.run(process.execPath, ["scripts/database.mjs", "new", "migration_probe"]);
      const migrationPath = join(f.target, migrations, "0001_migration_probe.sql");
      await writeFile(
        migrationPath,
        "CREATE TABLE migration_probe (id integer);\n--> statement-breakpoint\nSELECT missing_column FROM migration_probe;\n",
      );
      f.run(process.execPath, ["scripts/database.mjs", "migrate", "app-a"], f.target, 1);
      assert.equal(sql("app-a", "select to_regclass('public.migration_probe')"), "");
      assert.equal(sql("app-a", "select count(*) from drizzle.__drizzle_migrations"), "1");
      await writeFile(
        migrationPath,
        "CREATE TABLE migration_probe (id integer);\n--> statement-breakpoint\nSELECT pg_sleep(0.1);\n",
      );
      await f.concurrentMigrations();
      assert.equal(sql("app-a", "select count(*) from drizzle.__drizzle_migrations"), "2");
      assert.equal(sql("app-b", "select count(*) from drizzle.__drizzle_migrations"), "1");
      f.run(process.execPath, ["scripts/database.mjs", "migrate"]);
      assert.equal(sql("app-b", "select count(*) from drizzle.__drizzle_migrations"), "2");
      const a = await f.start("app-a");
      const b = await f.start("app-b");
      assert.ok(a.url && b.url, a.logs() + b.logs());
      if (template === "react-rsc") {
        await a.command("check-service");
        await a.command("check-without-rpc");
        assert.deepEqual(await rpc(a.url, "list"), []);
      }
      assert.deepEqual(await rpc(b.url, "list"), []);
      const todo = await rpc<Todo>(a.url, "create", { title: "  Persistent task  " });
      assert.equal(todo.title, "Persistent task");
      await rpc(a.url, "create", { title: " " }, 400);
      await rpc(a.url, "create", { title: "x".repeat(201) }, 400);
      await rpc(a.url, "update", { id: "invalid", completed: true }, 400);
      await rpc(a.url, "update", { id: todo.id }, 400);
      assert.deepEqual(await rpc(b.url, "list"), []);
      await rpc(b.url, "update", { id: todo.id, completed: true }, 404);
      const changed = await rpc<Todo>(a.url, "update", {
        id: todo.id,
        title: "Edited task",
        completed: true,
      });
      assert.equal(changed.completed, true);
      assert.equal(changed.title, "Edited task");
      const response = await fetch(a.url + "/todos");
      assert.equal(response.status, 200);
      const html = await response.text();
      if (template === "react-rsc") assert.match(html, /Edited task/);
      const stylesheets = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/g)];
      assert.ok(stylesheets.length, "Production HTML must include stylesheets");
      const css = (
        await Promise.all(
          stylesheets.map(async ([, href]) => (await fetch(new URL(href!, a.url))).text()),
        )
      ).join("\n");
      for (const selector of [".btn-primary", ".checkbox-primary", ".min-w-40"]) {
        assert.ok(
          css.includes(selector),
          `Production CSS must include plugin classes: ${selector}`,
        );
      }
      await a.command("disable");
      assert.equal((await fetch(a.url + "/api/trpc/todos/list")).status, 404);
      await a.command("enable");
      assert.equal((await rpc<Todo[]>(a.url, "list"))[0]!.id, todo.id);
      await a.close();
      await b.close();
      for (const app of ["app-a", "app-b"]) {
        assert.equal(
          sql(
            app,
            "select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid()",
          ),
          "0",
          "Pool connections must be closed",
        );
      }
      const restarted = await f.start("app-a", true);
      assert.equal((await rpc<Todo[]>(restarted.url, "list"))[0]!.title, "Edited task");
      const router = join(f.target, "packages/plugin-todos/src/server/router.ts");
      await writeFile(
        router,
        (await readFile(router, "utf8")).replaceAll("Todo not found.", "Reloaded router."),
      );
      await eventually(async () => {
        const response = await fetch(restarted.url + "/api/trpc/todos/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
        });
        assert.match(await response.text(), /Reloaded router/);
      });
      await restarted.command("check-pool");
      if (template === "react-rsc") await restarted.command("check-service");
      await rpc(restarted.url, "delete", { id: todo.id });
      assert.deepEqual(await rpc(restarted.url, "list"), []);
      await restarted.close();
      const failed = await f.start("app-a", false, {
        DATABASE_URL: "postgresql://acme:acme@127.0.0.1:1/unavailable",
      });
      assert.notEqual(failed.exitCode, 0);
      assert.match(failed.logs(), /Cannot connect to PostgreSQL/);
    },
  );
}
