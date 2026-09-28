import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

function install() {
  const ci = process.env.CI;
  if ((ci && ci !== "0" && ci !== "false") || process.env.LEFTHOOK === "0") return;

  const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
  const git = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  });
  if (git.status !== 0) return;

  // Templates inside another repository must not install hooks in that repository.
  if (relative(root, realpathSync(git.stdout.trim())) !== "") return;

  const executable = join(root, "node_modules/lefthook/bin/index.js");
  if (!existsSync(executable)) return;

  const result = spawnSync(process.execPath, [executable, "install"], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

install();
