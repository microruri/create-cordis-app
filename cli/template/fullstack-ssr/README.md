# Cordis SSR workspace

Two independent Cordis applications with React server rendering, plugin-owned
Vike pages, and typed tRPC APIs. Each app serves HTML, assets, and API requests from
one Node.js process on one port. Requires Node.js >=24.12.0 <25 and pnpm 11.24.0.

## Get started

```sh
pnpm install
pnpm dev
```

- App A: http://127.0.0.1:3081/hello-a
- App B: http://127.0.0.1:3082/hello-b

The initial HTML includes the greeting. React hydrates the form in the browser;
submitting it calls the app's API over HTTP. `@acme` is a placeholder package scope.

## Layout

```text
apps/
  app-a/                         Node entry, YAML configuration, and environment
  app-b/
packages/
  runtime/                       Cordis startup and shutdown
  plugin-rpc/                    tRPC service, server caller, and browser client
  plugin-web/
    src/                         Discovery, generation, Vite, and SSR serving
    web/                         Vike configuration, layout, and shared pages
    bin/                         cordis-web build command
  plugin-hello-a/
    src/server/                  Cordis entry and tRPC router
    src/web/
      +config.ts                 Frontend entry exported as ./web
      hello-a/
        +config.ts               Route and page title
        +data.ts                 Server data loader
        +Page.tsx                Vike page entry
        Page.tsx                 Interactive React component
  plugin-hello-b/
    src/server/
    src/web/
```

App A loads hello-a; App B loads hello-b. Each has its own Vite instance in
development and its own client/server build in production. The shared packages
provide reusable code; there is no separate web process or frontend plugin list.

## Commands

| Command                                | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| `pnpm dev`                             | Develop both apps                              |
| `pnpm dev:app-a`, `pnpm dev:app-b`     | Develop one app                                |
| `pnpm build`                           | Build both apps and their dependencies         |
| `pnpm build:app-a`, `pnpm build:app-b` | Build one app and its dependencies             |
| `pnpm start`                           | Start both built apps                          |
| `pnpm start:app-a`, `pnpm start:app-b` | Start one built app                            |
| `pnpm typecheck`                       | Check server and browser TypeScript            |
| `pnpm lint`, `pnpm lint:fix`           | Check or fix with Oxlint                       |
| `pnpm format`, `pnpm format:check`     | Format or check with Oxfmt                     |
| `pnpm clean`                           | Remove dependencies, build outputs, and caches |

Run `pnpm install` after cleaning. Dev and start use pnpm directly; Turbo
orchestrates builds. Lefthook checks staged files and typechecks before a push.
The combined build runs tasks sequentially: this Vike version's server-entry
dependency can race when writing a shared file on Windows, even with automatic
imports disabled. Each app still produces independent outputs.
Its installation script activates hooks only when this workspace is the Git root;
run `pnpm exec lefthook install` after initializing Git. `allowBuilds.lefthook` is
false because the workspace controls hook installation. esbuild's install script
is allowed for Vike's configuration loader.

## Configuration

Each app loads `cordis.yml`. Development adds `cordis.dev.yml`, Timer, and Cordis
HMR. Copy the app's `.env.example` to `.env` to change its host, port, or greeting.
Shell environment values take precedence; restart after changing environment files.
Vite reads frontend environment files from the same app directory. Only `VITE_*`
values are exposed to browser code; never put secrets in those variables.

`@acme/plugin-web` injects `server`, `loader`, and `rpc`. Its title comes from the
YAML configuration. The template reserves `/api` for HTTP APIs and `/healthz` for
health checks. The RPC prefix and browser client both use `/api`.

Discovery follows literal plugin names, nested groups, and literal include paths
in YAML or JSON. Include patches and dynamically computed plugin lists are not
supported. `!!js` expressions remain available for ordinary backend options.
Declare a frontend package once per app.

## Add a plugin page

1. Create a package like `plugin-hello-a`, with a Cordis entry and a tRPC router
   under `src/server/`.
2. Export its frontend directory using these entries in `package.json`:

   ```json
   {
     "./web": "./src/web/+config.ts",
     "./web/*": "./src/web/*"
   }
   ```

3. Add a page directory under `src/web/`. Set a unique route and title in its
   `+config.ts`, export the component from `+Page.tsx`, and load server data in
   `+data.ts`. Keep ordinary components in separate files for React Fast Refresh.
4. Add the package to the app's dependencies and declare it in `cordis.yml`.
   Run `pnpm install` after adding workspace packages.

The web plugin creates Vike entries under each app's ignored `.cordis/web` directory.
These forward to the original package files, so pages stay with their plugins.
Do not edit generated entries. Use Vike's `+` files for hooks, layouts, and pages;
use `+config.ts` for settings. The example's navigation lists active plugins' static
routes; dynamic routes can use ordinary links inside their pages.

Disabled but declared plugins are included in the build so they can be enabled
without rebuilding. Their pages return 404 and disappear from navigation while
disabled. New frontend packages or changed frontend source require a new production
build. Each app owns its Vike runtime and must run in a separate Node process.

## Data flow

`+data.ts` receives the request-local Cordis context and Web `Request`:

```ts
const hello = await cordis.rpc.caller<Router>("hello-a", request).hello();
return { hello, updatedAt: Date.now() };
```

This calls the registered router in the same process, without an HTTP round trip
back to the app. Server callers and HTTP handlers use the same router validation
and receive a request context. Register routers through `ctx.rpc.register()` so
Cordis removes them when their owning plugin stops.

Vike serializes the returned data into the page. The React example seeds TanStack
Query from that data, avoiding a duplicate initial fetch. The shared wrapper creates
a separate QueryClient for each server render and keeps one per browser session.
Browser queries and mutations use the typed `createPluginClient<Router>()` helper
over HTTP. Import router and data types with `import type`; server code and request
objects must stay out of browser bundles. Return only data safe for the browser.

## Development and production

- Ordinary React component edits use Fast Refresh and preserve compatible component
  state. Vike page/configuration files and page structure changes can reload the page.
  Adding or removing page entries restarts the app's Vite instance automatically.
- Cordis reloads business backend plugins; YAML changes update plugin availability.
  These changes refresh the browser. Changes to the shared runtime, RPC service, or
  web host require restarting dev.
- Vite HMR uses a WebSocket on the app's HTTP port during development. Business RPC
  uses HTTP. Production uses neither this WebSocket nor a lifecycle event stream.
- Pages use ordinary SSR followed by hydration and Vike client navigation. This
  template does not enable React Server Components or streaming rendering.

Build before starting production:

```sh
pnpm build
pnpm start
```

Rolldown builds backend packages. Vike builds each app into `dist/web/client` and
`dist/web/server`; the web plugin serves assets and renders requests using that
server bundle. HTML is sent with `Cache-Control: no-store`; hashed assets are
immutable. Missing pages return HTML 404 responses; missing assets and APIs remain
404s. A missing build or an unbuilt frontend package prevents startup.

For deployment, retain the workspace layout, package manifests, production
dependencies, backend `dist` directories, app YAML files, and each app's complete
`dist/web` and `dist/web-manifest.json`. Install and build in the deployment
environment, then run each app independently. Development dependencies are required
at build time. This is a workspace deployment, not a standalone server binary.

## References

- [Vike](https://vike.dev/) and [vike-react](https://vike.dev/vike-react)
- [Cordis](https://cordis.js.org/)
- [tRPC](https://trpc.io/) and [TanStack Query](https://tanstack.com/query/latest)
- [create-t3-app](https://github.com/t3-oss/create-t3-app) and
  [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo)
