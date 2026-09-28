# create-cordis-app

A small CLI for creating [Cordis](https://cordis.js.org/) projects from bundled
templates. Enter a project name, choose a template, and start building.

The CLI creates files only. Git initialization and dependency installation are
left to you.

## Local usage

Use Node.js 22.12.0 or newer and pnpm 11.24.0 to build the CLI from this repository:

```sh
pnpm install
pnpm build
node cli/dist/index.js
```

Follow the prompts, or provide both values directly:

```sh
node cli/dist/index.js my-app --template workspace
```

The project is created in a new directory under your current working directory.
To create it elsewhere, run the built CLI by its absolute path from the desired
parent directory. Existing files and directories are never overwritten.

Use a lowercase project name such as `my-app`. Paths and scoped package names are
not accepted. Run `node cli/dist/index.js --help` for usage.

After creating a `workspace` project:

```sh
cd my-app
pnpm install
pnpm dev
```

## Templates

| Template                                        | Includes                                                                                                                                             | Requirements                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [workspace](./cli/template/workspace/README.md) | Two independent Cordis apps, YAML configuration, shared runtime, plugin HMR, and build tooling                                                       | Node.js >=24.12.0 <25; pnpm 11.24.0                 |
| [react-spa](./cli/template/react-spa/README.md) | Two Cordis apps with React SPA pages and cards, HTTP tRPC, Vite HMR, Tailwind CSS, daisyUI, and Drizzle/PostgreSQL todos                             | Node.js >=24.12.0 <25; pnpm 11.24.0; Docker Compose |
| [react-rsc](./cli/template/react-rsc/README.md) | Two Cordis apps with React Server Components and streaming SSR, typed server callers, HTTP tRPC, Tailwind CSS, daisyUI, and Drizzle/PostgreSQL todos | Node.js >=24.12.0 <25; pnpm 11.24.0; Docker Compose |

To create the React RSC template from this checkout:

```sh
node cli/dist/index.js my-app --template react-rsc
cd my-app
pnpm install
pnpm db:setup
pnpm dev
```

Both fullstack templates need Docker running for `db:setup`. Each app gets its own
PostgreSQL container and volume. Setup preserves existing env files and data and
applies the committed migrations; `dev` and `start` do not migrate automatically.
Open `/todos` on either app to try persistent CRUD. See each template's README for
database ports, schema changes, and deployment steps.

The project name determines the output directory. All templates keep
`@acme` as their package scope; replace it with your own scope when needed.

Generated projects include source files, configuration, documentation, and example
environment files. Installed dependencies, build outputs, caches, local environment
files, and lockfiles are excluded.

## Development

```sh
pnpm dev
```

This watches and rebuilds the CLI. Run `node cli/dist/index.js` separately to try it.
Add templates as directories under `cli/template/`; rebuild to include them in the
template selector. Build output contains the CLI and its templates under `cli/dist/`.

```sh
pnpm lint
pnpm typecheck
pnpm --dir cli/template/workspace install
pnpm --dir cli/template/react-spa install
pnpm --dir cli/template/react-rsc install
pnpm test
```

Tests build the CLI, verify project creation, and exercise all templates.
See [the test guide](./cli/tests/README.md) for details. The CLI's published file
list includes only build output and the package manifest.

## References

The CLI flow takes inspiration from
[create-t3-app](https://github.com/t3-oss/create-t3-app), using
[Clack](https://github.com/bombshell-dev/clack) for prompts and
[Rolldown](https://rolldown.rs/) for builds.
