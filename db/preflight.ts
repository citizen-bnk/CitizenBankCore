/**
 * Build preflight. Runs first in "vercel-build" (and via `npm run preflight`) so a
 * misconfigured deployment fails with one clear list of what to set, instead of an
 * obscure error from deep inside `next build`.
 *
 * On Vercel, missing required settings fail the build. Locally they are warnings,
 * since `npm run build` without a database is fine for checking that the code compiles.
 */
import { anthropicLikeEnvNames, databaseLikeEnvNames, loadEnv, resolveAnthropicEnv } from "./env";

const dbSource = loadEnv();

const onVercel = !!process.env.VERCEL;
const errors: string[] = [];
const warnings: string[] = [];

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  errors.push(
    "DATABASE_URL is not set. The app has no database to use.\n" +
      "    Fix: in Vercel open this project → Storage → Create Database → Neon (Postgres),\n" +
      "    connect it to the project for Production and Preview, then redeploy.\n" +
      "    That sets DATABASE_URL and DATABASE_URL_UNPOOLED for you.\n" +
      `    Database-related variables this build can see: ${databaseLikeEnvNames().join(", ") || "none"}.\n` +
      `    (This is a ${process.env.VERCEL_ENV ?? "local"} build; the database must be connected for that environment.)`,
  );
} else if (!/^postgres(ql)?:\/\//.test(dbUrl)) {
  errors.push("DATABASE_URL doesn't look like a Postgres URL (it should start with postgresql://).");
} else if (dbSource) {
  console.log(`[preflight] Using ${dbSource} as the database URL.`);
}

const authSecret = process.env.AUTH_SECRET;
if (!authSecret || authSecret.length < 32) {
  errors.push(
    `AUTH_SECRET is ${authSecret ? `only ${authSecret.length} characters` : "not set"}. It needs at least 32 characters, and it signs login sessions.\n` +
      "    Fix: Settings → Environment Variables → add AUTH_SECRET with a long random value\n" +
      "    (for example the output of `openssl rand -base64 48`), then redeploy.",
  );
}

if (!process.env.ALLOWED_ORIGINS?.trim()) {
  warnings.push(
    "ALLOWED_ORIGINS is not set, so the mobile app and internet banking can't sign in or make payments yet.\n" +
      "    Set it to your frontend URLs, comma-separated, e.g.\n" +
      "    https://citizen-bank-app.vercel.app,https://citizen-internet-banking.vercel.app",
  );
} else {
  for (const o of process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!/^https?:\/\/[^/]+$/.test(o)) {
      warnings.push(`ALLOWED_ORIGINS entry "${o}" should be an origin only, like https://example.vercel.app (no path or trailing slash).`);
    }
  }
}

if (!process.env.CRON_SECRET) {
  warnings.push("CRON_SECRET is not set, so the daily scheduled-payments job will be refused. Add any long random string.");
}
const aiSource = resolveAnthropicEnv();
if (aiSource) console.log(`[preflight] Using ${aiSource} as the Anthropic API key.`);
if (!process.env.ANTHROPIC_API_KEY) {
  warnings.push(
    "ANTHROPIC_API_KEY is not set. Citizen AI will fall back to simple keyword matching.\n" +
      `    Key-like variables this ${process.env.VERCEL_ENV ?? "local"} build can see: ${anthropicLikeEnvNames().join(", ") || "none"}.`,
  );
} else if (!process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-")) {
  warnings.push("ANTHROPIC_API_KEY doesn't start with sk-ant-, so it may not be an Anthropic API key. Check you pasted the whole key.");
}
if (onVercel && (process.env.DEMO_PASSWORD ?? "Citizen2026!") === "Citizen2026!" && process.env.SEED_DEMO_DATA !== "false") {
  warnings.push("DEMO_PASSWORD is the published default. Set your own before sharing this deployment.");
}

for (const w of warnings) console.warn(`[preflight] warning: ${w}`);

if (errors.length) {
  const header = `[preflight] ${errors.length} setting${errors.length > 1 ? "s" : ""} must be fixed before Citizen Bank Core can run:`;
  const body = errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n");
  if (onVercel) {
    console.error(`\n${header}\n${body}\n`);
    process.exit(1);
  }
  console.warn(`\n${header}\n${body}\n(Not on Vercel, so continuing. The API won't work until these are set.)\n`);
} else {
  console.log("[preflight] Configuration looks good.");
}
