import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __cbPool: Pool | undefined;
}

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. On Vercel: Storage → connect a Neon Postgres database to this project, then redeploy. " +
        "Locally: copy .env.example to .env and point DATABASE_URL at your Postgres.",
    );
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    // Serverless functions: keep the pool tiny and let Neon's pooler do the rest.
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
  });
}

// Reuse one pool per server instance (and across hot reloads in dev).
const pool = globalThis.__cbPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__cbPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
