# Citizen Digital Ltd: canonical data rebuild

Status (1 November 2026): the canonical foundation SQL has been submitted to a new, isolated production-target database. **No application has been switched to it and no source data has been imported.** Post-migration verification and cutover remain pending.

## Applicant and evidence basis

Citizen Digital Ltd, Lesotho company registration **99073**, is the intended banking-licence applicant. The signed/draft applicant-designation material in `09 REGULATORY & BANKING LICENCE/02 CBL CORRESPONDENCE & ENTITY DESIGNATION` distinguishes Citizen Pay as promoter/sponsor from Citizen Digital Ltd as applicant. It does not establish that a banking licence has been granted.

The September 2026 v2 working application pack is the most coherent reference set found in the local Drive folder. Its compliance matrix maps 40 requirements to 44 pack documents, but explicitly says coverage is not completeness. The accompanying `00-4a_Placeholder_Tracker.xlsx` contains **1,117 open items**, including **729 Priority A** items before lodgement and **388 Priority B** items before licence/commencement. These are source-document claims and tracker counts, not CBL decisions. Earlier plans listing 10 October 2026 as a target are historical, not a confirmed submission date.

The scanned CBL letter dated **10 June 2025** responds to Citizen Pay's expression of interest and the preliminary conference of 3 June 2025. It explains application requirements and the investigation fee. It is **not** an acceptance of a completed licence application or a grant of a licence. Its issuer and date should be recorded as regulatory correspondence, with the applicant identity kept distinct from the later Citizen Digital designation.

The tracker has been converted to a private 1,117-record JSONL snapshot at `deployment-private/cbl-tracker-2026-09-canonical.jsonl`. Each item retains its pack document, section, owner, status and content digest. The repeatable converter is `db/canonical/prepare_licence_tracker.py`; neither the confidential snapshot nor the underlying Drive documents are committed to Git.

The pack's shareholding document `02-2_Shareholding_Structure_and_Cap_Table.pdf` lists 90,445,300 issued ordinary shares and 20 members but labels its register **uncertified** and lists eight reconciliation tasks. Its pending SAFE conversions and unpaid subscriptions must not be added to issued shares. Do not infer paid-up regulatory capital from subscribed amounts, certificates or a planning target.

The eight register tasks concern a holding vehicle's legal identity and transfer evidence, a duplicated identity number, unpaid consideration, a nominee transfer, founder-funded gift instruments and tax treatment, missing subscription/identity evidence, legal review of historical issue prices, and returns of allotment. The new ledger must present these as unresolved issues until the Company Secretary verifies them against source records.

## Current data landscape

| System | Existing production/demo data domain | Migration treatment |
|---|---|
| Website Postgres | Profile, role, investment subscription/payment/certificate and board tables; an existing `platform.person` / `platform.identity_mapping` / `platform.membership` foundation | Snapshot and reconcile; cease independent corporate writes after cutover. A later unpooled read found 7 profiles, 3 subscriptions, 0 certificates and 2 board rows. A verified custom-format archive is stored privately as `website-before-canonical-migration-2026-10-29.dump`. The existing platform identities must be mapped, not recreated as new people. |
| Hub Postgres | Hub people, corporate records, investments, appointments, licensing readiness and document controls | Snapshot and reconcile; replace ad hoc corporate writes with the canonical API. Current schema has no tracked SQL migrations in the fetched Hub branch. |
| Core Postgres | Banking users, KYC, accounts, cards and double-entry ledger | Preserve ledger and account history; map users to canonical people. Do not discard or silently import ledger entries as capital evidence. A verified custom-format archive is stored privately as `core-before-canonical-migration-2026-10-29.dump`. |
| Google Form and Drive | Historical subscriptions and evidence | Import as source records with version/hash and review status; never treat an email address alone as a verified person match. |

The website and Core databases currently resolve to different Neon endpoints. The website pooled connection was intermittently unavailable; its unpooled endpoint answered a limited count query and completed a backup. The Hub connection is configured in Vercel, but its credential was not retrieved. Therefore no existing production database has been deleted, truncated or replaced. Archive integrity has been checked by reading each archive's table of contents; a full restoration rehearsal remains outstanding.

### Neon resource inventory (1 November 2026)

Read-only queries through the saved website and Core connections confirmed two distinct Neon projects:

| Connection | Database | Application tables | Treatment |
|---|---|---:|---|
| Core | `citizen_core_business` | 21 | Existing banking source; preserve and reconcile |
| Core | `neondb` | 21 | Populated default database; not a migration target |
| Website | `citizen_platform_business` | 64 | Existing platform source; preserve and reconcile |
| Website | `neondb` | 23 | Populated default database; not a migration target |

