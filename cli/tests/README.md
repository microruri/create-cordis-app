# CLI and template tests

These tests belong to the scaffolder and are not included in generated projects or
the published CLI package. They cover CLI project creation and errors, plus HTTP
behavior, lifecycle, configuration errors, app-local environments, YAML reloads,
and isolated plugin HMR in the workspace template. React SPA tests also cover typed
RPC, input validation, plugin lifecycle streams, isolated application frontends,
configuration discovery, build isolation, and production serving.
Both web hosts also support an empty page registry and a plugin-owned `/`.
Check the blank homepage in the browser, homepage enable/disable and duplicate
routes, page error recovery, and the absence of built-in navigation or layout.
React RSC tests build both apps in a temporary workspace, verify rendered data and HTTP
behavior, RSC navigation responses, dynamic parameters, redirects, request
isolation, disabled plugins, server-only boundaries, missing builds, and development
reloads. They run each app in a separate process, with independent SSR builds,
and check shutdown with an active HMR connection. A gated async component verifies
that the shell arrives before data resolves in both development and production;
disconnecting the request cancels its work.
Navigation tests cover speculative request reuse, expiry, bounded eviction,
mutation invalidation, cancellation, streaming lifetimes, and stale responses.
The SSR fixtures include a hydrated query and controls for the public navigation
API; server checks verify fresh dehydrated data after a mutation.

For frontend changes, also check browser Fast Refresh, page state preservation
when another plugin changes, YAML enable/disable, and page-level errors.
For SSR, check both hello forms for pending, success, and error states, and verify
that their server-rendered greetings need no extra browser query. Also check
Todos hydration without an extra initial RPC request, client
navigation, history, scroll restoration, server/client component updates, and the
absence of business WebSockets or production event streams. Inspect browser
bundles for server-only code, and verify production with only runtime dependencies.
Also check that default links and explicit opt-outs make no request on hover or
focus, while explicit opt-ins prefetch and reuse the request on click. Check the navigation hook's pending state before response arrival, refresh preserving inputs and scroll, existing query hydration, mutation
invalidation of prefetched pages, replace navigation, and page-error retry. A
prefetch must not change the current page or issue an extra request when consumed.

Use Node.js 24.12.0 or newer within the 24.x line and pnpm 11.24.0. From the
repository root, install the CLI and each independent template workspace:

```sh
pnpm install
pnpm --dir cli/template/workspace install
pnpm --dir cli/template/react-spa install
pnpm --dir cli/template/react-rsc install
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

## PostgreSQL integration tests

The default suite stays independent of Docker. To also run real database tests,
start Docker and opt in from PowerShell:

```powershell
$env:CCA_TEST_DATABASE = "1"
pnpm test
Remove-Item Env:CCA_TEST_DATABASE
```

On a POSIX shell, use `CCA_TEST_DATABASE=1 pnpm test`. To run only the database
tests after `pnpm build`, set the variable and run:

```sh
node --expose-internals --conditions=development --test cli/tests/database.test.ts
```

These tests generate both fullstack templates with the CLI, start isolated
temporary Compose projects on dynamically allocated ports, and clean up their
own containers and volumes. They verify repeated setup, transaction rollback,
concurrent migration runners, migration history, CRUD and
validation, app isolation, persistence after restart, SSR data, plugin lifecycle,
connection-pool reuse during HMR, and connection cleanup on shutdown. They never
use the template workspaces' database volumes. Docker must be able to pull
`postgres:17-alpine` on the first run.
