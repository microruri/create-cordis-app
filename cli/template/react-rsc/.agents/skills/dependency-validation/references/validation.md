# Dependency validation matrix

Use this matrix after adding or upgrading a runtime, browser, or build dependency,
or changing Vite dependency resolution. Commands below run from the generated
workspace root. Setup and environment details are in the
[README](../../../../README.md); the workspace does not ship a test runner.

## Prepare

Record the affected packages, previous/new versions, and execution environments.
After editing manifests/catalog entries, run `pnpm install` and inspect the
resolved dependency/peer changes. Keep unrelated updates out of the change.
Use the Node/pnpm versions declared by the project.

Use app-local environment files and separate test databases. If a local test
workspace has no databases yet, `pnpm db:setup` prepares them; otherwise use its
existing setup. Check the effective `DATABASE_URL` before migrations or CRUD.
Do not reuse someone else's running server as a disposable validation process.
If the usual ports are occupied, use unused ports for the test instances.

## Baseline commands

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

`build` covers both apps and their dependencies. When verifying the actual
compiler/bundler after a dependency change, check the Turbo output; if it only
restores cached artifacts, use `pnpm exec turbo run build --force` once. Building
must not connect to PostgreSQL. Inspect browser outputs for unexpected Node,
database, or server-only imports.

## Development, restart, and HMR

Run `pnpm dev`, or `pnpm dev:app-a` / `pnpm dev:app-b` separately. Visit both
apps' hello pages, `/todos`, and `/healthz`; exercise the added dependency's actual
code path. Check server logs and browser console/network activity.

| Scenario               | Procedure and expected result                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh cache            | In the isolated test workspace, stop its dev processes and remove only each tested app's `.cordis/vite` cache after verifying the paths. Start dev and load pages. Rendering and API calls work without optimizer/context errors. |
| Retained cache         | Stop and restart dev without clearing caches. Repeat the page and interaction checks. Also retain a pre-change cache when available to verify config/dependency invalidation.                                                     |
| Client HMR             | With a form value entered, edit a client component's markup/style. The update appears and compatible local state survives; no duplicate Query provider/context is introduced.                                                     |
| RSC HMR                | After browser dependencies finish optimizing, edit a server page, then a page manifest. RSC content updates; the manifest may trigger the host's full reload. Check for inconsistent-optimization warnings after this step.       |
| Business HMR           | Edit business-plugin backend code and toggle its YAML availability. APIs and pages follow the change; the app process and shared database pool are reused.                                                                        |
| Infrastructure restart | Runtime, RPC, database, and web-host changes use an explicit restart. They are not expected to behave like business-plugin HMR.                                                                                                   |

Avoid `pnpm clean` for a cache check: it also removes dependencies and build
outputs. Keep environment files, database volumes, and other running apps intact.
After checks, revert temporary edits in the test workspace and stop its processes.

## Production and hydration

Stop the test dev processes before `pnpm start` (or its app-specific commands).
Production must serve the built pages/assets/APIs without a Vite dev server or
HMR connection. Direct page visits and client navigation must work in both apps.
When changing dependency classification, also validate a disposable deployment
copy with production dependencies only after building.

Check these browser behaviors in development and production:

- The HTML response contains server-rendered page content before hydration. The
  browser becomes interactive without hydration mismatch or missing-QueryClient
  errors. Use the raw document response or a JavaScript-disabled visit to inspect
  initial content.
- Hello shows the app's server-rendered greeting without an extra initial hello
  query. Submitting the form shows pending, success, and validation/error feedback.
- Todos consumes the server's Query state without an extra immediate list request
  on a fresh page load. Creating/updating/deleting test data refreshes the list.
  Keep these checks immediate and avoid tab-focus changes when counting initial
  requests: later stale-query refetches are separate behavior.
- Client navigation requests RSC rather than reloading the document.
  `router.refresh()` updates server data and retains compatible client state.
  Default links do not prefetch on hover/focus; explicitly enabled prefetch is
  reused by navigation and invalidated around mutations.
- For React/RSC/stream integration changes, use a controlled slow server read to
  verify that the shell arrives before completion and that disconnecting cancels
  supported work. Keep any artificial delay or validation control out of shipped
  examples.

## Report

Summarize the versions/config changed, commands executed, both apps' results,
cache/HMR results, and observed browser behavior. Investigate new relevant
warnings rather than suppressing them. Record unavailable Docker/browser/network
checks as unverified with a reason; never infer they passed from typechecking.
Keep any resulting automated regression tests in the application's existing test
setup when one exists; this workflow does not require introducing a test framework.