Both projects also have a `postgres` maintenance database with three non-system tables. Neither has a verified empty application database. The Hub Vercel project has a protected `DATABASE_URL`, but Vercel does not expose its value through the available connection and lists no attached database connector. The Hub Neon project and database still require dashboard identification or a secure connection before export. Provision a **dedicated, empty canonical production database** and a separate demo target; do not repurpose either populated `neondb` database. These counts identify resources only and are not a data-reconciliation result.

On 1 November 2026, at the user's direction, `citizen_canonical_production` was created on the `main` branch of the **original Core** Neon project `neon-citizen-bnk-core` (`damp-term-89130008`, AWS US East 1). The existing `neondb` was left untouched. A read-only preflight returned zero application tables in the new database. The SQL Editor then ran the 45 statements in `db/canonical/001_foundation.sql`, including its transaction and applicant seed; the UI reported `Connected (45 queries)` with no error shown. Browser control was disabled before the independent post-migration count and applicant-row query completed, so their results are **unverified**. Run the read-only `db/canonical/verify_foundation.sql` against the new database before importing any source data. The new database has not been connected to Vercel projects. This project is in a different region from the website and demo Core Neon projects, which needs latency and operational review before cutover.

## Target contract

Use **one canonical Postgres database per environment**. Production and demonstration remain separate databases or isolated Neon branches. The new database has `platform`, `corporate`, `licensing` and `documents` schemas, plus Core banking tables after a controlled ledger migration. The additive foundation is in `db/canonical/001_foundation.sql`.

Each domain has one write owner: Hub writes corporate and licensing records; Core writes banking and KYC; identity provisioning writes platform people and verified external identities. The website reads approved public summaries and routes users to the proper subsystem. Other apps call authenticated APIs; they do not independently write copies of a cap table or share register. Service credentials should have schema-scoped permissions.

The canonical person ID is stable across roles. External logins, Hub users, Core users and legacy website users map to it by verified provider subject or reviewed match. Shared family/business emails are contacts, not automatic identity matches. A corporate holder may be a person or a legal entity; a legal entity's beneficial owners are recorded separately.

Confirmed share holdings are derived from dated share events. Legacy rows enter as `pending_reconciliation`; only a reviewed and authorised event changes the legal register. SAFE subscriptions remain contractual investments until the conversion event is recorded. Document records hold storage references, hashes, versions and access classes; file bytes remain in approved private file storage.

Beneficial interests attach the underlying natural person and control basis to each legal holder. Shareholder agreements are separate from SAFE instruments, with versioned documents, parties and signature states. A licensing submission snapshot pins the exact document versions included in the pack.

## Safe migration sequence

1. Obtain read-only snapshots and verified restore tests for **all three** existing databases. Archive source files and capture row counts, schema fingerprints and source timestamps. Website and Core archives now exist; the Hub archive and restoration rehearsals remain outstanding.
2. Verify the newly created `citizen_canonical_production` database and its foundation schema, then provision a separate demonstration database or branch. Attach the applicant designation source document to the seeded entity record; the legal-name seed alone does not establish documentary provenance.
3. Import website, Hub, Core and Form identities into `platform.source_records`. Match by verified account subject first; queue name/email ambiguities for human review. Preserve old IDs in `platform.external_identities`.
4. Import the September cap table as **pending** share events and subscriptions. Resolve the eight stated register discrepancies and tie totals to the statutory register, signed instruments and bank evidence before confirmation. Validate no negative holdings, no share-class overissue and no SAFE units counted as issued shares.
5. Import board nominations and appointments with separate company and regulatory statuses. Import the v2 compliance matrix and all 1,117 tracker items as licensing requirements; preserve the document/version lineage and open status.
6. Migrate banking users, accounts, transactions and ledger only with an exact row-count and balance reconciliation. Do not modify account balances directly. Keep production/demo data separated and pre-licensing banking controls in force.
7. Run APIs against the new database in shadow/read-only mode, compare per-person portfolios, share totals, board register, licence checklist, account balances and API responses. Record all mismatches and resolve them before enabling writes.
8. Freeze old corporate writes briefly, replay final changes, switch service connections atomically, and monitor. Retain old databases read-only for a defined rollback period. Delete duplicate databases only after restoration, parity, audit and rollback checks pass.

## Release gates

- Every source database has a verified backup and restore rehearsal.
- Every live identity is matched or explicitly quarantined; no shared email merges people automatically.
- Statutory share register, SAFE ledger, certificates and capital evidence reconcile; uncertified holdings are not presented as confirmed.
- Board appointments distinguish proposed, company-approved, regulatory-pending and effective states.
- All 729 Priority A licence gaps have an owner and evidence; a submitted/verified system status cannot be mistaken for CBL approval.
- Banking ledger totals, transaction references and account balances match exactly before/after migration.
- Website, Hub, Internet Banking and mobile app read the same person identity and domain records through their APIs.
