import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { test, type TestContext } from "node:test";
import { createApp } from "../template/workspace/packages/runtime/src/index.ts";

const root = fileURLToPath(new URL("../template/workspace/", import.meta.url));
const directories = [
  "apps/app-a",
  "apps/app-b",
  "packages/runtime",
  "packages/plugin-hello-a",
  "packages/plugin-hello-b",
];

async function json(url: string, status = 200) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, status);
  const body: unknown = await response.json();
  assert.ok(body && typeof body === "object" && !Array.isArray(body));
  return body as Record<string, unknown>;
}

async function eventually(check: () => Promise<void>, diagnostics = () => "") {
  const deadline = Date.now() + 15000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`Condition did not settle: ${String(lastError)}\n${diagnostics()}`);
}

async function edit(path: string, content: string) {
  // Space edits apart so the file watcher does not coalesce separate test steps.
  await delay(150);
  await writeFile(path, content);
}

async function fixture(t: TestContext) {
  const target = await mkdtemp(join(tmpdir(), "acme-workspace-"));
  const cleanups: (() => Promise<unknown>)[] = [];
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    const resolved = resolve(target);
    assert.equal(dirname(resolved), resolve(tmpdir()));
    assert.ok(resolved.startsWith(join(resolve(tmpdir()), "acme-workspace-")));
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const workspace = new Map<string, string>();
  for (const directory of directories) {
    const source = join(root, directory);
    const destination = join(target, directory);
    await mkdir(destination, { recursive: true });
    await cp(join(source, "src"), join(destination, "src"), { recursive: true });
    await cp(join(source, "package.json"), join(destination, "package.json"));
    if (directory.startsWith("apps/")) {
      for (const file of ["cordis.yml", "cordis.dev.yml"]) {
        await cp(join(source, file), join(destination, file));
      }
    }
    const pkg = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    workspace.set(pkg.name, destination);
  }

  // External dependencies stay shared; workspace dependencies point at the fixture.
  for (const directory of directories) {
    const source = join(root, directory);
    const destination = join(target, directory);
    const pkg = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const link = join(destination, "node_modules", name);
      const dependency =
        workspace.get(name) ?? (await realpath(join(source, "node_modules", name)));
      await mkdir(dirname(link), { recursive: true });
      await symlink(dependency, link, process.platform === "win32" ? "junction" : "dir");
    }
  }

  const appRoot = (app = "app-a") => pathToFileURL(join(target, "apps", app) + "/");
  const configPath = join(target, "apps/app-a/cordis.yml");
  return { target, cleanups, appRoot, configPath };
}

async function localConfig(path: string, port = 0) {
  const config = (await readFile(path, "utf8"))
    .replace("!!js env.HOST ?? '127.0.0.1'", "'127.0.0.1'")
    .replace("!!js Number(env.PORT ?? 3081)", String(port))
    .replace("!!js env.GREETING ?? 'Hello from app-a!'", "'Test greeting'");
  await writeFile(path, config);
  return config;
}

function childEnv() {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "" };
  for (const key of ["HOST", "PORT", "GREETING", "NODE_ENV"]) delete env[key];
  return env;
}

function launch(target: string, app: string, cleanups: (() => Promise<unknown>)[]) {
  const child = spawn(
    process.execPath,
    ["--expose-internals", "--conditions=development", `apps/${app}/src/index.ts`, "--dev"],
    { cwd: target, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  const exited = once(child, "exit");
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await exited;
    }
  };
  cleanups.push(stop);
  return { child, output: () => stripVTControlCharacters(output), stop };
}

async function listening(process: { child: ChildProcess; output: () => string }) {
  let url = "";
  await eventually(async () => {
    const match = process.output().match(/server listening at (http:\/\/[^\s]+)/);
    assert.ok(match, process.output());
    url = match[1]!;
    assert.equal((await json(`${url}/healthz`)).pid, process.child.pid);
  }, process.output);
  return url;
}

