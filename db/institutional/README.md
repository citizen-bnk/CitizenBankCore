# Institutional data

Citizen Hub owns the institutional API. This directory owns its versioned database schema, separately from the retained banking database and runtime.

Configure `INSTITUTIONAL_DATABASE_URL` securely and run `npx tsx db/institutional/migrate.ts` from Core. The runner rejects the banking connection, locks migration execution, validates installed checksums and applies each change transactionally. Never edit an applied migration; add a numbered SQL migration.

The initial schema supports scoped identities and roles, hashed revocable sessions, board meetings and responses, resolutions and votes, tasks, investment records, Google Drive references, notifications and atomic audit entries. The profile migration adds common contact fields and role compartments. Documents contain metadata and shared links only; no file bodies, blobs or storage bucket copies.

Fictional account provisioning must reuse the existing identity provider subjects and canonical banking person UUIDs. Memberships are explicit. Demonstration rows use `scope='demonstration'`; normal identities use `scope='live'`. Turning Hub's `DEMO_MODE` off blocks demonstration access. This schema addition does not change or reseed the retained banking database.
