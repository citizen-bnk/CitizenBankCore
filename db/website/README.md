# Website database migrations

CitizenBankCore owns reproducible migrations for the website/Hub database as well as the banking ledger database.
The two isolated demo databases have separate connection strings. Website tables are never migrated into the ledger by accident.

Run `DEMO_MODE=true WEBSITE_DATABASE_URL=<unpooled demo connection> npm run db:website:migrate` with credentials supplied through a secret environment file.
The runner requires an empty destination on its first run, uses a transaction and advisory lock, and verifies hashes on subsequent runs.
It does not run automatically during the Core Vercel build. Never edit an applied SQL file; add the next numbered migration.

The initial foundation supports unified identity, roles, demo subscriptions and board membership. Platform migrations originate in CitizenBankWebsite and are maintained here for deployment.
Additional website modules still require SQL contracts, migrations and end-to-end verification before their features can be described as working.
Reference share prices and capacities are fictional demo data. No production records or production business pricing are imported.
