import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "cca-cli-with spaces-"));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("cca-cli-with spaces-"));
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  return directory;
}

function run(directory: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10000,
    // Project creation must not need Git or a package manager on PATH.
    env: { ...process.env, PATH: "", Path: "", NO_COLOR: "1" },
  });
  assert.ifError(result.error);
  return result;
}

for (const name of ["workspace", "fullstack"]) {
  test(`CLI creates ${name} without installing dependencies or initializing Git`, async (t) => {
    const template = fileURLToPath(new URL(`../template/${name}/`, import.meta.url));
    const directory = await fixture(t);
    const result = run(directory, ["my-app", "--template", name]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`Created my-app using ${name}`));
    assert.match(result.stdout, /cd my-app/);

    const project = join(directory, "my-app");
    for (const file of [
      ".gitignore",
      ".gitattributes",
      ".oxfmtrc.json",
      "package.json",
      "README.md",
      "lefthook.yml",
      "pnpm-workspace.yaml",
      "apps/app-a/.env.example",
      "apps/app-b/.env.example",
      "apps/app-a/cordis.yml",
      "apps/app-b/cordis.dev.yml",
      ...(name === "workspace"
        ? ["packages/plugin-hello-a/src/index.ts", "packages/plugin-hello-b/src/index.ts"]
        : [
            "packages/plugin-web/client/main.tsx",
            "packages/plugin-web/bin/cordis-web.mjs",
            "packages/plugin-rpc/src/index.ts",
            "packages/plugin-web/src/index.ts",
            "packages/plugin-hello-a/src/server/index.ts",
            "packages/plugin-hello-b/src/client/page.tsx",
          ]),
      "scripts/install-lefthook.mjs",
    ]) {
      assert.deepEqual(
        await readFile(join(project, file)),
        await readFile(join(template, file)),
        file,
      );
    }

    for (const path of await readdir(project, { recursive: true })) {
      assert(
        !/(^|[/\\])(node_modules|dist|\.git|\.turbo|\.cordis|_gitignore)([/\\]|$)/.test(path),
        path,
      );
      assert(!basename(path).startsWith("pnpm-lock"), path);
      assert(!basename(path).startsWith(".env") || basename(path) === ".env.example", path);
    }
    assert.equal(
      JSON.parse(await readFile(join(project, "package.json"), "utf8")).name,
      "@acme/root",
    );
  });
}

test("CLI refuses existing directories and files without changing their contents", async (t) => {
  const directory = await fixture(t);
  await mkdir(join(directory, "empty"));
  await mkdir(join(directory, "occupied"));
  await writeFile(join(directory, "occupied/keep.txt"), "keep me");
  await writeFile(join(directory, "file"), "keep this too");

  for (const name of ["empty", "occupied", "file"]) {
    const result = run(directory, [name, "-t", "workspace"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already exists/);
  }
  assert.deepEqual(await readdir(join(directory, "empty")), []);
  assert.deepEqual(await readdir(join(directory, "occupied")), ["keep.txt"]);
  assert.equal(await readFile(join(directory, "occupied/keep.txt"), "utf8"), "keep me");
  assert.equal(await readFile(join(directory, "file"), "utf8"), "keep this too");
});

test("CLI rejects invalid names, templates, and arguments before creating files", async (t) => {
  const directory = await fixture(t);
  for (const name of [
    "",
    ".",
    "..",
    "../escape",
    "a/b",
    "a\\b",
    "@acme/app",
    "MyApp",
    "my app",
    "con",
    "nul.txt",
    "app.",
    "a".repeat(215),
  ]) {
    const result = run(directory, [name, "--template", "workspace"]);
    assert.equal(result.status, 1, name);
    assert(result.stderr.trim(), name);
  }
  for (const args of [
    ["my-app", "--template", "missing"],
    ["my-app", "--template", "../workspace"],
    ["my-app", "another-app", "-t", "workspace"],
    ["my-app", "--unknown"],
  ]) {
    assert.equal(run(directory, args).status, 1, args.join(" "));
  }
  assert.deepEqual(await readdir(directory), []);
});

test("CLI help works without a terminal and missing input fails promptly", async (t) => {
  const directory = await fixture(t);
  const help = run(directory, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: create-cordis-app/);
  assert.match(help.stdout, /fullstack, workspace/);
  for (const args of [[], ["my-app"], ["--template", "workspace"]]) {
    const result = run(directory, args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /interactive terminal/);
  }
  assert(!existsSync(join(directory, "my-app")));
});
