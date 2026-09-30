---
name: trpc-tanstack-query
description: "Add typed tRPC procedures and browser interactions, or maintain server-to-client Query hydration and mutation refresh behavior in this workspace."
---

# tRPC and TanStack Query

Choose between the minimal [Hello example](../../../packages/plugin-hello-a/src/web/hello-a/Page.tsx)
and [Todos' hydrated list](../../../packages/plugin-todos/src/web/todos/Page.tsx).
The [query guide](../../../README.md#query-data-and-refresh) explains ownership.

## API and data ownership

- Define procedures with the host's `t` from `@acme/plugin-rpc` and validate
  inputs as in the existing Zod schemas. When a plugin owns data, keep that
  validation in its service and make the router a thin adapter over service
  calls such as `ctx.todos`; register it inside a nested
  `ctx.inject(["rpc"], ...)` callback so the service also works without RPC.
  Register routers under their plugin ID and export router types for
  `import type` in browser modules.
- Server pages use `cordis.rpc.caller<Router>(id, request)`: it executes in process
  with the plugin context and current request. Avoid HTTP calls back to the same
  app for these reads.
- Browser components use `createPluginClient<Router>(apiBase, id, queryClient)`
  from `@acme/plugin-rpc/client`. The current helper uses HTTP batching and plain
  JSON; custom serialization requires compatible configuration at both ends.
- Simple server content can render directly in RSC. Hello's client component
  uses `useMutation` only for its form; it needs no initial query or hydration cache.
- For a live list such as Todos, create a QueryClient inside the server render,
  populate the client's query keys, and dehydrate it. Import `HydrationBoundary`
  from `@acme/plugin-web/client`, then consume the same keys in client components.
  Use the existing browser provider rather than nesting another QueryClientProvider.
- Query hooks and utilities can still come directly from `@tanstack/react-query`.
  Keep query keys built by the existing helper so plugin namespaces stay distinct.

## Refresh behavior

Invalidate the affected Query entries after mutations. Derive changing counts
and summaries from the same live query. Call `router.refresh()` when independent
server-rendered content also needs updating; it is not a substitute for Query
invalidation. The host already pauses/invalidates speculative page requests around
mutations. Avoid adding a second automatic refresh mechanism in each plugin.

Verify initial hydration without an extra query request, mutation pending/error
states, successful updates, and RSC refresh with existing client state. Preserve
query cancellation on unmount where the example enables it. If authentication is
introduced, clear user-specific browser caches when the identity changes.

## Official references

- [tRPC documentation index](https://trpc.io/llms.txt)
- [TanStack Query for React](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Zod API](https://zod.dev/api)

Check catalog/installed versions before adopting APIs from current documentation.
