import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { resolveDatabaseEnv } from "./env";
import { databaseUrlForScope, dataScope, type DataScope } from "../lib/execution-context";

declare global {
  // eslint-disable-next-line no-var
  var __cbDatabases: Map<DataScope, ReturnType<typeof makeDatabase>> | undefined;
}

function makeDatabase(scope: DataScope) {
  resolveDatabaseEnv();
  const url = databaseUrlForScope(scope);
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. On Vercel: Storage → connect a Neon Postgres database to this project, then redeploy. " +
        "Locally: copy .env.example to .env and point DATABASE_URL at your Postgres.",
    );
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    // Serverless functions: keep the pool tiny and let Neon's pooler do the rest.
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
  });
  return drizzle(pool, { schema });
}

// Select lazily inside the authenticated request. Never mutate process-wide URLs.
const databases = globalThis.__cbDatabases ?? new Map<DataScope, ReturnType<typeof makeDatabase>>();
if (process.env.NODE_ENV !== "production") globalThis.__cbDatabases = databases;
export const db = new Proxy({} as ReturnType<typeof makeDatabase>, {
  get(_target, property) {
    resolveDatabaseEnv();
    const scope = dataScope();
    // Revalidate on every access, including when a cached pool already exists.
    databaseUrlForScope(scope);
    let selected = databases.get(scope);
    if (!selected) {
      selected = makeDatabase(scope);
      databases.set(scope, selected);
    }
    const value = Reflect.get(selected, property);
    return typeof value === "function" ? value.bind(selected) : value;
  },
});

export async function closeDatabases() {
  await Promise.all([...databases.values()].map(database => database.$client.end()));
  databases.clear();
}
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
