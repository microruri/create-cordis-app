# Cordis SSR workspace

Two independent Cordis applications with React Server Components, streaming SSR,
typed tRPC APIs, Tailwind CSS, daisyUI, and PostgreSQL through Drizzle ORM.
Each app serves pages, assets, and APIs from one Node.js process on one port.

Requires Node.js >=24.12.0 <25, pnpm 11.24.0, and Docker with Compose.
`@acme` is a placeholder package scope.

## Get started

```sh
pnpm install
pnpm db:setup
pnpm dev
```

- App A: http://127.0.0.1:3081/hello-a
- App B: http://127.0.0.1:3082/hello-b
- Each app also has a `/todos` page and its own database.

Start Docker before running `db:setup`. It copies missing app `.env` files,
starts both databases, waits for health checks, and applies committed migrations.
Existing environment files and data are preserved. Neither `dev` nor `start`
runs migrations automatically.

## Working with coding agents

[AGENTS.md](AGENTS.md) summarizes the project conventions and links to focused
skills in [.agents/skills](.agents/skills). Each skill combines local integration
notes with official documentation. For dependency changes, follow the
[validation matrix](.agents/skills/dependency-validation/references/validation.md)
for development, retained caches, HMR, production, and hydration.

## Layout

```text
apps/
  app-a/                    Node entry, YAML configuration, and environment
  app-b/
packages/
  runtime/                  Cordis startup and shutdown
  plugin-rpc/               Typed HTTP APIs, server callers, and browser clients
  plugin-database/          App-scoped PostgreSQL pool and Drizzle service
  plugin-web/
    src/                    Discovery, Vite integration, build, and HTTP serving
    web/                    RSC/SSR/browser entries, navigation, shell, and styles
  plugin-hello-a/
    src/server/             Cordis entry and tRPC router
    src/web/
      pages.ts              Server-only page manifest
      hello-a/Page.tsx       Server page with async data and Suspense
      hello-a/Greeting.tsx   Client component with a typed mutation form
  plugin-hello-b/
  plugin-todos/             Database schema, CRUD API, and server/client components
drizzle/                    SQL migrations and their journal
scripts/database.mjs        Local database setup and ORM migration runner
compose.yaml                Two independent local PostgreSQL services
```

App A loads hello-a; App B loads hello-b. Both load todos. Each owns a Vite
instance during development and its own production builds. Shared packages
provide reusable code; there is no separate web application.

## Commands

| Command                                                             | Purpose                                           |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `pnpm dev:app-a`, `pnpm dev:app-b`, `pnpm dev`                      | Develop one or both apps                          |
| `pnpm build:app-a`, `pnpm build:app-b`, `pnpm build`                | Build apps and dependencies                       |
| `pnpm start:app-a`, `pnpm start:app-b`, `pnpm start`                | Start built apps                                  |
| `pnpm typecheck`                                                    | Check server and browser TypeScript               |
| `pnpm lint`, `pnpm lint:fix`                                        | Check or fix with Oxlint                          |
| `pnpm format`, `pnpm format:check`                                  | Format or check with Oxfmt                        |
| `pnpm clean`                                                        | Remove dependencies, builds, and caches           |
| `pnpm db:setup`                                                     | Prepare environment, start databases, and migrate |
| `pnpm db:up`, `pnpm db:down`                                        | Start or stop databases, preserving data          |
| `pnpm db:new add_users`                                             | Create an empty SQL migration and journal entry   |
| `pnpm db:migrate:app-a`, `pnpm db:migrate:app-b`, `pnpm db:migrate` | Migrate one or both databases                     |

Dev and start use pnpm directly; Turbo orchestrates builds with independent app
outputs. Lefthook checks staged files and runs typechecking before a push.
Its installation script activates hooks only when this workspace is the Git root;
run `pnpm exec lefthook install` after initializing Git. `allowBuilds.lefthook`
is false because the workspace controls hook installation.

## Configuration

React (including its types), tRPC, TanStack Query, and Cordis versions live in
the default `catalog` in `pnpm-workspace.yaml`. Packages reference them with
`"catalog:"`; edit the catalog and run `pnpm install` to update shared versions.
Local `@acme/*` dependencies use `"workspace:*"`.

