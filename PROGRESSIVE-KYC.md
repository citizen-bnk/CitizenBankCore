# Demo access and progressive KYC

New visitors can POST `/api/auth/explore` and enter a limited, empty-account experience immediately when `DEMO_MODE=true`. No account, card, welcome deposit, contact verification, or identity approval is created. Secure that temporary profile with a discoverable passkey from Setup & security before its session expires. Email/password registration remains available but creates only a profile.

Enrolled users log in via `/api/auth/passkey/options` and `/verify`, without entering a username. WebAuthn validates origin, RP ID, signature, counter, user handle, and required user verification. Each challenge expires after two minutes and is consumed atomically. Each app/web origin has its own enrollment; a passkey for one vercel.app hostname cannot authenticate on the other. Configure exact `AUTH_ALLOWED_ORIGINS` for any extra test origin.

Sessions expire after five minutes without API activity or eight hours absolutely, and logout revokes the server session. Existing JWTs without server-session records are invalidated once this release is used. Reauthentication for critical mutations is required after five minutes from login, regardless of ongoing API traffic. Reauthentication is bound to the same user; no failed action is automatically replayed.

## Illustrative demo policy

| Activity | Required reviewed evidence |
|---|---|
| Explore, read own data, loan estimates | None |
| Open demo accounts, internal transfers, ordinary payments, local beneficiaries | Contact and identity |
| Cards, scheduled payments | Contact, identity, address |
| Cross-border, or payments/schedules at or above the demo amount threshold | Contact, identity, address, source of funds |

`KYC_DEMO_ENHANCED_AMOUNT_CENTS` configures the illustrative escalation threshold; the default is 100000 cents (M1,000). Risk requirements live in the versioned `lib/kyc-policy.ts` module and can be changed and tested there. This is not a regulated bank policy. With `DEMO_MODE` other than the literal `true`, financial/product mutations fail closed. Card freeze/block and cancellation remain available for protection.

Checks run in banking services, including scheduled-payment execution. Destination beneficiary type is loaded server-side, so a cross-border recipient cannot downgrade itself by omitting a client risk flag. Requests blocked for KYC return `KYC_REQUIRED` with missing evidence and the applied policy version; app/web show an in-place panel. The original flow remains open and requires a new explicit confirmation after approval.

## Review

Customers can submit only declared fields through `/api/kyc`. They cannot set verified evidence, roles, expiry or risk. Changing a relevant declared field invalidates its prior evidence. Verified evidence expires after a year in this demo policy.

Existing users with database roles BACK_OFFICE or SUPER_ADMIN see the demo review queue in Setup & security. `/api/kyc/review` checks current database roles, requires recent authentication for decisions, rejects self-review and stale submissions, records an evidence reference and audit event, and labels results demo-only. No user is silently promoted to reviewer. An authorised operator must assign that role to a separate, existing demo user.

Contact delivery, document capture, external identity verification, sanctions/PEP screening and production recovery providers are **not integrated** in this release. Manual demo review is the explicit substitute. Do not upload real identity documents or treat a submitted form as verified KYC. Production policy/provider integration and device testing are required before real banking activation.

## Validation

- `npm test`: policy boundaries, missing evidence, cryptographic passkey checks, provider failover.
- `npm run typecheck` and `npm run build`.
- CI starts isolated PostgreSQL, applies migrations, and runs `npm run test:integration` to test actual service enforcement, expired evidence, changed contact details, and real-money blocking.
- Browser tests check entry, empty-account rendering, only requested fields, and pending-review messaging using synthetic API responses; they do not establish provider verification.

The additive migration is `0001_progressive_kyc.sql`. No existing customers are grandfathered as verified, and no existing accounts or balances are changed by the migration.
