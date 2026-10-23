import { AsyncLocalStorage } from "node:async_hooks";

export type DataScope = "live" | "demo";
const scopes = new AsyncLocalStorage<DataScope>();

export function dataScope(): DataScope {
  return scopes.getStore() ?? "live";
}

/** Call only after authentication has verified the signed session or handoff. */
export function withDataScope<T>(scope: DataScope, action: () => T): T {
  if (scope === "demo" && process.env.DEMO_MODE !== "true") {
    throw new Error("Demo mode is disabled");
  }
  return scopes.run(scope, action);
}

/** Missing claims remain live; malformed claims never fall back to live. */
export function scopeFromVerifiedClaim(value: unknown): DataScope {
  if (value === undefined || value === "live") return "live";
  if (value === "demo" && process.env.DEMO_MODE === "true") return "demo";
  throw new Error("Invalid or disabled data scope");
}

function databaseIdentity(value: string): string {
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname === "/") {
      throw new Error();
    }
    // Neon direct and pooled endpoints address the same database.
    return `${url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "")}:${url.port || "5432"}${url.pathname}`;
  } catch {
    // Never include connection strings or credentials in an error.
    throw new Error("Invalid database configuration");
  }
}

export function demoDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.DEMO_MODE !== "true") throw new Error("Demo mode is disabled");
  const live=env.LIVE_DATABASE_URL||env.DATABASE_URL;
  if (!live || !env.DEMO_DATABASE_URL) throw new Error("Separate live and demo databases are required");
  if (databaseIdentity(live) === databaseIdentity(env.DEMO_DATABASE_URL)) {
    throw new Error("Demo database must be different from the live database");
  }
  return env.DEMO_DATABASE_URL;
}

export function databaseUrlForScope(scope: DataScope = dataScope()): string {
  if (scope === "demo") return demoDatabaseUrl();
  const live=process.env.LIVE_DATABASE_URL||process.env.DATABASE_URL;
  if (!live) throw new Error("Business database is not configured");
  databaseIdentity(live);
  return live;
}
