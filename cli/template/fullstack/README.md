# Cordis fullstack workspace

Two independent Cordis applications with plugin-owned React pages, overview cards,
and typed APIs. Each app serves its own frontend and backend on one port.
Requires Node.js >=24.12.0 <25 and pnpm 11.24.0.

## Get started

```sh
pnpm install
pnpm dev
```

- App A: http://127.0.0.1:3081
- App B: http://127.0.0.1:3082

Each app has a hello page with a typed query and mutation, plus an overview card.
The examples do not persist data. `@acme` is a placeholder package scope.

## Layout

```text
apps/
  app-a/                    YAML configuration and Node.js entry
  app-b/                    YAML configuration and Node.js entry
packages/
  runtime/                  Shared Cordis startup and shutdown
  plugin-rpc/               tRPC service and typed client helper
  plugin-web/
    src/                    Discovery, Vite integration, build, and static serving
    client/                 Shared React shell, routing, and overview card slot
    bin/                    cordis-web build command
  plugin-hello-a/
    src/server/             Cordis entry and typed router
    src/client/             Web entry, page, and overview card
  plugin-hello-b/
    src/server/
    src/client/
```

There is no separate web application. App A loads hello-a; App B loads hello-b.
Both use the same web host without maintaining separate frontend plugin lists.

## Commands

| Command                                | Purpose                                          |
| -------------------------------------- | ------------------------------------------------ |
| `pnpm dev`                             | Develop both fullstack apps                      |
| `pnpm dev:app-a`, `pnpm dev:app-b`     | Develop one app                                  |
| `pnpm build`                           | Build both apps and their workspace dependencies |
| `pnpm build:app-a`, `pnpm build:app-b` | Build one app and its dependencies               |
| `pnpm start`                           | Start both built apps                            |
| `pnpm start:app-a`, `pnpm start:app-b` | Start one built app                              |
| `pnpm typecheck`                       | Check server and browser TypeScript              |
| `pnpm lint`, `pnpm lint:fix`           | Check or fix with Oxlint                         |
| `pnpm format`, `pnpm format:check`     | Format or check with Oxfmt                       |
| `pnpm clean`                           | Remove dependencies, build outputs, and caches   |

Run `pnpm install` again after cleaning. Dev and start use pnpm directly;
Turbo only orchestrates builds. Existing dependency versions are shared across apps.

## Configuration

Each application loads `cordis.yml`. Development adds `cordis.dev.yml`, Timer,
and Cordis HMR. Copy the app's `.env.example` to `.env` to change its host, port,
or greeting. Shell environment values take precedence; restart after env changes.

The web host is an ordinary plugin:

```yaml
- id: web
  name: "@acme/plugin-web"
  config:
    title: App A
    development: !!js env.NODE_ENV === 'development'
```

Keep it alongside Server and the business plugins in the app's configuration.
Its default browser API base is `/api`, matching the example RPC service.
Pages, API requests, availability events, and Vite HMR share the app's port.

Plugin discovery reads YAML or JSON, nested groups, and static include files.
Plugin names, group structure, web title, and include paths must be literal.
Include patches and initial configs are not supported by frontend discovery.
Business configuration expressions such as `!!js env.GREETING` are evaluated
only by Cordis at runtime; discovery never starts business plugins.

## Add a fullstack plugin

1. Copy a hello package, rename it, and define its API in `src/server`.
   Register the typed router with `ctx.rpc.register("your-plugin", router)`.
2. Export `./web` from its package manifest, pointing to
   `./src/client/index.ts`. Export `createPlugin({ queryClient, apiBase })`
   from that entry.
3. Return `pages`, `cards`, or both. Pages specify `path`, `title`, and a lazy
   `component`; cards specify `id`, `title`, and a lazy `component`.
   Pages may provide `load` to prefetch data. Provide `queryFilter` when the
   plugin uses TanStack Query so its cache can be cleaned on unload. Set
   `trpc.abortOnUnmount: true` in query options to cancel in-flight requests,
   as the hello examples do.
4. Add the package to the target app's dependencies, run `pnpm install`, and
   declare the plugin in that app's YAML. No frontend registration file is needed.

The `@acme/plugin-web/types` export provides `WebHost`, `WebPlugin`, and
contribution types. Keep router imports type-only and browser entries free of
Node.js imports. The existing typed client helper uses plain JSON; custom tRPC
transformers must be configured at both ends.

Page paths are literal paths, such as `/hello-a`. Each frontend plugin can be
declared once per app; page paths and card IDs must be unique. Backend-only
plugins omit the `./web` export. A UI-only plugin can return cards or pages
without registering an RPC router. A plugin may be reused in both apps.

## Hot reload and plugin lifecycle

- React component edits use Fast Refresh and preserve compatible component state.
- Backend edits reload the owning Cordis plugin. Business packages under
  `packages` are watched automatically; client and infrastructure code are excluded.
- Adding or removing a configured plugin updates its frontend registration through
  Vite HMR. The application shell and unaffected plugins stay mounted.
- Adding `disabled: true` unloads the plugin's API, menu entries, pages, and cards.
  Removing it restores them. Unloaded components lose their local state.
- Plugin availability comes from Cordis lifecycle state over `/api/web/events`,
  independent of whether a plugin has an RPC router.
- Pages and cards have individual loading and error boundaries. A broken component
  does not remove the application shell or another plugin's card.

The overview exposes one card slot. The shell is shared source in plugin-web and
can be customized there. Runtime, RPC infrastructure, web server integration, and
dependency changes require a restart. Production does not watch source or YAML.

## Production

```sh
pnpm build
pnpm start
```

The URLs stay the same: 3081 for App A, 3082 for App B.

Each application build runs Rolldown for the server and `cordis-web build` for
the browser. Output consists of `dist/index.js`, `dist/client/`, and
`dist/web-manifest.json`. Each app contains only its declared frontend plugins.
They can be built, deployed, and restarted independently.

All declared plugins, including disabled ones, get lazy frontend chunks. Enabling
a previously built plugin requires a restart, not another build. Adding a new
frontend plugin requires rebuilding that app; startup checks the build manifest
and reports missing plugins.

Keep the app's YAML, optional `.env`, built workspace packages, and installed
runtime dependencies with the output. These are workspace builds, not standalone
deployment bundles. Production serves built files and does not load Vite.
Deep links return the SPA HTML; unknown API routes, dotfiles, and missing assets
do not. HTML is revalidated; hashed assets use immutable caching.

The frontend is a client-rendered React SPA. Authentication, databases, SSR,
runtime package installation, and a plugin marketplace are left to the application.
Both apps bind to 127.0.0.1 by default.

## Git hooks

Lefthook installs only when this workspace is the Git repository root. The guarded
postinstall skips nested templates and CI. Pre-commit fixes staged code with
Oxlint and Oxfmt, then checks whitespace; pre-push runs typecheck.
`allowBuilds.lefthook: false` leaves installation to this guarded script.

## References

- [create-t3-app](https://github.com/t3-oss/create-t3-app) and [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo): workspace organization and typed APIs.
- [Vite](https://vite.dev/guide/api-javascript): embedded development server and build API.
- [tRPC](https://trpc.io/docs/client/tanstack-react-query/setup): typed clients and TanStack Query.
- [Cordis](https://cordis.js.org/): plugin composition and scoped cleanup.
