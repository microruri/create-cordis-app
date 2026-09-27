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
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test, type TestContext } from "node:test";

const root = fileURLToPath(new URL("../template/fullstack-ssr/", import.meta.url));

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

async function fixture(t: TestContext) {
  const target = await mkdtemp(join(tmpdir(), "cca-ssr-with spaces-"));
  const cleanups: (() => Promise<unknown> | void)[] = [];
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    assert.equal(dirname(resolve(target)), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("cca-ssr-with spaces-"));
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  await cp(root, target, {
    recursive: true,
    filter: (source) =>
      !["node_modules", "dist", ".turbo", ".cordis", "pnpm-lock.yaml"].includes(basename(source)) &&
      (!basename(source).startsWith(".env") || basename(source) === ".env.example"),
  });
  const directories: string[] = [];
  const workspace = new Map<string, string>();
  for (const parent of ["apps", "packages"]) {
    for (const entry of await readdir(join(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = `${parent}/${entry.name}`;
      if (!existsSync(join(root, directory, "package.json"))) continue;
      directories.push(directory);
      const pkg = JSON.parse(await readFile(join(root, directory, "package.json"), "utf8"));
      workspace.set(pkg.name, join(target, directory));
    }
  }
  for (const directory of directories) {
    const pkg = JSON.parse(await readFile(join(root, directory, "package.json"), "utf8"));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const link = join(target, directory, "node_modules", name);
      await mkdir(dirname(link), { recursive: true });
      await symlink(
        workspace.get(name) ?? (await realpath(join(root, directory, "node_modules", name))),
        link,
        process.platform === "win32" ? "junction" : "dir",
      );
    }
  }
  await symlink(
    join(root, "node_modules"),
    join(target, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await cp(new URL("./fixtures/ssr-runner.mjs", import.meta.url), join(target, "runner.mjs"));
  for (const app of ["app-a", "app-b"]) {
    const path = join(target, "apps", app, "cordis.yml");
    await writeFile(
      path,
      (await readFile(path, "utf8"))
        .replace(/    - id: (?:database|todos)\r?\n[\s\S]*?(?=    - id:|$)/g, "")
        .replace(/!!js Number\(env.PORT \?\? \d+\)/, "0"),
    );
  }
  function child(args: string[], cwd = target, development = false) {
    const env: NodeJS.ProcessEnv = {
      ...globalThis.process.env,
      NODE_OPTIONS: "",
      NODE_ENV: development ? "development" : "production",
    };
    for (const key of ["HOST", "PORT", "GREETING"]) delete env[key];
    const process = spawn(globalThis.process.execPath, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let logs = "";
    process.stdout!.on("data", (chunk) => {
      logs += chunk;
    });
    process.stderr!.on("data", (chunk) => {
      logs += chunk;
    });
    const exit = once(process, "exit");
    cleanups.push(async () => {
      if (process.exitCode === null && process.signalCode === null) {
        process.kill();
        await exit;
      }
    });
    return { process, exit, logs: () => logs };
  }
  async function start(app: string, development = false) {
    const running = child(
      [
        ...(development ? ["--expose-internals", "--conditions=development"] : []),
        "runner.mjs",
        app,
        development ? "dev" : "prod",
      ],
      target,
      development,
    );
    let url = "";
    running.process.on("message", (message: { ready?: string }) => {
      url = message.ready ?? url;
    });
    await eventually(async () => {
      assert.ok(url, running.logs());
    });
    return {
      ...running,
      url,
      async close() {
        running.process.send("close");
        const timeout = setTimeout(() => running.process.kill(), 5000);
        try {
          assert.deepEqual(await running.exit, [0, null], running.logs());
        } finally {
          clearTimeout(timeout);
        }
      },
    };
  }
  async function build() {
    for (const directory of directories) {
      const result = child(
        [
          join(target, "node_modules/rolldown/bin/cli.mjs"),
          "-c",
          "../../rolldown.config.ts",
          "--configLoader",
          "native",
        ],
        join(target, directory),
      );
      assert.deepEqual(await result.exit, [0, null], result.logs());
    }
    for (const app of ["app-a", "app-b"]) {
      const result = child(
        [join(target, "packages/plugin-web/bin/cordis-web.mjs"), "build"],
        join(target, "apps", app),
      );
      assert.deepEqual(await result.exit, [0, null], result.logs());
    }
  }
  return { target, cleanups, start, build, child };
}

async function addRequestPages(target: string) {
  const directory = join(target, "packages/plugin-hello-a/src/web/request-test");
  await mkdir(directory);
  const manifest = join(target, "packages/plugin-hello-a/src/web/pages.ts");
  await writeFile(
    manifest,
    (await readFile(manifest, "utf8")) +
      '\npages.push({ id: "request", path: "/request-test", title: "Request", component: () => import("./request-test/Page.tsx") });\n' +
      'pages.push({ id: "item", path: "/items/$id", title: "Item", component: () => import("./request-test/Page.tsx") });\n',
  );
  await cp(new URL("./fixtures/rsc-page.tsx", import.meta.url), join(directory, "Page.tsx"));
  const navigation = join(target, "packages/plugin-hello-a/src/web/navigation-test");
  await mkdir(navigation);
  await cp(
    new URL("./fixtures/navigation-page.tsx", import.meta.url),
    join(navigation, "Page.tsx"),
  );
  await cp(
    new URL("./fixtures/navigation-controls.tsx", import.meta.url),
    join(navigation, "Controls.tsx"),
  );
  await writeFile(
    manifest,
    (await readFile(manifest, "utf8")) +
      '\npages.push({ id: "navigation", path: "/navigation-test", title: "Navigation", component: () => import("./navigation-test/Page.tsx") });\n',
  );
  return manifest;
}

async function verifyStreaming(app: { url: string; logs: () => string }) {
  const response = await fetch(app.url + "/request-test?slow");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let html = "";
  while (!html.includes("Waiting for data")) {
    const chunk = await reader.read();
    assert.ok(!chunk.done, html + "\n" + app.logs());
    html += decoder.decode(chunk.value, { stream: true });
  }
  assert.match(html, /Request shell/);
  assert.doesNotMatch(html, /Request completed/);
  await fetch(app.url + "/api/test/release");
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    html += decoder.decode(chunk.value, { stream: true });
  }
  assert.match(html, /Request completed/);

  const controller = new AbortController();
  const slow = await fetch(app.url + "/request-test?slow", { signal: controller.signal });
  const body = slow.text().catch((error: Error) => error.name);
  await eventually(async () =>
    assert.equal((app.logs().match(/Slow component started/g) ?? []).length, 2),
  );
  controller.abort();
  assert.equal(await body, "AbortError");
  await eventually(async () => assert.match(app.logs(), /Slow component aborted/));
}

test(
  "RSC production isolates apps, streams pages, and serves HTTP without Vite",
  { timeout: 120000 },
  async (t) => {
    const f = await fixture(t);
    const manifest = await addRequestPages(f.target);
    await f.build();
    for (const suffix of ["a", "b"]) {
      const app = await f.start("app-" + suffix);
      const response = await fetch(app.url + "/hello-" + suffix);
      const html = await response.text();
      assert.equal(response.status, 200, html);
      assert.match(html, new RegExp("Hello from app-" + suffix + "!"));
      assert.match(html, /id="name"/);
      assert.match(html, /rel="stylesheet"/);
      assert.match(html, /rel="modulepreload"/);
      assert.doesNotMatch(html, /@vite\/client/);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("vary"), "Accept");
      const head = await fetch(app.url + "/hello-" + suffix, { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), "");
      const rsc = await fetch(app.url + "/hello-" + suffix, {
        headers: { Accept: "text/x-component" },
      });
      assert.equal(rsc.status, 200);
      assert.match(rsc.headers.get("content-type")!, /text\/x-component/);
      assert.match(await rsc.text(), new RegExp("Hello from app-" + suffix + "!"));
      assert.equal((await fetch(app.url + "/api/web/page?url=/")).status, 404);
      const rpc = (await fetch(app.url + "/api/trpc/hello-" + suffix + "/hello").then((r) =>
        r.json(),
      )) as { result: { data: { app: string } } };
      assert.equal(rpc.result.data.app, "app-" + suffix);

      if (suffix === "a") {
        const navigationPage = () => fetch(app.url + "/navigation-test").then((r) => r.text());
        assert.match(await navigationPage(), /Query value: <!-- -->0/);
        await fetch(app.url + "/api/trpc/navigation-test/change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "null",
        });
        const refreshed = await navigationPage();
        assert.match(refreshed, /Server value: <!-- -->1/);
        assert.match(refreshed, /Query value: <!-- -->1/);
        assert.match(refreshed, /dataUpdatedAt/);
        const cookies = ["session=alpha", "session=beta"];
        await Promise.all(
          cookies.map(async (cookie) => {
            const result = await fetch(app.url + "/request-test", { headers: { cookie } }).then(
              (r) => r.text(),
            );
            assert.match(result, new RegExp(cookie));
            assert.doesNotMatch(result, new RegExp(cookies.find((value) => value !== cookie)!));
          }),
        );
        assert.match(await fetch(app.url + "/items/42").then((r) => r.text()), /Item 42/);
        assert.equal((await fetch(app.url + "/items/%ZZ")).status, 400);
        const redirect = await fetch(app.url + "/request-test?redirect", { redirect: "manual" });
        assert.equal(redirect.status, 302);
        assert.equal(redirect.headers.get("location"), "/hello-a");
        const nav = await fetch(app.url + "/request-test?redirect", {
          headers: { Accept: "text/x-component" },
        });
        assert.equal(nav.url, app.url + "/hello-a");
        assert.match(nav.headers.get("content-type")!, /text\/x-component/);
        assert.equal((await fetch(app.url + "/request-test?missing")).status, 404);
        for (const accept of ["text/html", "text/x-component"]) {
          const failure = await fetch(app.url + "/request-test?failure", {
            headers: { Accept: accept },
          });
          assert.equal(failure.status, 500);
          assert.doesNotMatch(await failure.text(), /ServerOnlySecret/);
        }
        const escaped = await fetch(app.url + "/request-test?escape").then((r) => r.text());
        assert.doesNotMatch(escaped, /<script>alert\("unsafe"\)<\/script>/);
        assert.match(escaped, /&lt;script&gt;/);
        const late = await fetch(app.url + "/request-test?lateFailure");
        assert.equal(late.status, 200);
        assert.doesNotMatch(await late.text(), /ServerOnlySecret/);
        await verifyStreaming(app);
      }
      for (const path of [
        "/missing",
        "/hello-" + (suffix === "a" ? "b" : "a"),
        "/assets/missing.js",
        "/api/missing",
        "/.env",
      ]) {
        assert.equal((await fetch(app.url + path)).status, 404, path);
        assert.equal(
          (await fetch(app.url + path, { headers: { Accept: "text/x-component" } })).status,
          404,
          path,
        );
      }
      const assets = join(f.target, "apps/app-" + suffix + "/dist/web/client/assets");
      for (const file of await readdir(assets)) {
        if (!file.endsWith(".js")) continue;
        const source = await readFile(join(assets, file), "utf8");
        assert.doesNotMatch(source, /ServerOnlySecret|node:fs|pg-pool|Request shell/);
      }
      const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.js)"/g)].map(
        (match) => match[1]!,
      );
      assert.ok(scripts.length);
      for (const script of scripts)
        assert.match((await fetch(app.url + script)).headers.get("cache-control")!, /immutable/);
      await app.close();
    }
    const configPath = join(f.target, "apps/app-a/cordis.yml");
    const original = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      original.replace("    - id: hello", "    - id: hello\n      disabled: true"),
    );
    const disabled = await f.start("app-a");
    assert.equal((await fetch(disabled.url + "/hello-a")).status, 404);
    assert.equal(
      (await fetch(disabled.url + "/hello-a", { headers: { Accept: "text/x-component" } })).status,
      404,
    );
    assert.doesNotMatch(await fetch(disabled.url).then((r) => r.text()), /href="\/hello-a"/);
    await disabled.close();
    await writeFile(configPath, original);
    await writeFile(join(f.target, "apps/app-a/dist/web-manifest.json"), "[]");
    const stale = f.child(["runner.mjs", "app-a", "prod"]);
    assert.notEqual((await stale.exit)[0], 0);
    assert.match(stale.logs(), /Frontend plugins are not built/);
    await rm(join(f.target, "apps/app-a/dist/web/rsc/index.js"));
    const missing = f.child(["runner.mjs", "app-a", "prod"]);
    assert.notEqual((await missing.exit)[0], 0);
    assert.match(missing.logs(), /Missing RSC build/);
    const originalManifest = await readFile(manifest, "utf8");
    await writeFile(
      manifest,
      originalManifest.replace('path: "/request-test"', 'path: "/hello-a"'),
    );
    const duplicate = f.child(
      [join(f.target, "packages/plugin-web/bin/cordis-web.mjs"), "build"],
      join(f.target, "apps/app-a"),
    );
    assert.notEqual((await duplicate.exit)[0], 0);
    assert.match(duplicate.logs(), /Duplicate page route/);
    await writeFile(manifest, originalManifest);
    const browserPage = join(f.target, "packages/plugin-hello-a/src/web/hello-a/Greeting.tsx");
    await writeFile(
      browserPage,
      (await readFile(browserPage, "utf8")) +
        '\nimport Page from "./Page.tsx"; console.log(Page);\n',
    );
    const boundary = f.child(
      [join(f.target, "packages/plugin-web/bin/cordis-web.mjs"), "build"],
      join(f.target, "apps/app-a"),
    );
    assert.notEqual((await boundary.exit)[0], 0);
    assert.match(boundary.logs(), /server-only|Server-only/);
  },
);

