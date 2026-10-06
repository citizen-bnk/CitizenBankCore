# Citizen Bank Core

The backend for the Citizen Bank **mobile app** ([CitizenBankApp](https://github.com/citizen-bnk/CitizenBankApp)) and
**internet banking** ([CitizenInternetBanking](https://github.com/citizen-bnk/CitizenInternetBanking)).

- **Postgres** (Neon on Vercel) with a **double-entry ledger**: every transaction writes balanced entries, balances are
  row-locked during posting, and retries are idempotent.
- **REST API** under `/api/*`: auth, accounts, transfers (own / Citizen / local banks / international), bills, airtime,
  beneficiaries, cards, scheduled payments, loans, statements, insights, notifications, and branches.
- **Citizen AI**: `/api/assistant` uses the Claude API with read-only tools. For anything that moves money, it proposes
  a pre-filled flow that the customer confirms in the app; the AI never executes payments itself.
- **Daily cron** that runs scheduled payments (06:00 Lesotho time).

> Citizen Digital Ltd (Reg. 99073) is the applicant for a Central Bank of Lesotho banking licence. It does not hold a
> licence or carry on banking business. This system is a pre-licensing demonstration: balances and payments are
> simulated in its own ledger, and nothing is connected to a payment network.

## Architecture

Conversation uses Anthropic first and automatically falls back to OpenAI's Responses API when Anthropic
is unconfigured, unreachable, rejects its credentials, rate limits a request, or returns unusable output.
Both providers use the same read-only banking tools. Payment and card requests return proposals that
the customer must review and confirm; neither provider can post transactions.

Speech uses ElevenLabs first and OpenAI speech second. If neither server provider works, the updated
frontends use browser speech. Replies identify the conversation provider; audio responses identify the
voice provider in `X-Voice-Provider`. Provider failures are logged without credentials or customer content.

Configure `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in Production and Preview. Optional model settings are
`ANTHROPIC_MODEL` (default `claude-sonnet-5`) and `OPENAI_MODEL` (default `gpt-5.4-mini`). Configure
`ELEVENLABS_API_KEY` and voice IDs `ELEVENLABS_VOICE_EN`, `_ST`, `_ZU` for primary speech. OpenAI defaults
to `OPENAI_TTS_MODEL=gpt-4o-mini-tts` and `OPENAI_TTS_VOICE=coral`. All keys remain on Core.

`/api/health` reports database health and provider configuration flags. Those flags indicate the presence
of configuration, not successful provider authentication. Verify connections with authenticated
`/api/assistant` and `/api/tts` requests after redeploying environment changes.

Run `npm test`, `npm run typecheck`, and `npm run build` before pushing. Provider tests exercise primary
success, failover, read-only tool loops, payment proposals, refusal handling, unavailable services and voice fallback.

```
 Phone ───> CitizenBankApp (Vercel) ────┐   /api/* rewrite (same-origin cookies)
 Browser ─> CitizenInternetBanking ─────┤
                                        ▼
                               Citizen Bank Core (Vercel) ──> Neon Postgres
                                        └──> Claude API · ElevenLabs (optional)
```

Both frontends proxy `/api/*` to Core, so the session cookie is always first-party and CORS isn't needed.

## Single sign-on from the website

People sign in on the Citizen Bank website and are handed to the banking apps with a short-lived signed token.
`POST /api/auth/sso {code}` verifies the token with the website's public keys (`PLATFORM_JWKS_URL`, issuer
`PLATFORM_ISSUER`), accepts each token once, creates the demo customer on a person's first visit (linked by
`users.person_id`, never by email) and starts the usual session cookie. It is switched off until both variables
are set, and in production the key URL must be https.

SSO users get the `CUSTOMER` role only, whatever roles the website lists, and a profile that exists with the same
email but is not linked is refused rather than adopted. In demo mode (`DEMO_MODE=true`) a new profile gets the same
demo deposit as registration. Run `npm test` for the tests; the database tests need `DATABASE_URL` on a migrated and
seeded database and skip themselves otherwise.

## Deploy on Vercel

1. **Import this repo** in Vercel (Add New → Project). Vercel detects Next.js, and `vercel.json` sets the build command to
   `npm run vercel-build`, which migrates the database, seeds reference and demo data, then builds.
2. **Add a database**: go to Project → Storage → Create → **Neon** (Postgres) and connect it to the project. This sets
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
3. **Set environment variables** (Project → Settings → Environment Variables):

   | Variable | Required | Notes |
   |---|---|---|
   | `AUTH_SECRET` | yes | 32+ random characters (`openssl rand -base64 48`). Signs session cookies. |
   | `CRON_SECRET` | yes | Random string; Vercel Cron sends it as a bearer token. |
   | `ALLOWED_ORIGINS` | yes | Comma-separated frontend origins, e.g. `https://citizen-bank-app.vercel.app,https://citizen-internet-banking.vercel.app` |
   | `ANTHROPIC_API_KEY` | for AI | Enables Citizen AI. Without it, the apps fall back to simple keyword intents. |
   | `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5`. |
   | `DEMO_MODE` | no | `true` gives new sign-ups a M5,000 demo deposit. |
   | `DEMO_PASSWORD` | no | Password for the seeded demo profiles (default `Citizen2026!`; **change it**). |
   | `SEED_DEMO_DATA` | no | `false` skips creating demo customers. |
   | `ALLOW_REGISTRATION` | no | `false` closes self-registration. |
   | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_EN/ST/ZU` | no | Real voices for Citizen AI; otherwise the app animates a simulated voice. |
   | `FX_RATES_JSON` | no | Override indicative FX rates, e.g. `{"USD":0.055}` (units per 1 LSL). |
   | `FEE_LOCAL_TRANSFER_CENTS`, `FEE_INTL_PERCENT`, `FEE_INTL_MIN_CENTS`, `DAILY_TRANSFER_LIMIT_CENTS` | no | Tariff settings. |

4. **Deploy.** The build starts with a preflight check (`db/preflight.ts`). If a required setting is missing, the build
   stops with a list of what to set and where. Once it's live, check `https://<core>.vercel.app/api/health`, which should
   report `{"ok":true,"db":"up"}`.
5. Set `CORE_API_URL` in the two frontend projects to this deployment's URL, then redeploy them.

Demo profiles: `palesa@demo.citizenbank.co.ls` and `thabo@demo.citizenbank.co.ls` (password = `DEMO_PASSWORD`).

## Local development

```bash
cp .env.example .env         # point DATABASE_URL at a local Postgres
npm install
npm run db:migrate && npm run db:seed
npm run dev -- -p 4000
```

Change the schema in `db/schema.ts`, then run `npm run db:generate` to create a migration in `drizzle/`.

## API overview

All endpoints except `auth/*`, `health` and `branches` need the `cb_session` cookie. Amounts are maloti, as numbers or
strings (`"1,250.50"`).

Payment endpoints (`transfers/internal`, `payments/*`) accept an `Idempotency-Key` header: 8–80 characters of letters,
digits, `:`, `_` or `-`. Resending a request with the same key returns the original result without paying twice, even
when the retries arrive at the same time. A malformed key gets `400 BAD_IDEMPOTENCY_KEY`. A key reused for a different
payment, or by a different customer, gets `409 IDEMPOTENCY_CONFLICT`.

| Method & path | Purpose |
|---|---|
| `POST /api/auth/register` · `login` · `logout` | Sessions (bcrypt + signed JWT cookie, lockout after 5 failed attempts) |
| `GET/PATCH /api/me` | Everything the home screens need; update language/theme/phone |
| `GET /api/transactions?accountId&from&to&limit` | Ledger entries |
| `POST /api/transfers/internal` | Between own accounts |
| `POST /api/payments/beneficiary` | To a saved beneficiary (Citizen, local bank, or international) |
| `POST /api/payments/cross-border` | New international recipient + payment |
| `POST /api/payments/bill` · `/airtime` | Billers and mobile networks |
| `GET/POST /api/beneficiaries` · `DELETE /api/beneficiaries/:id` | Payees |
| `POST /api/cards` · `POST /api/cards/:id/status` · `PATCH /api/cards/:id/limits` | Order, freeze/unfreeze/block, limits |
| `GET/POST /api/scheduled` · `DELETE /api/scheduled/:id` | Scheduled and recurring payments |
| `GET /api/loans` · `GET /api/loans/quote` | Loans and calculator |
| `GET /api/statements/:accountId?from&to` | Statement data |
| `GET /api/insights` | Spending by category |
| `GET/POST /api/notifications` | List and mark read |
| `POST /api/assistant` | Citizen AI |
| `POST /api/tts` | ElevenLabs proxy |
| `GET /api/cron/scheduled-payments` | Vercel Cron (bearer `CRON_SECRET`) |

## Security notes

- Row-level ownership checks in every service function; client-supplied IDs are never trusted.
- Accounts are locked with `SELECT … FOR UPDATE`, and customer accounts can never go negative.
- CSRF: SameSite=Lax cookies plus an Origin allow-list on state-changing requests.
- Rate limiting on the assistant is per-instance; add Upstash/Redis for a global limit before a public launch.
- Before any real-money use: a core-banking and payment-switch integration, KYC, audit logging, penetration testing and
  CBL approval are all required.
