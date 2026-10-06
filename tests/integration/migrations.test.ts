/**
 * A database that already ran one branch's migration must still receive the other's.
 * Needs DATABASE_URL (a scratch server); creates and drops its own databases.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { applyMissing } from "../../db/catch-up";

const base = process.env.DATABASE_URL;
const skip = !base;
const withDb = (name: string) => { const u = new URL(base!); u.pathname = `/${name}`; return u.toString(); };
const has = async (pool: Pool, table: string) =>
  (await pool.query("select to_regclass($1) is not null as ok", [`public.${table}`])).rows[0].ok as boolean;

async function freshDb(name: string) {
  const admin = new Pool({ connectionString: base });
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  await admin.end();
  return new Pool({ connectionString: withDb(name), max: 2 });
}

test("a database that already ran the single sign-on migration first still gets the KYC tables", { skip }, async () => {
  // Rebuild the old state: only 0000 and the sso migration under its OLD number (0001), with the old timestamp.
  const old = mkdtempSync(join(tmpdir(), "old-"));
  cpSync("drizzle", old, { recursive: true });
  for (const f of ["0001_progressive_kyc.sql", "0002_admin_bootstrap.sql", "0003_sso.sql"]) rmSync(join(old, f));
  cpSync("drizzle/0003_sso.sql", join(old, "0001_sso.sql")); // byte-identical content, so the same hash
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  journal.entries = [journal.entries[0], { ...journal.entries[3], idx: 1, tag: "0001_sso" }];
  writeFileSync(join(old, "meta", "_journal.json"), JSON.stringify(journal));

  const pool = await freshDb("mig_old_sso_first");
  try {
    await migrate(drizzle(pool), { migrationsFolder: old });
    assert.equal(await has(pool, "sso_tokens_used"), true);
    assert.equal(await has(pool, "kyc_profiles"), false);

    // Today's migrations: Drizzle alone skips the KYC ones (they are older than the newest applied)...
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    assert.equal(await has(pool, "kyc_profiles"), false, "premise: plain Drizzle skips them");
    // ...the catch-up applies exactly the missing ones, and the sso migration is recognised by hash, not re-run.
    const applied = await applyMissing(pool, "./drizzle");
    assert.equal(applied.length, 2);
    assert.equal(await has(pool, "kyc_profiles"), true);
    assert.equal(await has(pool, "admin_invites"), true);
    assert.deepEqual(await applyMissing(pool, "./drizzle"), [], "a second run changes nothing");
  } finally {
    await pool.end();
    rmSync(old, { recursive: true, force: true });
  }
});

test("a fresh database gets everything from the normal run and the catch-up has nothing to do", { skip }, async () => {
  const pool = await freshDb("mig_fresh");
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    assert.deepEqual(await applyMissing(pool, "./drizzle"), []);
    for (const t of ["kyc_profiles", "passkeys", "admin_invites", "sso_tokens_used"]) assert.equal(await has(pool, t), true, t);
  } finally {
    await pool.end();
  }
});
