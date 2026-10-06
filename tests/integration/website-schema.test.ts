/**
 * The website database builder against a scratch server: every column the website's investor screens select must
 * exist after the migrations, and a second run must change nothing. Needs DATABASE_URL (a scratch server).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";

const base = process.env.DATABASE_URL;
const skip = !base;
const withDb = (name: string) => { const u = new URL(base!); u.pathname = `/${name}`; return u.toString(); };

// Selected by GET /api/subscriptions/core/my-public-subscriptions in the website (subscriptions_core).
const SUBSCRIPTION_COLUMNS = [
  "id", "subscription_id", "user_id", "full_name", "email", "phone", "id_number", "num_shares", "share_class",
  "total_amount", "amount_paid", "payment_method", "payment_status", "installment_plan", "status", "certificate_number",
  "certificate_issued_date", "certificate_url", "payment_deadline", "created_at", "updated_at", "created_by_admin", "admin_user_id",
];

function migrate(url: string) {
  return spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "db/website/migrate.ts"], {
    env: { ...process.env, DEMO_MODE: "true", WEBSITE_DATABASE_URL: url }, encoding: "utf8",
  });
}

test("a fresh website database has every column the investor screens read, and re-running changes nothing", { skip, timeout: 60_000 }, async () => {
  const name = "web_schema_check";
  const admin = new Pool({ connectionString: base });
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  const url = withDb(name);
  try {
    const first = migrate(url);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const pool = new Pool({ connectionString: url, max: 1 });
    const { rows } = await pool.query("select column_name from information_schema.columns where table_name = 'share_subscriptions'");
    const have = new Set(rows.map((r) => r.column_name));
    assert.deepEqual(SUBSCRIPTION_COLUMNS.filter((c) => !have.has(c)), [], "share_subscriptions lacks columns the website selects");
    await pool.end();
    const second = migrate(url);
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.doesNotMatch(second.stdout, /Applied /, "a second run applied something");
  } finally {
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