test("official Server routes, errors, scoped cleanup, and port reuse", async (t) => {
  const f = await fixture(t);
  const original = await localConfig(f.configPath);
  const app = await createApp(f.appRoot());
  f.cleanups.push(app.close);
  const server = app.ctx.get("server");
  assert.ok(server);
  const url = server.baseUrl;
  assert.deepEqual(await json(`${url}/healthz`), { ok: true, app: "app-a", pid: process.pid });
  assert.deepEqual(await json(`${url}/api/hello`), { app: "app-a", message: "Test greeting" });
  assert.deepEqual(await json(`${url}/missing`, 404), { error: "Not found" });
  assert.equal((await fetch(`${url}/api/hello`, { method: "POST" })).status, 405);

  const consumer = await app.ctx.plugin({
    inject: ["server"],
    apply(ctx) {
      ctx.server.get("/error", async () => {
        throw new Error("Expected handler failure");
      });
      ctx.server.post("/validate", async (request) => {
        await request.json({
          "~standard": {
            version: 1,
            vendor: "test",
            validate: () => ({ issues: [{ message: "Expected validation failure" }] }),
          },
        });
      });
    },
  });
  assert.deepEqual(await json(`${url}/error`, 500), { error: "Internal server error" });
  const invalid = await fetch(`${url}/validate`, { method: "POST", body: "{}" });
  assert.equal(invalid.status, 422);
  assert.deepEqual(await invalid.json(), { issues: [{ message: "Expected validation failure" }] });
  await consumer.dispose();
  assert.deepEqual(await json(`${url}/error`, 404), { error: "Not found" });
  assert.equal(server.httpRoutes.length, 2);

  await Promise.all([app.close(), app.close()]);
  assert.equal(await readFile(f.configPath, "utf8"), original);
  await writeFile(f.configPath, original.replace("port: 0", `port: ${server.port}`));
  const replacement = await createApp(f.appRoot());
  f.cleanups.push(replacement.close);
  await eventually(async () => {
    assert.equal((await json(`${url}/healthz`)).ok, true);
  });
});

test("startup rejects occupied ports and broken configuration, but permits disabled plugins", async (t) => {
  const f = await fixture(t);
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  f.cleanups.push(() => new Promise<void>((done) => reservation.close(() => done())));
  const address = reservation.address();
  assert.ok(address && typeof address !== "string");
  const original = await localConfig(f.configPath, address.port);
  await assert.rejects(createApp(f.appRoot()), /server/);

  for (const config of [
    "[invalid YAML",
    "{}",
    "- id: missing\n  name: '@acme/does-not-exist'\n",
    original.replace(String(address.port), "65536"),
    original.replace(String(address.port), ".nan"),
    original
      .replace("@acme/plugin-hello-a", "@acme/does-not-exist")
      .replace(String(address.port), "0"),
  ]) {
    await writeFile(f.configPath, config);
    await assert.rejects(createApp(f.appRoot()), /Plugin (failed|is not active|did not load)/);
  }
  await rm(f.configPath);
  await assert.rejects(createApp(f.appRoot()), /include/);

  await writeFile(
    f.configPath,
    `- id: disabled
  name: '@acme/does-not-exist'
  disabled: true
- id: disabled-group
  name: '@cordisjs/plugin-group'
  group: true
  disabled: true
  config:
    - id: disabled-child
      name: '@acme/also-missing'
`,
  );
  const disabled = await createApp(f.appRoot());
  await disabled.close();
  await writeFile(f.configPath, original.replace(String(address.port), "0"));
  const repaired = await createApp(f.appRoot());
  f.cleanups.push(repaired.close);
  assert.ok(repaired.ctx.get("server"));
});

