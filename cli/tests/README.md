# CLI and template tests

These tests belong to the scaffolder and are not included in generated projects or
the published CLI package. They cover CLI project creation and errors, plus HTTP
behavior, lifecycle, configuration errors, app-local environments, YAML reloads,
and isolated plugin HMR in the workspace template. Fullstack tests also cover typed
RPC, input validation, plugin lifecycle streams, isolated application frontends,
configuration discovery, build isolation, and production serving.
SSR tests build both apps in a temporary workspace, verify rendered data and HTTP
behavior, request isolation, disabled plugins, missing builds, and development
reloads. They run each app in a separate process, matching Vike's runtime model,
and check shutdown with an active HMR connection.

For frontend changes, also check browser Fast Refresh, card state preservation
when another plugin changes, YAML enable/disable, and page-level errors.
For SSR, also check hydration without an extra initial RPC request, client
navigation, and the absence of business WebSockets or production event streams.

Use Node.js 24.12.0 or newer within the 24.x line and pnpm 11.24.0. From the
repository root, install the CLI and each independent template workspace:

```sh
pnpm install
pnpm --dir cli/template/workspace install
pnpm --dir cli/template/fullstack install
pnpm --dir cli/template/fullstack-ssr install
pnpm test
```

`pnpm test` first builds the CLI, then discovers all `*.test.ts` files under
`cli/tests`, including nested directories. Add tests using this naming convention;
no script changes are needed. `pnpm lint` and `pnpm typecheck` also check the entire
tests directory.
The TypeScript configuration inherits the template's compiler options.

The workspace integration tests copy source and configuration into temporary
workspaces and link dependencies to the template's installed packages. Source files
and configuration in the template are not modified. Run the suite when changing
the template or upgrading Cordis, its plugins, or Node.js.
