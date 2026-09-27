---
name: react-vite-rsc
description: "Implement plugin pages, React server/client boundaries, streaming, or navigation in this workspace's Vite RSC host. Diagnose changes across its rsc, ssr, and client environments."
---

# React and Vite RSC

Use [Hello's server page](../../../packages/plugin-hello-a/src/web/hello-a/Page.tsx)
and [client form](../../../packages/plugin-hello-a/src/web/hello-a/Greeting.tsx)
as the minimal example. The [page guide](../../../README.md#add-plugin-pages)
documents the manifest, dynamic parameters, and request-local props.

## Rendering contract

- Export pages through the package's `./web` manifest, with lazy component
  importers. A plugin may provide several pages. Use the host's `WebPage` and
  `ServerPageProps` types and let its registry validate routes.
- Keep server reads in server components; mark interactive boundaries with
  `"use client"`. Pass serializable data across the boundary. Leave server
  contexts and database code in the server graph.
- Put slow async content inside Suspense so the shell can stream first. Retain
  the request signal when the data API supports cancellation. Avoid whole-body
  buffering or waiting for all content before returning the shell.
- Use `beforeRender` for page decisions that need an HTTP status or redirect.
  After streaming begins, errors use the existing page boundary and server logs.
- The RSC environment executes server components, SSR turns their output into
  HTML, and the client hydrates/interacts. Initial RSC data is embedded in HTML;
  hydration must not fetch the same page again.

## Navigation and development

Use the host's `Link`, `useRouter`, and `useNavigation` from
`@acme/plugin-web/client`. Links default to no prefetch; `<Link prefetch>` or
`router.prefetch()` opts in and can execute server reads. `router.refresh()`
updates RSC without adding history and preserves compatible component state.
Preserve normal anchor behavior for external URLs, downloads, and modified clicks.

The shared [Vite config](../../../packages/plugin-web/src/vite.ts) owns all three
environments. Keep React and Query module identity consistent. Query is excluded
from dependency pre-bundling in each environment because its internal client
references also occur in the RSC graph; this does not disable production bundling.
Use the [dependency validation workflow](../dependency-validation/SKILL.md) when
changing that integration or upgrading React/Vite. The host implements its own
page protocol; examples for Next.js, Vike, or React Server Actions require adaptation.

## Official references

- [React documentation index](https://react.dev/llms.txt) and
  [Server Components](https://react.dev/reference/rsc/server-components)
- [Vite documentation index](https://vite.dev/llms.txt)
- [Vite RSC plugin](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc)

Match examples to the installed versions, including the RSC plugin's bundled
React server runtime.
