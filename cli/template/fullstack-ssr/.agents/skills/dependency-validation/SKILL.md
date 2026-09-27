---
name: dependency-validation
description: "Add or upgrade runtime, browser, or build dependencies and validate their integration with this workspace's Cordis/Vite/RSC stack. Also use for dependency optimization or duplicate React/Query context warnings."
---

# Dependency integration and validation

Inspect [package manifests](../../../package.json), the
[catalog](../../../pnpm-workspace.yaml), installed versions, and the importing
packages before changing dependencies. Determine whether the dependency executes
in Cordis, RSC, SSR, the browser, or a build tool. Add it to the package that uses
it and follow existing `catalog:` and `workspace:*` conventions.

## Integration decisions

- Keep unrelated versions unchanged. Check peer compatibility, especially React,
  React DOM, and the RSC plugin's bundled runtime. New dependencies should preserve
  the current Rolldown/Vite build path; inspect transitive tooling rather than
  reintroducing esbuild or a parallel build pipeline unnoticed.
- Inspect the host's [Vite config](../../../packages/plugin-web/src/vite.ts) for
  module identity issues. `resolve.dedupe`, `resolve.noExternal`, and
  `optimizeDeps.exclude` have different purposes; avoid applying all of them to
  every dependency.
- Keep the current Query pre-bundling exclusion consistent across `rsc`, `ssr`,
  and `client`. Its internal client references also appear in the RSC graph.
  Verify optimized dependencies after HMR and with an existing cache, not only on
  the first page load. Do not hide optimizer/context warnings as a fix.
- Pre-bundling exclusions affect development. They do not remove the package
  from production bundles or replace runtime dependencies with devDependencies.
- Consult the relevant stack skill and version-matched official docs when needed.
  Online examples do not authorize unrelated upgrades or architecture changes.

## Validation

Use [the validation matrix](references/validation.md) for runtime, browser, and
build dependency changes. It gives commands and observable checks for both apps,
fresh/retained caches, HMR, production, and hydration. A successful build alone
does not establish development or browser correctness.

For documentation-only work, check formatting and links. For an isolated lint,
format, or Git-hook tool update, run its affected commands and hooks instead of
the rendering matrix unless the change also affects the app build/runtime.
Report executed checks and any unverified scenarios with their reason. No
particular browser automation tool or external service is required by this skill.

## Official references

- [Vite dependency pre-bundling](https://vite.dev/guide/dep-pre-bundling)
- [Vite dependency optimization options](https://vite.dev/config/dep-optimization-options)
- [Vite RSC plugin](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc)
- [pnpm catalogs](https://pnpm.io/catalogs)
