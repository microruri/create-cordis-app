---
name: drizzle-postgres
description: "Change PostgreSQL-backed plugin data, Drizzle ORM schemas, service-owned data access, connection lifecycle, or the app's committed SQL migrations."
---

# Drizzle and PostgreSQL

Start with [Todos' schema](../../../packages/plugin-todos/src/server/schema.ts),
[service](../../../packages/plugin-todos/src/server/service.ts), and
[router](../../../packages/plugin-todos/src/server/router.ts). The
[database guide](../../../README.md#database-and-migrations) explains local
setup, service-based data access, and the apps' shared migration history.

## Ownership and lifecycle

- Each app has its own PostgreSQL service, volume, and app-local `DATABASE_URL`.
  Check the effective environment before running commands: shell variables take
  precedence over app files and can otherwise point both apps at one database.
- `plugin-database` is generic and schema-free: it owns one app-scoped pool,
  exposes it as `ctx.database.db`, and closes the pool when its service stops.
  Avoid creating pools per request or per business plugin; business-plugin HMR
  reuses that pool.
- Table schemas live with their owning business plugin in `src/server` and are
  exported server-only (for example `@acme/plugin-todos/schema`).
  `@acme/app-database` aggregates the app's schemas and owns the committed SQL
  migrations; data-owning plugins never import it, so the dependency graph
  stays cycle-free. Use distinct table names and keep schemas and queries out
  of browser imports; the client build rejects them.
- Write through the owning service (`ctx.todos.create`, `update`, and
  `delete`, each accepting an optional `{ tx }` of the schema-free
  `DatabaseExecutor` type from `@acme/plugin-database`); validation lives
  there, and the tRPC router is a thin adapter over it. Direct reads and
  joins through the public schema are fine. Transactions are same-app only:
  one process, one pool, one database. Compose owned writes with a raw read
  inside one transaction:

```ts
import { todos } from "@acme/plugin-todos/schema";

await ctx.database.db.transaction(async (tx) => {
  await ctx.todos.create({ title: "First" }, { tx });
  await ctx.todos.create({ title: "Second" }, { tx });
  const rows = await tx.select().from(todos);
});
```

## Schema changes

1. Update the TypeScript schema and run `pnpm db:new descriptive_name`. The
   command resolves each app's declared migration stream from its
   `package.json` and creates the migration in the folder both apps share;
   diverged folders fail the command instead of picking one.
2. Write the generated SQL file, using `--> statement-breakpoint` between
   statements where needed. Review existing data implications.
3. Apply migrations to the intended local/test databases with `pnpm db:migrate`
   — each app applies its own declared folder — or with the app-specific
   command for one app, and verify the affected queries.
4. Keep the schema, SQL file, and `meta/_journal.json` in the same change.

Migration execution uses Drizzle ORM's migrator over committed SQL, inside a
transaction and behind a PostgreSQL advisory lock, using Drizzle's default
history table and the committed journal timestamps. There is no Drizzle Kit schema
generator or automatic rollback. Preserve applied SQL and journal entries;
express later changes as new migrations. Both apps share one history while
their manifests select the same folder; when the apps diverge, give each app
its own composition and history and run the per-app `db:migrate` commands
explicitly.

`pnpm db:setup` prepares missing env files, starts local databases, and migrates.
It is a setup operation, not a prerequisite for builds or documentation checks.
Dev/start never migrate automatically. Preserve existing data during validation;
use isolated test data/databases for destructive migration scenarios. Disabling
a plugin removes its services, not its tables. `db:down` preserves volumes.

## Official references

- [Drizzle documentation index](https://orm.drizzle.team/llms.txt) and
  [ORM migrations](https://orm.drizzle.team/docs/migrations)
- [PostgreSQL documentation](https://www.postgresql.org/docs/): use the major
  version declared in the workspace's Compose configuration.
