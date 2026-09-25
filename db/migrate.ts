/**
 * Applies pending SQL migrations from ./drizzle. Runs on every Vercel build
 * (see "vercel-build" in package.json) and locally via `npm run db:migrate`.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] No DATABASE_URL set — skipping migrations.");
    return;
  }
  const pool = new Pool({
    connectionString: url,
    max: 1,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true },
  });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("[migrate] Database is up to date.");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
