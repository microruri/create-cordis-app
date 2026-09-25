#!/usr/bin/env node

import * as prompts from "@clack/prompts";
import { constants } from "node:fs";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

function validateName(name: string | undefined) {
  if (!name || name.length > 214 || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return "Use a name starting with a lowercase letter or number, followed by lowercase letters, numbers, dots, hyphens, or underscores (up to 214 characters).";
  }
  if (name.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) {
    return "Choose a directory name that is valid on Windows.";
  }
}

async function copyTemplate(source: string, destination: string) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name === "_gitignore" ? ".gitignore" : entry.name);
    if (entry.isDirectory()) {
      await mkdir(to);
      await copyTemplate(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to, constants.COPYFILE_EXCL);
    }
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      template: { type: "string", short: "t" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`Usage: create-cordis-app [project-name] [--template <name>]

Create a project in a new directory under the current working directory.
Omitted values are requested interactively.

Options:
  -t, --template <name>  Choose a bundled template (currently: workspace)
  -h, --help             Show this help

Example:
  create-cordis-app my-app --template workspace`);
    return;
  }
  if (positionals.length > 1) throw new Error("Provide only one project name.");

  let projectName = positionals[0];
  let template = values.template;
  if (projectName !== undefined) {
    const error = validateName(projectName);
    if (error) throw new Error(error);
  }

  const templateRoot = fileURLToPath(new URL("./template/", import.meta.url));
  const templates = (await readdir(templateRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!templates.length) throw new Error("No templates found. Rebuild the CLI.");
  if (template !== undefined && !templates.includes(template)) {
    throw new Error(`Unknown template: ${template}. Available templates: ${templates.join(", ")}.`);
  }

  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if ((!projectName || !template) && !interactive) {
    throw new Error(
      "An interactive terminal is required. Alternatively, provide a project name and --template workspace.",
    );
  }
  if (interactive) prompts.intro("create-cordis-app");

  if (!projectName) {
    const answer = await prompts.text({
      message: "What is your project name?",
      placeholder: "my-cordis-app",
      defaultValue: "my-cordis-app",
      validate: validateName,
    });
    if (prompts.isCancel(answer)) {
      prompts.cancel("Creation cancelled.");
      return;
    }
    projectName = answer;
  }

  if (!template) {
    const answer = await prompts.select({
      message: "Choose a template.",
      options: templates.map((name) => ({ value: name, label: name })),
    });
    if (prompts.isCancel(answer)) {
      prompts.cancel("Creation cancelled.");
      return;
    }
    template = answer;
  }

  const destination = resolve(projectName);
  try {
    await mkdir(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Directory already exists: ${projectName}. Choose a new project name.`);
    }
    throw error;
  }

  try {
    await copyTemplate(join(templateRoot, template), destination);
  } catch (error) {
    // This directory was created above; an existing directory is never removed.
    await rm(destination, { recursive: true, force: true });
    throw error;
  }

  const message = `Created ${projectName} using ${template}.\n\nNext steps:\n  cd ${projectName}\n  pnpm install\n  pnpm dev`;
  if (interactive) prompts.outro(message);
  else console.log(message);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Failed to create the project.");
  process.exitCode = 1;
});