Each app loads `cordis.yml`. Development adds `cordis.dev.yml`, Timer, and
Cordis HMR. `plugin-web` injects `server`, `loader`, and `rpc`.
Discovery follows literal plugin names, nested groups, and literal include paths
in YAML or JSON. Include patches and dynamically computed plugin lists are
unsupported. `!!js` expressions remain available for backend options.

Environment files load from each app directory in this order: `.env`,
`.env.local`, `.env.<mode>`, `.env.<mode>.local`. Later files override earlier
ones; shell values take precedence. Dev defaults to `development`, start to
`production`; an explicit `NODE_ENV` wins. Use the same mode for migrations.
Restart after environment changes. Vite exposes only `VITE_*` values to the
browser; keep credentials out of those variables.

## Add plugin pages

Create a package like `plugin-hello-a`, add it to the app's dependencies, and
declare it in `cordis.yml`. Export its page manifest:

```json
{
  "./web": "./src/web/pages.ts"
}
```

The manifest is loaded only in the RSC environment:

```ts
import type { WebPage } from "@acme/plugin-web/types";

export const pages = [
  {
    id: "hello",
    path: "/hello",
    title: "Hello",
    component: () => import("./hello/Page.tsx"),
  },
] satisfies WebPage[];
```

A plugin can register several pages. Paths support static segments and named
parameters such as `/items/$id`; static matches take priority. Static pages
appear in navigation. Duplicate paths (including renamed parameters), duplicate
IDs, and reserved paths fail validation. `/api`, `/assets`, and `/healthz`
belong to the host.

Pages are server components by default. They receive request-local
`ServerPageProps`: `cordis`, `request`, `url`, and `params`.

```tsx
import "server-only";
import { Suspense } from "react";
import type { ServerPageProps } from "@acme/plugin-web/types";
import type { Router } from "../../server/router.ts";
import Greeting from "./Greeting.tsx";

async function Content({ cordis, request }: ServerPageProps) {
  const hello = await cordis.rpc.caller<Router>("hello", request).hello();
  return (
    <>
      <p>{hello.app}</p>
      <p>{hello.message}</p>
      <Greeting />
    </>
  );
}

export default function Page(props: ServerPageProps) {
  return (
    <section>
      <h1>Hello</h1>
      <Suspense fallback={<p>Loading greeting...</p>}>
        <Content {...props} />
      </Suspense>
    </section>
  );
}
```

Place `"use client"` at the top of components that use state, effects, event
handlers, or TanStack Query. Pass serializable results into those components;
keep Cordis contexts, requests, database handles, and server functions on the
server. Use `import type` for server data and router types. `server-only`
imports enforce component boundaries at build time.

The hello examples render their initial greeting on the server. `Greeting.tsx`
only handles the name input and typed tRPC submission with `useMutation`, including
pending, success, and error states. These pages do not hydrate a Query cache or
fetch the greeting again in the browser. Todos demonstrates the full Query
hydration and database CRUD workflow.

Put access checks and HTTP redirects in an optional page-module
`beforeRender(props)` export:

```ts
import { redirect, notFound } from "@acme/plugin-web/server";
import type { ServerPageProps } from "@acme/plugin-web/types";

export function beforeRender({ url }: ServerPageProps) {
  if (url.searchParams.has("old")) throw redirect({ to: "/hello" });
  if (url.searchParams.has("missing")) throw notFound();
}
```

This hook runs before response headers are committed. Redirect targets are
app-relative URLs. Errors after streaming starts cannot change the HTTP status;
the page error boundary shows a generic message and the server logs the error.
Use Suspense around slow data so the page shell can be sent first.
`request.signal` supports cancelling data work when the browser disconnects.

Run `pnpm install` after adding workspace packages.

## Rendering and navigation

Vite builds three environments: `rsc` executes server components, `ssr`
renders their output as HTML, and `client` handles hydration and interaction.
The server streams HTML with its initial RSC payload embedded. Hydration reuses
that payload; it does not request the page a second time. Server component
implementations are excluded from browser bundles.

