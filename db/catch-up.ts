/**
 * Drizzle only runs migrations newer than the newest one already applied (by timestamp). When two branches each
 * added a migration and one of them was applied first, the other one is skipped forever. This applies any
 * migration whose content hash is not recorded, so the database always ends up with every migration.
 * Every migration in this repository must therefore be safe to run on a database that lacks only that one.
 */
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool } from "pg";

export async function applyMissing(pool: Pick<Pool, "connect">, migrationsFolder: string): Promise<string[]> {
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ hash: string }>('SELECT hash FROM "drizzle"."__drizzle_migrations"');
    const known = new Set(rows.map((r) => r.hash));
    for (const m of readMigrationFiles({ migrationsFolder })) {
      if (known.has(m.hash)) continue;
      await client.query("BEGIN");
      try {
        for (const statement of m.sql) await client.query(statement);
        await client.query('INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)', [m.hash, m.folderMillis]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
      applied.push(m.hash.slice(0, 8));
    }
  } finally {
    client.release();
  }
  return applied;
}
