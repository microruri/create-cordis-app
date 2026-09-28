---
name: drizzle-postgres
description: "Change PostgreSQL-backed plugin data, Drizzle ORM schemas, connection lifecycle, or the workspace's committed SQL migrations."
---

# Drizzle and PostgreSQL

Start with [Todos' schema](../../../packages/plugin-todos/src/server/schema.ts)
and [router](../../../packages/plugin-todos/src/server/router.ts). The
[database guide](../../../README.md#database-and-migrations) explains local setup
and the workspace's shared migration history.

## Ownership and lifecycle

- Each app has its own PostgreSQL service, volume, and app-local `DATABASE_URL`.
  Check the effective environment before running commands: shell variables take
  precedence over app files and can otherwise point both apps at one database.
- Business plugins inject `database` and use the scoped `ctx.database.db`.
  The database service owns the pool; avoid creating pools per request or per
  business plugin. Business-plugin HMR reuses that pool.
- Schemas live with business plugins in `src/server`. Use distinct table names
  and keep the schema and queries out of browser imports.

## Schema changes

1. Update the TypeScript schema and run `pnpm db:new descriptive_name`.
2. Write the generated SQL file, using `--> statement-breakpoint` between
   statements where needed. Review existing data implications.
3. Apply migrations to the intended local/test databases with `pnpm db:migrate`
   or its app-specific command, and verify the affected queries.
4. Keep the schema, SQL file, and `drizzle/meta/_journal.json` in the same change.

Migration execution uses Drizzle ORM, committed SQL, a transaction, and a
PostgreSQL advisory lock. There is no Drizzle Kit schema generator or automatic
rollback. Preserve applied SQL and journal entries; express later changes as new
migrations. Both apps receive the same history even when a plugin is disabled.

`pnpm db:setup` prepares missing env files, starts local databases, and migrates.
It is a setup operation, not a prerequisite for builds or documentation checks.
Dev/start never migrate automatically. Preserve existing data during validation;
use isolated test data/databases for destructive migration scenarios. Disabling
a plugin does not delete its tables. `db:down` preserves volumes.

## Official references

- [Drizzle documentation index](https://orm.drizzle.team/llms.txt) and
  [ORM migrations](https://orm.drizzle.team/docs/migrations)
- [PostgreSQL documentation](https://www.postgresql.org/docs/): use the major
  version declared in the workspace's Compose configuration.