test(
  "SSR development reloads YAML, backend code, and page manifests, then closes HMR connections",
  { timeout: 90000 },
  async (t) => {
    const f = await fixture(t);
    await addRequestPages(f.target);
    const app = await f.start("app-a", true);
    await verifyStreaming(app);
    const page = () => fetch(app.url + "/hello-a").then((r) => r.text());
    assert.match(await page(), /Hello from app-a!/);
    assert.doesNotMatch(app.logs(), /Unable to parse HTML|unexpected-null-character/);
    const websocket = new WebSocket(app.url.replace("http:", "ws:") + "/@vite/hmr", "vite-hmr");
    f.cleanups.push(() => websocket.close());
    await once(websocket, "open");
    const config = join(f.target, "apps/app-a/cordis.yml");
    const original = await readFile(config, "utf8");
    await writeFile(
      config,
      original.replace("    - id: hello", "    - id: hello\n      disabled: true"),
    );
    await eventually(async () => assert.equal((await fetch(app.url + "/hello-a")).status, 404));
    await delay(300);
    await writeFile(config, original);
    await eventually(async () => assert.match(await page(), /Hello from app-a!/, app.logs()));
    const router = join(f.target, "packages/plugin-hello-a/src/server/router.ts");
    await writeFile(
      router,
      (await readFile(router, "utf8")).replace(
        "message: config.greeting }",
        'message: config.greeting + " Reloaded" }',
      ),
    );
    await eventually(async () => assert.match(await page(), /Hello from app-a! Reloaded/));
    assert.equal(
      ((await fetch(app.url + "/healthz").then((r) => r.json())) as { pid: number }).pid,
      app.process.pid,
    );
    const extra = join(f.target, "packages/plugin-hello-a/src/web/extra");
    await mkdir(extra);
    const manifest = join(f.target, "packages/plugin-hello-a/src/web/pages.ts");
    const originalManifest = await readFile(manifest, "utf8");
    await writeFile(
      join(extra, "Page.tsx"),
      "export default function Page() { return <h1>Added page</h1>; }",
    );
    await writeFile(
      manifest,
      originalManifest +
        '\npages.push({ id: "extra", path: "/extra", title: "Extra", component: () => import("./extra/Page.tsx") });\n',
    );
    await eventually(async () =>
      assert.match(await fetch(app.url + "/extra").then((r) => r.text()), /Added page/, app.logs()),
    );
    await writeFile(
      manifest,
      (await readFile(manifest, "utf8")).replace('path: "/extra"', 'path: "/renamed"'),
    );
    await eventually(async () =>
      assert.match(
        await fetch(app.url + "/renamed").then((r) => r.text()),
        /Added page/,
        app.logs(),
      ),
    );
    await writeFile(manifest, originalManifest);
    await eventually(async () => assert.equal((await fetch(app.url + "/renamed")).status, 404));
    const activeSocket = new WebSocket(app.url.replace("http:", "ws:") + "/@vite/hmr", "vite-hmr");
    f.cleanups.push(() => activeSocket.close());
    await once(activeSocket, "open");
    await app.close();
  },
);
