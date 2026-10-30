/** Run only on a newly provisioned canonical database, never on a legacy store. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Pool} from 'pg';

const url = process.env.CANONICAL_DATABASE_URL;
if (!url) throw new Error('CANONICAL_DATABASE_URL is required. Legacy DATABASE_URL is deliberately ignored.');

const target = new URL(url);
const expected = `${target.hostname}/${target.pathname.slice(1)}`;
if (process.env.CANONICAL_TARGET_NAME !== expected) {
  throw new Error(`Set CANONICAL_TARGET_NAME to ${expected} after verifying this is the fresh database.`);
}

async function main(): Promise<void> {
  const pool = new Pool({connectionString: url, max: 1, connectionTimeoutMillis: 10_000});
  try {
    const client = await pool.connect();
    try {
      const {rows} = await client.query<{table_schema:string;table_name:string}>(`
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog','information_schema','neon_auth')
      LIMIT 1`);
      if (rows.length) {
        throw new Error(`Target is not empty: ${rows[0].table_schema}.${rows[0].table_name}. No migration applied.`);
      }
      if (process.argv.includes('--apply')) {
        const sql = readFileSync(resolve('db/canonical/001_foundation.sql'), 'utf8');
        await client.query(sql);
        console.log('Canonical foundation applied to fresh database. Applicant: Citizen Digital Ltd (99073).');
      } else {
        console.log('Fresh database preflight passed. Rerun with --apply to create the canonical foundation.');
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Canonical migration failed'); process.exitCode = 1; });
