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

```
 Phone ───> CitizenBankApp (Vercel) ────┐   /api/* rewrite (same-origin cookies)
 Browser ─> CitizenInternetBanking ─────┤
                                        ▼
                               Citizen Bank Core (Vercel) ──> Neon Postgres
                                        └──> Claude API · ElevenLabs (optional)
```

Both frontends proxy `/api/*` to Core, so the session cookie is always first-party and CORS isn't needed.

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

4. **Deploy.** Check `https://<core>.vercel.app/api/health`, which should report `{"ok":true,"db":"up"}`.
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

All endpoints except `auth/*`, `health` and `branches` need the `cb_session` cookie. Mutating payment endpoints accept an
`Idempotency-Key` header. Amounts are maloti, as numbers or strings (`"1,250.50"`).

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
