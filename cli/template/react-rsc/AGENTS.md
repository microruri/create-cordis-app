# Working in this workspace

This file describes the starter's current conventions. Follow explicit task
requirements when changing the architecture, and update the affected guidance
with the code. Keep changes focused; use the existing examples before adding
shared abstractions. Write documentation and necessary code comments in English.

## Start here

Run commands from this workspace root. Read [README.md](README.md) for setup,
environment loading, deployment, and migrations. Read [package.json](package.json)
and [pnpm-workspace.yaml](pnpm-workspace.yaml) for the required runtime, package
manager, and dependency versions; check installed versions before using new APIs.

- `apps/app-a` and `apps/app-b` run independently, each with its own YAML config,
  environment, Vite instance, production output, and PostgreSQL database.
- `packages/runtime` starts Cordis; `plugin-web`, `plugin-rpc`, and
  `plugin-database` own the shared infrastructure. Business plugins declare
  the services they use and release resources through their Cordis scope.
- Frontend registration comes from each configured package's `./web` export.
  Follow the existing page manifest rather than adding an app-level page list.

## Boundaries and shared state

Keep backend logic in `src/server`; page modules in `src/web` are server
components by default. Use `"use client"` for interactive components and
`server-only` for server page modules. Import backend types with `import type`.
Keep database handles, Cordis contexts, and requests on the server.

Use package exports instead of importing another package's internal files.
The web host exposes `@acme/plugin-web/client` for `Link`, navigation hooks, and
`HydrationBoundary`; `@acme/plugin-web/server` provides redirects and not-found
responses, and `@acme/plugin-web/types` provides page types.

The host owns the browser QueryClient and navigation/error providers. Reuse them
in plugins. QueryClients created for server hydration belong to the current
render/request, never a shared module-level cache. Hello demonstrates server
content plus a client mutation form; Todos demonstrates Query hydration and CRUD.
Choose that data ownership deliberately and refresh RSC only when server-rendered
content also needs updating.

## Tools and validation

Use pnpm and the existing scripts. Shared catalog entries use `catalog:` and local
packages use `workspace:*`. Keep unrelated versions unchanged. Backend builds use
Rolldown, frontend builds use Vite, and checks use Oxlint and Oxfmt. Turbo handles
builds; dev and start use pnpm directly. Lefthook provides the existing Git hooks.

For code changes, run `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, plus
the build or browser checks affected by the change. Documentation-only changes
need formatting and link checks. The starter has no `test` script; run relevant
tests if the application later adds them.

For new or upgraded runtime, browser, or build dependencies, use the
[dependency validation skill](.agents/skills/dependency-validation/SKILL.md).
It covers both apps, fresh and retained caches, HMR, production, and hydration.
Report checks that could not run and why. Preserve local environment files and
database data, and stop only the processes started for your validation.

## Task-specific guidance

Read only the skills relevant to the task. Each contains local integration notes
and official documentation links; consult the sections needed for the installed
version rather than loading complete manuals.

| Task                                                             | Skill                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Plugin configuration, services, and lifecycle                    | [cordis-plugins](.agents/skills/cordis-plugins/SKILL.md)               |
| Pages, component boundaries, navigation, or Vite/RSC integration | [react-vite-rsc](.agents/skills/react-vite-rsc/SKILL.md)               |
| Typed APIs, Query hydration, mutations, and refresh              | [trpc-tanstack-query](.agents/skills/trpc-tanstack-query/SKILL.md)     |
| Database schemas, pools, and migrations                          | [drizzle-postgres](.agents/skills/drizzle-postgres/SKILL.md)           |
| Styling, themes, and UI interaction                              | [tailwind-daisyui](.agents/skills/tailwind-daisyui/SKILL.md)           |
| Adding/upgrading dependencies or debugging module identity       | [dependency-validation](.agents/skills/dependency-validation/SKILL.md) |
