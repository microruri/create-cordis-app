# Acme Cordis Workspace

A minimal [Cordis](https://cordis.js.org/) starter with two independent TypeScript
applications, YAML plugin configuration, and a shared runtime. Each app has its
own server, plugins, environment variables, and hot reloading.

## Quick start

Use **Node.js 24.12.0 or newer within the 24.x line** and **pnpm 11.24.0**, as
specified in [package.json](./package.json). Run these commands from this directory:

```sh
pnpm install
pnpm dev
```

Both apps start with working defaults; no `.env` file or build step is required.

| App   | Hello endpoint                    | Health check                    |
| ----- | --------------------------------- | ------------------------------- |
| app-a | <http://127.0.0.1:3081/api/hello> | <http://127.0.0.1:3081/healthz> |
| app-b | <http://127.0.0.1:3082/api/hello> | <http://127.0.0.1:3082/healthz> |

## Project structure

```text
apps/
  app-a/                # App A entry point, configuration, and environment
  app-b/                # App B entry point, configuration, and environment
packages/
  plugin-hello-a/        # App A routes and example business logic
  plugin-hello-b/        # App B routes and example business logic
  runtime/              # Shared startup and shutdown
scripts/                # Cleanup and Git hook installation
rolldown.config.ts      # Shared package build configuration
turbo.json              # Build ordering and local caching
lefthook.yml            # Commit and push checks
```

`@acme` is a placeholder. Replace it throughout the workspace with your organization
or project scope, including package names, dependencies, imports, and YAML plugin
names, then run `pnpm install` to update workspace links.

## Commands

Run all commands from the workspace root.

| Task             | Both apps    | App A              | App B              |
| ---------------- | ------------ | ------------------ | ------------------ |
| Develop          | `pnpm dev`   | `pnpm dev:app-a`   | `pnpm dev:app-b`   |
| Build            | `pnpm build` | `pnpm build:app-a` | `pnpm build:app-b` |
| Start built apps | `pnpm start` | `pnpm start:app-a` | `pnpm start:app-b` |

| Command             | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `pnpm typecheck`    | Check TypeScript across the workspace                         |
| `pnpm lint`         | Check code with Oxlint                                        |
| `pnpm lint:fix`     | Apply safe lint fixes                                         |
| `pnpm format`       | Format source code, configuration, and documentation          |
| `pnpm format:check` | Check formatting without changing files                       |
| `pnpm clean`        | Remove build outputs, caches, runtime state, and dependencies |

Stop running apps before `pnpm clean`. It removes `dist`, `.turbo`, `.cordis`, and
`node_modules` from the workspace and its packages. Local `.env` files and the
lockfile are preserved; run `pnpm install` before continuing.

## Configuration and development

Each app has two configuration files:

- `cordis.yml` loads Env, console logging, and a Group containing Server and the
  app's hello plugin.
- `cordis.dev.yml` includes `cordis.yml` and adds Timer and HMR for development.

Keep `group: true` and `inject: [env]` on the application Group so environment
variables are ready before its plugin configuration is evaluated. Plugins can log
through `ctx.logger`; the console exporter uses its default formatting.

### Environment variables

To customize an app, copy its `.env.example` to `.env` in the same app directory.
`HOST`, `PORT`, and `GREETING` control its address and hello response. Each app
loads its own `.env` during both `dev` and `start`.

Existing shell variables take precedence. Set ports in the app-local files to keep
the apps independent; a shell-level `PORT` applies to both processes. Restart the
affected app after changing `.env`.

### Hot reloading

Edit [app A's message](./packages/plugin-hello-a/src/message.ts) or
[app B's message](./packages/plugin-hello-b/src/message.ts) to try HMR. Each app
reloads its own plugin source and YAML configuration independently.

Add new plugin source directories to the HMR `root` list in the consuming app's
`cordis.dev.yml`. Keep the shared runtime outside these watch roots. Changes to
app entry points, runtime code, dependencies, or build configuration require a
restart.

Development and start commands run directly through pnpm. Cordis handles HMR;
Turbo handles builds. On Windows, pnpm may display `Failed` when Ctrl+C interrupts
a running app.

## Build and run

```sh
pnpm build
pnpm start
```

[Turborepo](https://turborepo.com/docs) builds packages in dependency order and
caches outputs locally. An app-specific build also builds its workspace
dependencies. The shared [Rolldown](https://rolldown.rs/) configuration emits
ES modules to each package's `dist/` directory and keeps dependencies external.

`pnpm start` uses existing build outputs and loads `cordis.yml` without HMR; it does
not build automatically. Keep the app configuration, workspace packages, and
installed runtime dependencies alongside the build outputs. `NODE_ENV` defaults
to `development` for dev and `production` for start, unless explicitly set.

## Add a plugin

1. Copy `packages/plugin-hello-a` to a new directory under `packages/`. Update its
   package name and exported plugin name, then implement its configuration and
   `apply` function. Keep the build script and development, production, and type
   exports.
2. Add the package as a `workspace:*` dependency of the consuming app. Add its
   plugin entry and configuration to the application Group in `cordis.yml`.
3. Add its source directory to that app's HMR `root` list, then run `pnpm install`
   and restart the app.

Packages under `apps/*` and `packages/*` are discovered automatically. Packages
with a `build` script participate in Turbo builds; no central package list needs
editing. The included packages expose source types for workspace use. Publishing
them separately would also require declaration output.

## Code quality and Git hooks

[Oxlint](https://oxc.rs/docs/guide/usage/linter) checks code,
[Oxfmt](https://oxc.rs/docs/guide/usage/formatter) formats files, and TypeScript
checks types. Formatting uses LF line endings, preserves `package.json` key order,
and excludes pnpm lockfiles. These checks also work independently of Git hooks:

```sh
pnpm lint
pnpm format:check
pnpm typecheck
```

[Lefthook](https://lefthook.dev/) runs these checkpoints:

- **Before commit:** apply safe lint fixes and formatting to staged files,
  restage the results, and check the staged diff for whitespace errors.
- **Before push:** run `pnpm typecheck` across the workspace.

For a standalone project, initialize Git before `pnpm install` to install hooks
automatically. If dependencies were installed first, run `pnpm exec lefthook install`
after initializing Git. Commit the standalone project's generated `pnpm-lock.yaml`.

The installation script skips CI, `LEFTHOOK=0`, installations without development
dependencies, and directories that are not the Git repository root. Working on
this template inside the scaffolder therefore leaves the outer repository's hooks
untouched. The script owns hook installation, so `allowBuilds.lefthook: false`
disables the dependency's separate install script. Custom Git hooks paths are not
overridden automatically.
