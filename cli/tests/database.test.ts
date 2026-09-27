import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test, type TestContext } from "node:test";

async function eventually(check: () => Promise<void>) {
  const deadline = Date.now() + 30000;
  let error: unknown;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (cause) {
      error = cause;
    }
    await delay(150);
  }
  throw error;
}

async function fixture(t: TestContext, template: string) {
  const source = fileURLToPath(new URL(`../template/${template}/`, import.meta.url));
  const target = await mkdtemp(join(tmpdir(), "cca-postgres-test-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    NODE_OPTIONS: "",
    COMPOSE_PROJECT_NAME: basename(target).toLowerCase(),
    APP_A_DB_PORT: "0",
    APP_B_DB_PORT: "0",
  };
  for (const key of ["DATABASE_URL", "PORT", "HOST", "GREETING"]) delete env[key];
  const cleanups: (() => Promise<unknown> | void)[] = [];
  function run(command: string, args: string[], cwd = target, expectedStatus = 0) {
    const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 120000 });
    assert.ifError(result.error);
    assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
    return result.stdout;
  }
  t.after(async () => {
    try {
      for (const cleanup of cleanups.reverse()) await cleanup();
    } finally {
      run("docker", ["compose", "down", "--volumes"]);
      assert.equal(dirname(resolve(target)), resolve(tmpdir()));
      assert.ok(basename(target).startsWith("cca-postgres-test-"));
      await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
  const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  run(process.execPath, [cli, "project", "--template", template]);
  await cp(join(target, "project"), target, { recursive: true });
  const packages = [];
  const workspace = new Map<string, string>();
  for (const parent of ["apps", "packages"]) {
    for (const entry of await readdir(join(target, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = `${parent}/${entry.name}`;
      const pkg = JSON.parse(await readFile(join(target, path, "package.json"), "utf8"));
      packages.push({ path, pkg });
      workspace.set(pkg.name, join(target, path));
    }
  }
  for (const { path, pkg } of packages) {
    for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const link = join(target, path, "node_modules", dependency);
      await mkdir(dirname(link), { recursive: true });
      await symlink(
        workspace.get(dependency) ??
          (await realpath(join(source, path, "node_modules", dependency))),
        link,
        process.platform === "win32" ? "junction" : "dir",
      );
    }
  }
  await symlink(
    join(source, "node_modules"),
    join(target, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await cp(new URL("./fixtures/database-runner.mjs", import.meta.url), join(target, "runner.mjs"));
  run(process.execPath, ["scripts/database.mjs", "up"]);
  for (const app of ["app-a", "app-b"]) {
    const address = run("docker", ["compose", "port", `db-${app}`, "5432"]).trim();
    await writeFile(
      join(target, "apps", app, ".env"),
      `PORT=0\nDATABASE_URL=postgresql://acme:acme@${address}/${app.replace("-", "_")}\n`,
    );
  }
  for (let i = 0; i < 2; i++) run(process.execPath, ["scripts/database.mjs", "setup"]);
  for (const { path } of packages)
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
    const child = spawn(
      process.execPath,
      [
        ...(dev ? ["--expose-internals", "--conditions=development"] : []),
        "runner.mjs",
        app,
        dev ? "dev" : "prod",
      ],
      {
        cwd: target,
        env: { ...env, NODE_ENV: dev ? "development" : "production", ...override },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    let logs = "",
      url = "";
    child.stdout!.on("data", (chunk) => {
      logs += chunk;
    });
    child.stderr!.on("data", (chunk) => {
      logs += chunk;
    });
    child.on("message", (message: { ready?: string }) => {
      url = message.ready ?? url;
    });
    const exited = once(child, "exit");
    cleanups.push(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await exited;
      }
    });
    await eventually(async () => assert.ok(url || child.exitCode !== null, logs));
    async function command(action: string) {
      const message = once(child, "message");
      child.send(action);
      await message;
    }
    return {
      url,
      logs: () => logs,
      async close() {
        child.send("close");
        const timeout = setTimeout(() => child.kill(), 5000);
        try {
          assert.deepEqual(await exited, [0, null], logs);
        } finally {
          clearTimeout(timeout);
        }
      },
      command,
      exitCode: child.exitCode,
    };
  }
  async function concurrentMigrations() {
    await Promise.all(
      [1, 2].map(async () => {
        const child = spawn(process.execPath, ["scripts/database.mjs", "migrate", "app-a"], {
          cwd: target,
          env,
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
        });
        child.stderr.on("data", (chunk) => {
          output += chunk;
        });
        assert.deepEqual(await once(child, "exit"), [0, null], output);
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

for (const template of ["fullstack", "fullstack-ssr"]) {
  test(`${template} creates manual migrations and rejects invalid names without changing history`, async (t) => {
    const source = fileURLToPath(new URL(`../template/${template}/`, import.meta.url));
    const target = await mkdtemp(join(tmpdir(), "cca-migration-test-"));
    t.after(async () => {
      assert.equal(dirname(resolve(target)), resolve(tmpdir()));
      assert.ok(basename(target).startsWith("cca-migration-test-"));
      await rm(target, { recursive: true, force: true });
    });
    await mkdir(join(target, "scripts"));
    await cp(join(source, "scripts/database.mjs"), join(target, "scripts/database.mjs"));
    await cp(join(source, "drizzle"), join(target, "drizzle"), { recursive: true });
    await symlink(
      join(source, "node_modules"),
      join(target, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const journalPath = join(target, "drizzle/meta/_journal.json");
    const original = await readFile(journalPath, "utf8");
    const initialSql = await readFile(join(target, "drizzle/0000_create_todos.sql"));
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
      await readFile(join(target, "drizzle/0001_add_users.sql"), "utf8"),
      /Write the migration SQL/,
    );
    assert.deepEqual(await readFile(join(target, "drizzle/0000_create_todos.sql")), initialSql);
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
      const migrationPath = join(f.target, "drizzle/0001_migration_probe.sql");
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
      if (template.endsWith("-ssr")) assert.match(html, /Edited task/);
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
        const count = f.run("docker", [
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
          "select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid()",
        ]);
        assert.equal(count.trim(), "0", "Pool connections must be closed");
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
