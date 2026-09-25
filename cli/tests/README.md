# Template tests

These integration tests belong to the scaffolder and are not included in generated
projects or the published CLI package. They cover HTTP behavior, lifecycle,
configuration errors, app-local environments, YAML reloads, and isolated plugin HMR.

Use Node.js 24.12.0 or newer within the 24.x line and pnpm 11.24.0. From the
repository root, install both the CLI and the independent template workspace:

```sh
pnpm install
pnpm --dir cli/template/workspace install
pnpm test
```

`pnpm test` discovers all `*.test.ts` files under `cli/tests`, including nested
directories. Add new tests using this naming convention; no script changes are
needed. `pnpm lint` and `pnpm typecheck` also check the entire tests directory.
The TypeScript configuration inherits the template's compiler options.

The tests copy template source and configuration into temporary workspaces and
link their dependencies to the template's installed packages. Source files and
configuration in the template are not modified. Run the suite when changing the
template or upgrading Cordis, its plugins, or Node.js.
