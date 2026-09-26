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
      !["node_modules", "dist", ".turbo", ".cordis", "pnpm-lock.yaml"].includes(basename(source)),
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
      (await readFile(path, "utf8")).replace(/!!js Number\(env.PORT \?\? \d+\)/, "0"),
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

test(
  "SSR production builds isolated apps, renders data, and serves HTTP without Vite",
  { timeout: 120000 },
  async (t) => {
    const f = await fixture(t);
    const requestPage = join(f.target, "packages/plugin-hello-a/src/web/request-test");
    await mkdir(requestPage);
    await writeFile(join(requestPage, "+config.ts"), 'export default { route: "/request-test" };');
    await writeFile(
      join(requestPage, "+data.ts"),
      `import { redirect } from "vike/abort";
export default function data({ request }) {
  if (request.url.includes("redirect")) throw redirect("/hello-a", 302);
  if (request.url.includes("failure")) throw new Error("ServerOnlySecret");
  return request.headers.get("cookie");
}`,
    );
    await writeFile(
      join(requestPage, "+Page.tsx"),
      'import { useData } from "vike-react/useData"; export default function Page() { return <p>{useData()}</p>; }',
    );
    await f.build();
    for (const suffix of ["a", "b"]) {
      const app = await f.start(`app-${suffix}`);
      const response = await fetch(`${app.url}/hello-${suffix}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, new RegExp(`Hello from app-${suffix}!`));
      assert.match(html, /id="name"/);
      assert.doesNotMatch(html, /@vite\/client|"cordis":|"request":/);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const head = await fetch(`${app.url}/hello-${suffix}`, { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), "");
      const rpc = (await fetch(`${app.url}/api/trpc/hello-${suffix}/hello`).then((r) =>
        r.json(),
      )) as { result: { data: { app: string } } };
      assert.equal(rpc.result.data.app, `app-${suffix}`);
      if (suffix === "a") {
        const cookies = ["session=alpha", "session=beta"];
        await Promise.all(
          cookies.map(async (cookie) => {
            const html = await fetch(app.url + "/request-test", { headers: { cookie } }).then((r) =>
              r.text(),
            );
            assert.match(html, new RegExp(cookie));
            assert.doesNotMatch(html, new RegExp(cookies.find((value) => value !== cookie)!));
          }),
        );
        const redirect = await fetch(app.url + "/request-test?redirect", { redirect: "manual" });
        assert.equal(redirect.status, 302);
        assert.equal(redirect.headers.get("location"), "/hello-a");
        const failure = await fetch(app.url + "/request-test?failure");
        assert.equal(failure.status, 500);
        assert.doesNotMatch(await failure.text(), /ServerOnlySecret/);
      }
      for (const path of [
        "/missing",
        `/hello-${suffix === "a" ? "b" : "a"}`,
        "/assets/missing.js",
        "/api/missing",
        "/.env",
      ]) {
        assert.equal((await fetch(app.url + path)).status, 404, path);
      }
      const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.js)"/g)].map(
        (match) => match[1]!,
      );
      assert.ok(scripts.length);
      for (const script of scripts) {
        const asset = await fetch(app.url + script);
        assert.match(asset.headers.get("cache-control")!, /immutable/);
        assert.doesNotMatch(
          await asset.text(),
          /Hello from app-[ab]!|node:fs|createRouter|GreetingSecret/,
        );
      }
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
    assert.equal((await fetch(disabled.url + "/api/trpc/hello-a/hello")).status, 404);
    assert.doesNotMatch(await fetch(disabled.url).then((r) => r.text()), /href="\/hello-a"/);
    await disabled.close();
    await writeFile(configPath, original);
    await writeFile(join(f.target, "apps/app-a/dist/web-manifest.json"), "[]");
    const stale = f.child(["runner.mjs", "app-a", "prod"]);
    assert.notEqual((await stale.exit)[0], 0, stale.logs());
    assert.match(stale.logs(), /Frontend plugins are not built/);
    await rm(join(f.target, "apps/app-a/dist/web/server/entry.mjs"));
    const missing = f.child(["runner.mjs", "app-a", "prod"]);
    assert.notEqual((await missing.exit)[0], 0, missing.logs());
    assert.match(missing.logs(), /Missing SSR build/);
    await writeFile(join(requestPage, "+config.ts"), 'export default { route: "/hello-a" };');
    const duplicate = f.child(
      [join(f.target, "packages/plugin-web/bin/cordis-web.mjs"), "build"],
      join(f.target, "apps/app-a"),
    );
    assert.notEqual((await duplicate.exit)[0], 0, duplicate.logs());
    assert.match(duplicate.logs(), /Duplicate page route/);
  },
);

test(
  "SSR development reloads YAML, backend code, and native pages, then closes HMR connections",
  { timeout: 90000 },
  async (t) => {
    const f = await fixture(t);
    const app = await f.start("app-a", true);
    const page = () => fetch(app.url + "/hello-a").then((r) => r.text());
    assert.match(await page(), /Hello from app-a!/);
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
    await writeFile(
      join(extra, "+config.ts"),
      'export default { route: "/extra", title: "Extra" };',
    );
    await writeFile(
      join(extra, "+Page.tsx"),
      "export default function Page() { return <h1>Added page</h1>; }",
    );
    await eventually(async () =>
      assert.match(
        await readFile(
          join(f.target, "apps/app-a/.cordis/web/pages/(plugin-0)/extra/+Page.tsx"),
          "utf8",
        ),
        /extra/,
      ),
    );
    await eventually(async () =>
      assert.match(await fetch(app.url + "/extra").then((r) => r.text()), /Added page/, app.logs()),
    );
    await writeFile(
      join(extra, "+config.ts"),
      'export default { route: "/renamed", title: "Renamed" };',
    );
    await eventually(async () =>
      assert.match(
        await fetch(app.url + "/renamed").then((r) => r.text()),
        /Added page/,
        app.logs(),
      ),
    );
    await rm(join(extra, "+Page.tsx"));
    await rm(join(extra, "+config.ts"));
    await eventually(async () => assert.equal((await fetch(app.url + "/renamed")).status, 404));
    const activeSocket = new WebSocket(app.url.replace("http:", "ws:") + "/@vite/hmr", "vite-hmr");
    f.cleanups.push(() => activeSocket.close());
    await once(activeSocket, "open");
    await app.close();
  },
);