The host enhances same-origin page links and browser history. Navigation fetches
the target URL with `Accept: text/x-component` and updates the existing React
tree. The current page stays visible with a progress indicator until the next
page commits; its Suspense boundaries handle any remaining streamed content.
Superseded requests are cancelled, history entries restore scroll positions,
and external links, downloads, and modified clicks retain browser behavior.

Use the client API for links, optional intent prefetching, and programmatic navigation:

```tsx
"use client";
import { Link, useNavigation, useRouter } from "@acme/plugin-web/client";

export function Toolbar() {
  const router = useRouter();
  const { pending } = useNavigation();
  return (
    <div>
      <Link href="/todos">Todos</Link>
      <Link href="/hello-a" prefetch>
        Hello
      </Link>
      <button disabled={pending} onClick={() => router.refresh()}>
        Refresh page
      </button>
    </div>
  );
}
```

`Link` accepts normal anchor attributes plus `replace` and `scroll={false}`.
`router.push(href, { scroll })` adds a history entry; `router.replace(href,
{ scroll })` replaces it. Both require a same-origin page URL. `refresh()`
fetches a new RSC tree without adding history or resetting scroll and preserves
client state where component identity is unchanged. `useNavigation()` returns
`pending` and the pending absolute `target` URL, or `null` when idle. The page
error boundary retries through the same refresh mechanism.

`Link` defaults to `prefetch={false}`: hovering or focusing a link does not request
the destination. Opt in with `<Link prefetch>` to prefetch after 100 ms of hovering
or immediately on keyboard focus. Leaving before the delay cancels the scheduled
work. `router.prefetch(href)` also starts a prefetch; ordinary anchors navigate
without automatic prefetch.
The browser deduplicates requests and retains up to 20 entries for 30 seconds,
including requests still streaming. Clicking consumes an entry and continues its
stream. Query strings distinguish entries; hashes do not. Prefetching may run
server components and database reads, so enable it selectively for destinations
that benefit from it. Rendering and `beforeRender` should be safe to execute on a GET.

Prefetching does not change the visible page or hydrate Query data. Failed
prefetches are discarded. Mutations pause prefetching and clear the cache when
they start and settle; refresh and HMR also clear it. Entries are local to this
browser app, not shared between users or persisted as a history cache. HTTP
responses still use `no-store`; there is no shared server page cache.

## Query data and refresh

Todos creates a local QueryClient inside its async server component, populates
the same tRPC query keys used by the client, and sends its dehydrated state through
`HydrationBoundary`. Use this pattern for data the browser needs to query and
update; simple server-rendered content such as the hello greeting can stay in RSC.

Import this boundary from `@acme/plugin-web/client`; it wraps TanStack's boundary
so hydration and its provider share the same dependency entry during Vite dev.

```tsx
import "server-only";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { HydrationBoundary } from "@acme/plugin-web/client";
import { createPluginClient } from "@acme/plugin-rpc/client";
import type { ServerPageProps } from "@acme/plugin-web/types";
import type { Router } from "../../server/router.ts";
import Client from "./Client.tsx";

async function Content({ cordis, request }: ServerPageProps) {
  const client = new QueryClient();
  const api = createPluginClient<Router>("/api", "todos", client);
  const todos = await cordis.rpc.caller<Router>("todos", request).list();
  client.setQueryData(api.list.queryKey(), todos);
  return (
    <HydrationBoundary state={dehydrate(client)}>
      <Client />
    </HydrationBoundary>
  );
}
```

Keep this async component inside Suspense so the shell can stream first.
Server callers execute in process with the current request; they do not make an
HTTP request back to the app. The browser QueryClient persists across navigation.
Hydration avoids a duplicate initial query and merges newer server data into an
existing cache according to update timestamps. Queries remain fresh for 30
seconds by default. Later queries and mutations use tRPC over HTTP.

Give each piece of changing data one owner. Todos uses Query for its live list;
derive related counts in client components from that same query. Its mutations
invalidate the list query without automatically rendering the RSC page again.
Rendering the same live count separately in a server component would leave it
unchanged when Query refetches.

Use `router.refresh()` when a mutation also affects independent server-rendered
content. It does not invalidate every Query entry or replace normal query
invalidation. When adding authentication, clear the QueryClient on an identity
change and refresh the page to discard old prefetches. Server Actions are not
enabled.

