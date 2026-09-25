import { existsSync, readFileSync } from "node:fs";

/** Minimal .env loader for CLI scripts (Next.js loads .env itself). Returns resolveDatabaseEnv()'s source. */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  }
  return resolveDatabaseEnv();
}

/**
 * Fills DATABASE_URL / DATABASE_URL_UNPOOLED from the other names Vercel's database
 * integrations use: POSTGRES_URL(_NON_POOLING) from Vercel Postgres, or a custom prefix
 * chosen when connecting Neon (e.g. STORAGE_URL, STORAGE_DATABASE_URL). Only variables
 * holding a postgres:// URL count, and a prefixed name is only used when exactly one
 * matches, so we never guess between two databases.
 * Returns the variable DATABASE_URL was taken from, if it wasn't set directly.
 */
export function resolveDatabaseEnv(): string | undefined {
  const env = process.env;
  const pg = Object.keys(env).filter((k) => isPostgresUrl(env[k]));
  const pick = (exact: string, patterns: RegExp[]) => {
    if (isPostgresUrl(env[exact])) return exact;
    for (const re of patterns) {
      const hits = pg.filter((k) => re.test(k));
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) return undefined; // ambiguous: don't guess
    }
    return undefined;
  };

  let source: string | undefined;
  if (!env.DATABASE_URL) {
    source = pick("POSTGRES_URL", [/^[A-Za-z0-9]+_URL$/, /^[A-Za-z0-9]+_DATABASE_URL$/, /^[A-Za-z0-9]+_POSTGRES_URL$/]);
    if (source) env.DATABASE_URL = env[source];
  }
  if (!env.DATABASE_URL_UNPOOLED) {
    const un = pick("POSTGRES_URL_NON_POOLING", [
      /^[A-Za-z0-9]+_URL_UNPOOLED$/, /^[A-Za-z0-9]+_DATABASE_URL_UNPOOLED$/, /^[A-Za-z0-9]+_POSTGRES_URL_NON_POOLING$/,
    ]);
    if (un) env.DATABASE_URL_UNPOOLED = env[un];
  }
  return source;
}

const isPostgresUrl = (v: string | undefined) => !!v && /^postgres(ql)?:\/\//.test(v);

/** Names (never values) of set variables that look database-related, for diagnostics. */
export function databaseLikeEnvNames() {
  return Object.keys(process.env)
    .filter((k) => process.env[k] && (/DATABASE|POSTGRES|^PG|NEON|STORAGE/.test(k) || isPostgresUrl(process.env[k])))
    .sort();
}
