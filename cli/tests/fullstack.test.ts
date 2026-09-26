import assert from "node:assert/strict";
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
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { createApp } from "../template/fullstack/packages/runtime/src/index.ts";
import { createRouter } from "../template/fullstack/packages/plugin-hello-a/src/server/router.ts";
import { createPluginClient } from "../template/fullstack/packages/plugin-rpc/src/client.ts";
import {
  webStateSchema,
  type WebState,
} from "../template/fullstack/packages/plugin-web/src/shared.ts";
import { discover } from "../template/fullstack/packages/plugin-web/src/discover.ts";
import { buildWeb } from "../template/fullstack/packages/plugin-web/src/build.ts";

const root = fileURLToPath(new URL("../template/fullstack/", import.meta.url));
const require = createRequire(join(root, "packages/plugin-rpc/package.json"));
const { QueryClient } = require("@tanstack/react-query") as {
  QueryClient: new () => Parameters<typeof createPluginClient>[2];
};

interface RpcResult {
  result: { data: { app: string; message: string } };
}

async function pid(url: string) {
  return ((await fetch(`${url}/healthz`).then((response) => response.json())) as { pid: number })
    .pid;
}

async function eventually(check: () => Promise<void>) {
  const deadline = Date.now() + 15000;
  let error: unknown;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (cause) {
      error = cause;
    }
    await delay(100);
  }
  throw error;
}

async function fixture(t: TestContext) {
  const target = await mkdtemp(join(tmpdir(), "cca-fullstack-with spaces-"));
  const cleanups: (() => Promise<unknown> | void)[] = [];
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    assert.equal(dirname(resolve(target)), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("cca-fullstack-with spaces-"));
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  for (const file of ["package.json", "pnpm-workspace.yaml", "tsconfig.json"])
    await cp(join(root, file), join(target, file));
  const directories: string[] = [];
  const workspace = new Map<string, string>();
  for (const parent of ["apps", "packages"]) {
    for (const entry of await readdir(join(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        await readFile(join(root, parent, entry.name, "package.json"));
      } catch {
        continue;
      }
      const directory = `${parent}/${entry.name}`;
      directories.push(directory);
      await cp(join(root, directory), join(target, directory), {
        recursive: true,
        filter: (source) =>
          !["node_modules", "dist", ".turbo", ".cordis"].includes(basename(source)),
      });
      const pkg = JSON.parse(await readFile(join(root, directory, "package.json"), "utf8"));
      workspace.set(pkg.name, join(target, directory));
    }
  }
  for (const directory of directories) {
    const pkg = JSON.parse(await readFile(join(root, directory, "package.json"), "utf8"));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const link = join(target, directory, "node_modules", name);
      const dependency =
        workspace.get(name) ?? (await realpath(join(root, directory, "node_modules", name)));
      await mkdir(dirname(link), { recursive: true });
      await symlink(dependency, link, process.platform === "win32" ? "junction" : "dir");
    }
  }
  for (const app of ["app-a", "app-b"]) {
    const path = join(target, "apps", app, "cordis.yml");
    const config = (await readFile(path, "utf8")).replace(/!!js Number\(env.PORT \?\? \d+\)/, "0");
    await writeFile(path, config);
    const dist = join(target, "apps", app, "dist/client");
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(join(dist, "index.html"), `<!doctype html><title>${app} fixture</title>`);
    await writeFile(join(dist, "assets/app-hash.js"), "console.log(1)");
    await writeFile(
      join(target, "apps", app, "dist/web-manifest.json"),
      JSON.stringify([`@acme/plugin-hello-${app.slice(-1)}`]),
    );
  }
  async function start(app: string, development = false) {
    const instance = await createApp(pathToFileURL(join(target, "apps", app) + "/"), development);
    cleanups.push(async () => {
      instance.ctx.get("server")?._http.closeAllConnections();
      await instance.close();
    });
    const url = instance.ctx.get("server")!.baseUrl;
    return { ...instance, url };
  }
  return { target, cleanups, start };
}

