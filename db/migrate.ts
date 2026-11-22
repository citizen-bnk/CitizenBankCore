/**
 * Applies pending SQL migrations from ./drizzle. Runs on every Vercel build
 * (see "vercel-build" in package.json) and locally via `npm run db:migrate`.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { applyMissing } from "./catch-up";
import { loadEnv } from "./env";
import { demoDatabaseUrl } from "../lib/execution-context";

loadEnv();

async function main() {
  const url = process.env.LIVE_DATABASE_URL_UNPOOLED || process.env.LIVE_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] No DATABASE_URL set — skipping migrations.");
    return;
  }
  const targets = [url];
  if (process.env.DEMO_MODE === "true") {
    demoDatabaseUrl(); // Validate that fiction cannot alias the business database.
    targets.push(process.env.DEMO_DATABASE_URL_UNPOOLED || process.env.DEMO_DATABASE_URL!);
  }
  for (const connectionString of targets) {
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: true },
  });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  const caughtUp = await applyMissing(pool, "./drizzle");
  if (caughtUp.length) console.log(`[migrate] Applied ${caughtUp.length} migration(s) that were older than the newest applied one.`);
  await pool.end();
  }
  console.log("[migrate] Database is up to date.");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
