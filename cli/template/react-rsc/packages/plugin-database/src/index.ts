import { Context, Service } from "cordis";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

declare module "cordis" {
  interface Context {
    database: Database;
  }
}

export interface Config {
  url: string;
}

/** The transaction handle passed to `database.db.transaction` callbacks. */
export type DatabaseTransaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** A schema-free query handle: the shared database or one of its transactions. */
export type DatabaseExecutor = NodePgDatabase | DatabaseTransaction;

export default class Database extends Service {
  db: NodePgDatabase;
  private pool: Pool;

  constructor(ctx: Context, config: Config) {
    super(ctx, "database");
    if (!config.url)
      throw new Error("DATABASE_URL is missing. Run pnpm db:setup or configure the app's .env.");
    this.pool = new Pool({ connectionString: config.url, max: 10, connectionTimeoutMillis: 5000 });
    this.db = drizzle({ client: this.pool });
    this.pool.on("error", () => ctx.logger.error("An idle PostgreSQL connection failed."));
  }

  async *[Service.init]() {
    yield () => this.pool.end();
    try {
      await this.pool.query("select 1");
    } catch {
      throw new Error("Cannot connect to PostgreSQL. Check DATABASE_URL and run pnpm db:up.");
    }
  }
}