Declared but disabled plugins remain in the build so they can be enabled
without rebuilding. Disabled pages return 404 and disappear from navigation.
New plugins or changed frontend code require a production rebuild.

## Development and deployment

Client components use React Fast Refresh. Server-component changes re-fetch the
current RSC tree. Page manifest, YAML, and Cordis business-plugin changes refresh
the browser. Shared runtime, RPC, database, or web-host changes require restarting
dev. Business-plugin HMR reuses the existing database pool.

Vite HMR uses a development-only WebSocket on the app's HTTP port. Page rendering,
navigation, and business RPC use HTTP. Production has no HMR connection.

```sh
pnpm build
pnpm db:migrate
pnpm start
```

Rolldown builds backend packages. Vite builds `dist/web/rsc`, `dist/web/ssr`,
and `dist/web/client` for each app. Generated client-reference manifests supply
component scripts, CSS, and preload information. Production imports the RSC
server entry without loading Vite.

Deploy the workspace layout, package manifests, production dependencies,
backend builds, app YAML files, complete `dist/web`, and
`dist/web-manifest.json`. These are workspace builds, not standalone bundles.
Build before installing production-only dependencies. Keep migration files and
`scripts/database.mjs` in the migration environment. Building never connects
to PostgreSQL.

HTML and RSC responses use `Cache-Control: no-store` and `Vary: Accept`;
hashed assets use immutable caching. Missing pages return 404. Missing assets
and APIs never become page HTML. A missing build or an unbuilt frontend plugin
prevents startup.

This template owns its routing and framework integration around
`@vitejs/plugin-rsc`; retain regression checks when updating it or React.
React, React DOM, and the plugin's bundled RSC runtime must remain compatible.
The template does not implement Next.js APIs, TanStack Start, SSG, or ISR.

## Database and migrations

Each app has a PostgreSQL 17 container, database, and named volume.
Local credentials are `acme` / `acme`:

| App   | Host address     | Database |
| ----- | ---------------- | -------- |
| App A | `127.0.0.1:5435` | `app_a`  |
| App B | `127.0.0.1:5436` | `app_b`  |

`db:down` and `clean` preserve database data. To change host ports, configure
`APP_A_DB_PORT` / `APP_B_DB_PORT` for Compose and update app-local
`DATABASE_URL` values. A shell-wide `DATABASE_URL` overrides both apps' files.

`plugin-database` owns a pool per app and exposes `ctx.database.db`.
Business plugins declare `inject = ["database", "rpc"]`, capture their scoped
database handle during setup, and pass it into their router factory. The pool
closes when its service stops. An unavailable database fails startup.

Migration execution uses Drizzle ORM's PostgreSQL migrator; there is no schema
diff generator. To change the database:

1. Update the business plugin's TypeScript schema.
2. Run `pnpm db:new add_users` and write the corresponding SQL in the new file.
3. Use `--> statement-breakpoint` between statements where needed. Review SQL.
4. Run `pnpm db:migrate` or the app-specific command.
5. Commit the schema, SQL, and `drizzle/meta/_journal.json` together.

Never edit an already applied migration or its journal timestamp. New SQL runs
transactionally; a PostgreSQL advisory lock serializes migration runners per
database. There is no automatic rollback command or schema generation.

Both databases receive the workspace schema even if a plugin is disabled.
Disabling a plugin never deletes its data. Schema removal requires an explicit
SQL migration. Use separate migration histories if the apps later diverge.

## Styling

Edit `packages/plugin-web/web/style.css` for shared styles and daisyUI themes.
The default theme is light, following the system dark preference. Explicit
`@source` paths include shared web code and plugin page directories; add a
source path when introducing a separate UI package.

## References

- [Vite RSC plugin](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc) and [React Server Components](https://react.dev/reference/rsc/server-components)
- [Cordis](https://cordis.js.org/), [tRPC](https://trpc.io/), and [TanStack Query](https://tanstack.com/query/latest)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations) and [PostgreSQL](https://www.postgresql.org/)
- [Tailwind CSS](https://tailwindcss.com/docs) and [daisyUI](https://daisyui.com/docs/)