async function stream(url: string, cleanups: (() => Promise<unknown> | void)[]) {
  const abort = new AbortController();
  cleanups.push(() => abort.abort());
  const response = await fetch(url, { signal: abort.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  async function next(): Promise<WebState | undefined> {
    const timeout = setTimeout(() => abort.abort(), 5000);
    try {
      while (true) {
        const end = pending.indexOf("\n\n");
        if (end !== -1) {
          const frame = pending.slice(0, end);
          pending = pending.slice(end + 2);
          if (frame.startsWith("data: ")) return webStateSchema.parse(JSON.parse(frame.slice(6)));
          continue;
        }
        const chunk = await reader.read();
        if (chunk.done) return undefined;
        pending += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return { next, abort };
}

async function query(url: string, id = "hello-a") {
  const response = await fetch(`${url}/api/trpc/${id}/hello`);
  assert.equal(response.status, 200);
  return ((await response.json()) as RpcResult).result.data;
}

test("fullstack RPC validates input, separates cache keys, and releases plugin resources", async (t) => {
  const f = await fixture(t);
  const app = await f.start("app-a");
  assert.equal((await query(app.url)).app, "app-a");
  const events = await stream(`${app.url}/api/web/events`, f.cleanups);
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a"],
  );

  for (const [name, status] of [
    ["Ada", 200],
    [" ", 400],
    ["x".repeat(81), 400],
  ] as const) {
    const response = await fetch(`${app.url}/api/trpc/hello-a/greet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    assert.equal(response.status, status);
    const body = (await response.json()) as RpcResult;
    if (status === 200) assert.match(body.result.data.message, /Ada/);
  }
  assert.equal((await fetch(`${app.url}/api/trpc/hello-a/greet`)).status, 405);

  const consumer = await app.ctx.plugin({
    inject: ["rpc"],
    apply(ctx) {
      ctx.rpc.register("extra", createRouter({ app: "extra", greeting: "Scoped" }));
    },
  });
  assert.equal((await query(app.url, "extra")).message, "Scoped");
  await consumer.dispose();
  assert.equal((await fetch(`${app.url}/api/trpc/extra/hello`)).status, 404);
  assert.equal(
    [...app.ctx.get("server")!.httpRoutes].filter((route) =>
      route.path.toString().includes("extra"),
    ).length,
    0,
  );

  const cache = new QueryClient();
  const a = createPluginClient<ReturnType<typeof createRouter>>("/api", "hello-a", cache);
  const b = createPluginClient<ReturnType<typeof createRouter>>("/api", "hello-b", cache);
  cache.setQueryData(a.hello.queryKey(), { app: "app-a", message: "A" });
  cache.setQueryData(b.hello.queryKey(), { app: "app-b", message: "B" });
  assert.equal(cache.getQueryData(a.hello.queryKey())?.message, "A");
  assert.equal(cache.getQueryData(b.hello.queryKey())?.message, "B");
  cache.clear();

  // Closing with an active SSE client must settle, rather than keep the port open.
  const timeout = new AbortController();
  try {
    await Promise.race([
      app.close(),
      delay(3000, undefined, { signal: timeout.signal }).then(() => {
        throw new Error("Shutdown timed out");
      }),
    ]);
  } finally {
    timeout.abort();
  }
  await events.next().catch(() => undefined);
});

test("fullstack apps serve their own assets, RPC, and plugin lifecycle independently", async (t) => {
  const f = await fixture(t);
  const a = await f.start("app-a");
  const b = await f.start("app-b");
  for (const [app, id] of [
    [a, "a"],
    [b, "b"],
  ] as const) {
    for (const path of ["/", `/hello-${id}`]) {
      const response = await fetch(app.url + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), new RegExp(`app-${id} fixture`));
      assert.equal(response.headers.get("cache-control"), "no-cache");
    }
    assert.equal((await query(app.url, `hello-${id}`)).app, `app-${id}`);
    const asset = await fetch(app.url + "/assets/app-hash.js");
    assert.match(asset.headers.get("cache-control")!, /immutable/);
    await asset.text();
    for (const path of [
      "/assets/missing.js",
      "/api/missing",
      "/.env",
      "/index.js",
      "/web-manifest.json",
    ]) {
      const response = await fetch(app.url + path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(await response.text(), /fixture/);
    }
  }
  assert.equal((await fetch(a.url + "/api/trpc/hello-b/hello")).status, 404);
  assert.equal((await fetch(b.url + "/api/trpc/hello-a/hello")).status, 404);
  const events = await stream(a.url + "/api/web/events", f.cleanups);
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a"],
  );
  const entry = [...a.ctx.get("loader")!.entries()].find(
    (entry) => entry.options.name === "@acme/plugin-hello-a",
  )!;
  await entry.update({ disabled: true });
  await eventually(async () =>
    assert.equal((await fetch(a.url + "/api/trpc/hello-a/hello")).status, 404),
  );
  assert.deepEqual((await events.next())?.plugins, []);
  await entry.update({ disabled: false });
  await eventually(async () => assert.equal((await query(a.url)).app, "app-a"));
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a"],
  );
  await a.close();
  assert.equal((await query(b.url, "hello-b")).app, "app-b");
});

test("fullstack discovery and build include disabled plugins without executing backend code", async (t) => {
  const f = await fixture(t);
  const appRoot = join(f.target, "apps/app-a");
  const original = await readFile(join(appRoot, "cordis.yml"), "utf8");
  await writeFile(
    join(appRoot, "cordis.yml"),
    original.replace("    - id: hello", "    - id: hello\n      disabled: true"),
  );
  assert.deepEqual(
    (await discover(appRoot)).plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a"],
  );
  await writeFile(
    join(f.target, "packages/plugin-hello-a/src/server/index.ts"),
    'throw new Error("Backend must not execute during build");',
  );
  await buildWeb(appRoot);
  assert.deepEqual(JSON.parse(await readFile(join(appRoot, "dist/web-manifest.json"), "utf8")), [
    "@acme/plugin-hello-a",
  ]);
  const chunks = await readdir(join(appRoot, "dist/client/assets"));
  const js = (
    await Promise.all(
      chunks
        .filter((file) => file.endsWith(".js"))
        .map((file) => readFile(join(appRoot, "dist/client/assets", file), "utf8")),
    )
  ).join("\n");
  assert.match(js, /hello-a/);
  assert.doesNotMatch(js, /hello-b/);

  await writeFile(join(appRoot, "plugins.yml"), original);
  await writeFile(
    join(appRoot, "cordis.yml"),
    '- name: "@cordisjs/plugin-include"\n  config:\n    path: ./plugins.yml\n',
  );
  assert.equal((await discover(appRoot)).files.length, 2);
  await writeFile(
    join(appRoot, "plugins.yml"),
    '- name: "@cordisjs/plugin-include"\n  config:\n    path: ./cordis.yml\n',
  );
  await assert.rejects(discover(appRoot), /Circular include/);
  await writeFile(join(appRoot, "cordis.yml"), '- name: !!js "dynamic"');
  await assert.rejects(discover(appRoot), /literal strings/);
  await writeFile(join(appRoot, "cordis.yml"), original + '\n- name: "@acme/plugin-hello-a"\n');
  await assert.rejects(discover(appRoot), /Duplicate frontend plugin/);
  await writeFile(
    join(appRoot, "cordis.yml"),
    '- name: "@cordisjs/plugin-include"\n  config:\n    path: ./plugins.yml\n    patches: []\n',
  );
  await assert.rejects(discover(appRoot), /without patches/);
});

test("fullstack production rejects missing frontend builds and stale plugin manifests", async (t) => {
  const f = await fixture(t);
  const file = join(f.target, "apps/app-a/dist/client/index.html");
  await rm(file);
  await assert.rejects(f.start("app-a"), /Missing web build/);
  await writeFile(file, "<!doctype html>");
  await writeFile(join(f.target, "apps/app-a/dist/web-manifest.json"), "[]");
  await assert.rejects(f.start("app-a"), /Frontend plugins are not built/);
});

test("fullstack development reloads YAML and backend source without restarting the process", async (t) => {
  const f = await fixture(t);
  const env = { ...process.env, NODE_OPTIONS: "", NODE_ENV: "development" };
  for (const key of ["HOST", "PORT", "GREETING"]) delete env[key as keyof typeof env];
  const child = spawn(
    process.execPath,
    ["--expose-internals", "--conditions=development", "apps/app-a/src/index.ts", "--dev"],
    {
      cwd: f.target,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    logs += String(chunk);
  });
  const exit = once(child, "exit");
  f.cleanups.push(async () => {
    if (child.exitCode === null) {
      child.kill();
      await exit;
    }
  });
  let url = "";
  await eventually(async () => {
    const match = logs.match(/server listening at (http:\/\/[^\s]+)/);
    assert.ok(match, logs);
    url = match[1]!;
    assert.equal(await pid(url), child.pid);
    const ready = await fetch(`${url}/api/web/events`);
    await ready.body?.cancel();
    assert.equal(ready.status, 200, logs);
  });
  const events = await stream(`${url}/api/web/events`, f.cleanups);
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a"],
  );
  const path = join(f.target, "apps/app-a/cordis.yml");
  const original = await readFile(path, "utf8");
  await writeFile(
    path,
    original.replace("    - id: hello", "    - id: hello\n      disabled: true"),
  );
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    [],
  );
  await eventually(async () =>
    assert.equal((await fetch(`${url}/api/trpc/hello-a/hello`)).status, 404),
  );
  await delay(200);
  await writeFile(path, original);
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a"],
  );
  const source = join(f.target, "packages/plugin-hello-a/src/server/router.ts");
  await writeFile(
    source,
    (await readFile(source, "utf8")).replace("message: config.greeting", 'message: "HMR updated"'),
  );
  await eventually(async () => assert.equal((await query(url)).message, "HMR updated"));
  assert.equal(await pid(url), child.pid);
  const infrastructure = join(f.target, "packages/plugin-web/src/index.ts");
  await writeFile(
    infrastructure,
    (await readFile(infrastructure, "utf8")) + "\n// Infrastructure changes require a restart.\n",
  );
  await delay(400);
  assert.doesNotMatch(logs, /reload plugin at packages[\\/]plugin-web/);
});

test("fullstack web lifecycle includes plugins without an RPC router", async (t) => {
  const f = await fixture(t);
  const directory = join(f.target, "packages/plugin-card-only");
  await mkdir(directory);
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "@acme/plugin-card-only",
      type: "module",
      exports: { ".": "./index.js", "./web": "./client.js" },
    }),
  );
  await writeFile(
    join(directory, "index.js"),
    'export const name = "card-only"; export function apply() {}',
  );
  await writeFile(
    join(directory, "client.js"),
    "export function createPlugin() { return { cards: [] }; }",
  );
  await symlink(
    directory,
    join(f.target, "apps/app-a/node_modules/@acme/plugin-card-only"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const config = join(f.target, "apps/app-a/cordis.yml");
  await writeFile(
    config,
    (await readFile(config, "utf8")) + '\n- id: card-only\n  name: "@acme/plugin-card-only"\n',
  );
  await writeFile(
    join(f.target, "apps/app-a/dist/web-manifest.json"),
    JSON.stringify(["@acme/plugin-hello-a", "@acme/plugin-card-only"]),
  );
  const app = await f.start("app-a");
  const events = await stream(app.url + "/api/web/events", f.cleanups);
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a", "@acme/plugin-card-only"],
  );
  const entry = [...app.ctx.get("loader")!.entries()].find(
    (entry) => entry.options.name === "@acme/plugin-card-only",
  )!;
  await entry.update({ disabled: true });
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a"],
  );
  assert.equal((await query(app.url)).app, "app-a");
});

test("fullstack Vite HMR shares the HTTP port and closes active browser connections", async (t) => {
  const f = await fixture(t);
  const config = join(f.target, "apps/app-a/cordis.yml");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace("!!js env.NODE_ENV === 'development'", "true"),
  );
  const app = await f.start("app-a", true);
  const html = await fetch(app.url + "/hello-a").then((response) => response.text());
  assert.match(html, /\/@vite\/client/);
  const events = await stream(app.url + "/api/web/events", f.cleanups);
  assert.deepEqual(
    (await events.next())?.plugins.map(({ name }) => name),
    ["@acme/plugin-hello-a"],
  );
  const websocket = new WebSocket(app.url.replace("http:", "ws:") + "/@vite/hmr", "vite-hmr");
  f.cleanups.push(() => websocket.close());
  const message = once(websocket, "message");
  await once(websocket, "open");
  assert.equal(JSON.parse((await message)[0].data).type, "connected");
  const timeout = new AbortController();
  try {
    await Promise.race([
      app.close(),
      delay(5000, undefined, { signal: timeout.signal }).then(() => {
        throw new Error("Development shutdown timed out");
      }),
    ]);
  } finally {
    timeout.abort();
  }
});
