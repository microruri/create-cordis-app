import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";

export type Cleanup = () => void | Promise<unknown>;

export async function temporary(t: TestContext, prefix: string) {
  const target = await mkdtemp(join(tmpdir(), prefix));
  const cleanups: Cleanup[] = [];
  t.after(async () => {
    const errors: unknown[] = [];
    const remove = async () => {
      assert.equal(dirname(resolve(target)), resolve(tmpdir()));
      assert.ok(basename(target).startsWith(prefix));
      await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    };
    for (const cleanup of [...cleanups].reverse().concat(remove)) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Fixture cleanup failed");
  });
  return { target, cleanups };
}

export async function copyTemplate(source: string, target: string) {
  await cp(source, target, {
    recursive: true,
    filter: (path) =>
      !["node_modules", "dist", ".turbo", ".cordis", "pnpm-lock.yaml"].includes(basename(path)) &&
      (!basename(path).startsWith(".env") || basename(path) === ".env.example"),
  });
}

export async function linkDependencies(source: string, target: string) {
  const packages = [];
  for (const parent of ["apps", "packages"]) {
    for (const entry of await readdir(join(target, parent), { withFileTypes: true })) {
      const path = join(parent, entry.name);
      const manifest = join(target, path, "package.json");
      if (entry.isDirectory() && existsSync(manifest))
        packages.push({ path, pkg: JSON.parse(await readFile(manifest, "utf8")) });
    }
  }
  const workspace = new Map(packages.map(({ path, pkg }) => [pkg.name, join(target, path)]));
  for (const { path, pkg } of packages) {
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const link = join(target, path, "node_modules", name);
      await mkdir(dirname(link), { recursive: true });
      await symlink(
        workspace.get(name) ?? (await realpath(join(source, path, "node_modules", name))),
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
  return packages.map(({ path }) => path);
}

export async function eventually(
  check: () => Promise<void>,
  diagnostics = () => "",
  timeout = 30000,
) {
  const deadline = Date.now() + timeout;
  let error: unknown;
  do {
    try {
      await check();
      return;
    } catch (cause) {
      error = cause;
    }
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error("Condition did not settle: " + String(error) + "\n" + diagnostics());
}

export function nodeProcess(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  cleanups: Cleanup[],
  ipc = true,
) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ipc ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout!.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr!.on("data", (chunk) => {
    output += chunk;
  });
  const exit = once(child, "exit");
  // A spawn error may occur before the caller starts awaiting readiness.
  void exit.catch(() => undefined);
  const alive = () => child.exitCode === null && child.signalCode === null;
  async function stop() {
    if (!alive()) return;
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      if (child.connected) child.send("close");
      else child.kill();
      await exit;
    } finally {
      clearTimeout(timeout);
    }
  }
  cleanups.push(stop);
  async function message(action?: string): Promise<Record<string, string> | undefined> {
    if (!alive()) return undefined;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 30000);
    try {
      const reply = once(child, "message", { signal: abort.signal });
      if (action) child.send(action);
      const result = await Promise.race([reply, exit.then(() => undefined)]);
      return result?.[0];
    } catch (cause) {
      throw new Error("Child did not reply: " + output, { cause });
    } finally {
      clearTimeout(timeout);
      abort.abort();
    }
  }
  async function close() {
    await stop();
    assert.deepEqual(await exit, [0, null], output);
  }
  return { process: child, exit, logs: () => output, stop, close, message };
}
