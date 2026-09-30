---
name: cordis-plugins
description: "Add or change Cordis plugins in this workspace, including YAML discovery, service injection, scoped resources, and business-plugin HMR."
---

# Cordis plugins

Start with [hello-a's entry](../../../packages/plugin-hello-a/src/server/index.ts)
for a small plugin, or [Todos](../../../packages/plugin-todos/src/server/index.ts)
for a plugin that owns its tables, exposes a `ctx.todos` service, and adapts
it to RPC. See the
[configuration guide](../../../README.md#configuration) for environment loading.

## Integration

- Add the workspace dependency to the target app and declare the plugin in its
  YAML. Use literal names and include paths: frontend discovery reads YAML/JSON,
  nested groups, and static includes without evaluating business configuration.
  Dynamic plugin lists and include patches/initial config are not supported.
- Declare hard dependencies with `inject`. Treat optional integrations as
  nested injections: register routes inside a `ctx.inject(["rpc"], ...)`
  callback so a data service such as `ctx.todos` keeps working while
  `plugin-rpc` is absent or disabled. Keep request-specific data in the
  request context.
- Own data as a service: keep the schema in `src/server/schema.ts`, export it
  server-only through a `./schema` export, and provide validated operations
  on the context (for example `ctx.todos.create(input, { tx })`). Add the
  context augmentation with `import type {}` from your package entry so
  consumers can list the service in their own `inject`, and make a tRPC
  router a thin adapter over the service when one is needed.
- Use Cordis lifecycle cleanup (`ctx.effect` or service initialization cleanup)
  for subscriptions, timers, and connections. Follow the runtime's shutdown
  behavior rather than installing process signal handlers in business plugins.
- Export a server-only `./web` page manifest when adding pages. Backend-only
  plugins omit it. A frontend plugin is declared once per app; RPC IDs and page
  registrations must be unique within that app.
- Declared disabled plugins remain build inputs. They expose no active page,
  API, or service until enabled; the database keeps their tables and data.
  Production configuration changes require a restart; adding a new frontend
  plugin also requires a build.

## Verify the lifecycle

Check that the target app loads the plugin and the other app remains independent.
In development, edit business code and toggle its YAML `disabled` flag: routes,
pages, and services should follow plugin availability without accumulating
handlers. The existing database pool survives business-plugin HMR. Shared
runtime, RPC, database, and web-host changes require a restart. Check shutdown
after opening a page with an active Vite HMR connection.

## Official reference

- [Cordis documentation](https://cordis.js.org/) for contexts, services, effects,
  and plugin lifecycle. Check APIs against the installed Cordis/plugin versions,
  especially release candidates.