test("development without Node internals fails clearly", async (t) => {
  const f = await fixture(t);
  const result = spawnSync(
    process.execPath,
    ["--conditions=development", "apps/app-a/src/index.ts", "--dev"],
    { cwd: f.target, env: childEnv(), encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stderr,
    /Startup failed: Plugin HMR requires Node 24 with --expose-internals/,
  );
});

test(
  "two independent apps reload their own plugins and app-local YAML",
  { timeout: 90000 },
  async (t) => {
    const f = await fixture(t);
    for (const app of ["app-a", "app-b"]) {
      await writeFile(
        join(f.target, "apps", app, ".env"),
        `HOST=127.0.0.1\nPORT=0\nGREETING="Local ${app}"\n`,
      );
    }
    await writeFile(join(f.target, ".env"), "PORT=invalid\nGREETING=Wrong directory\n");
    const a = launch(f.target, "app-a", f.cleanups);
    const b = launch(f.target, "app-b", f.cleanups);
    let urlA = await listening(a);
    const urlB = await listening(b);
    assert.notEqual(a.child.pid, b.child.pid);
    assert.notEqual(urlA, urlB);
    const diagnostics = () => a.output() + b.output();
    const assertApps = async (greetingA: string, greetingB: string) => {
      assert.deepEqual(await json(`${urlA}/api/hello`), { app: "app-a", message: greetingA });
      assert.deepEqual(await json(`${urlB}/api/hello`), { app: "app-b", message: greetingB });
      assert.equal((await json(`${urlA}/healthz`)).pid, a.child.pid);
      assert.equal((await json(`${urlB}/healthz`)).pid, b.child.pid);
    };
    await assertApps("Local app-a", "Local app-b");
    const initialA = await readFile(f.configPath, "utf8");
    const bPath = join(f.target, "apps/app-b/cordis.yml");
    const initialB = await readFile(bPath, "utf8");
    // Chokidar's initial scan finishes after plugin activation.
    await delay(600);

    let greetingA = "Local app-a";
    let greetingB = "Local app-b";
    for (const [key, current, other] of [
      ["a", a, b],
      ["b", b, a],
    ] as const) {
      const messagePath = join(f.target, `packages/plugin-hello-${key}/src/message.ts`);
      const otherReloads = (other.output().match(/reload plugin at/g) ?? []).length;
      const expectGreeting = (suffix: string) => {
        if (key === "a") greetingA = "Local app-a" + suffix;
        else greetingB = "Local app-b" + suffix;
      };
      for (const suffix of [" first", " second"]) {
        await edit(
          messagePath,
          `export function createMessage(app: string, greeting: string) {
  return { app, message: greeting + ${JSON.stringify(suffix)} };
}
`,
        );
        expectGreeting(suffix);
        await eventually(() => assertApps(greetingA, greetingB), diagnostics);
      }
      await edit(messagePath, "export function createMessage( {\n");
      await eventually(async () => {
        assert.match(current.output(), /SyntaxError|Unexpected|Expected/);
      }, diagnostics);
      await assertApps(greetingA, greetingB);
      await edit(
        messagePath,
        `export function createMessage(app: string, greeting: string) {
  return { app, message: greeting + " recovered" };
}
`,
      );
      expectGreeting(" recovered");
      await eventually(() => assertApps(greetingA, greetingB), diagnostics);
      assert.equal((other.output().match(/reload plugin at/g) ?? []).length, otherReloads);
    }
    assert.equal(await readFile(f.configPath, "utf8"), initialA);
    assert.equal(await readFile(bPath, "utf8"), initialB);

    const changedA = initialA.replace("!!js env.GREETING ?? 'Hello from app-a!'", "'YAML app-a'");
    await edit(f.configPath, changedA);
    await eventually(
      () => assertApps("YAML app-a recovered", "Local app-b recovered"),
      diagnostics,
    );
    await edit(f.configPath, "[invalid YAML");
    await eventually(async () => {
      assert.match(a.output(), /failed to parse config file/);
    }, diagnostics);
    await assertApps("YAML app-a recovered", "Local app-b recovered");
    await edit(f.configPath, initialA);
    await eventually(
      () => assertApps("Local app-a recovered", "Local app-b recovered"),
      diagnostics,
    );

    const oldPort = Number(new URL(urlA).port);
    await edit(f.configPath, initialA.replace("  group: true", "  group: true\n  disabled: true"));
    await eventually(async () => {
      await assert.rejects(fetch(`${urlA}/healthz`, { signal: AbortSignal.timeout(1000) }));
      assert.equal((await json(`${urlB}/healthz`)).pid, b.child.pid);
    }, diagnostics);
    const fixedPort = initialA.replace("!!js Number(env.PORT ?? 3081)", String(oldPort));
    await edit(f.configPath, fixedPort);
    await eventually(
      () => assertApps("Local app-a recovered", "Local app-b recovered"),
      diagnostics,
    );

    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const address = probe.address();
    assert.ok(address && typeof address !== "string");
    await new Promise<void>((done) => probe.close(() => done()));
    await edit(
      f.configPath,
      initialA.replace("!!js Number(env.PORT ?? 3081)", String(address.port)),
    );
    const oldUrl = urlA;
    urlA = `http://127.0.0.1:${address.port}`;
    await eventually(
      () => assertApps("Local app-a recovered", "Local app-b recovered"),
      diagnostics,
    );
    await assert.rejects(fetch(`${oldUrl}/healthz`, { signal: AbortSignal.timeout(1000) }));
    assert.equal(await readFile(bPath, "utf8"), initialB);

    await a.stop();
    assert.deepEqual(await json(`${urlB}/api/hello`), {
      app: "app-b",
      message: "Local app-b recovered",
    });
  },
);
