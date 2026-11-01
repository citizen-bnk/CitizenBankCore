-- Read-only check after 001_foundation.sql. Select citizen_canonical_production first.
SELECT
  current_database() AS database_name,
  (SELECT count(*)::int FROM pg_namespace
   WHERE nspname IN ('platform', 'corporate', 'licensing', 'documents')) AS canonical_schemas,
  (SELECT count(*)::int FROM information_schema.tables
   WHERE table_type = 'BASE TABLE'
     AND table_schema IN ('platform', 'corporate', 'licensing', 'documents')) AS canonical_tables,
  (SELECT count(*)::int FROM pg_views
   WHERE schemaname = 'corporate' AND viewname = 'confirmed_holdings') AS holdings_views,
  (SELECT count(*)::int FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname = 'corporate'
     AND t.tgname IN ('confirmed_share_event_balanced',
                      'confirmed_share_entry_balanced',
                      'protect_confirmed_share_events',
                      'protect_confirmed_share_entries')) AS share_guards,
  (SELECT count(*)::int FROM platform.legal_entities
   WHERE legal_name = 'Citizen Digital Ltd'
     AND registration_number = '99073'
     AND applicant_status = 'intended_applicant') AS intended_applicants,
  (SELECT count(*)::int FROM platform.source_records) AS imported_source_records,
  (SELECT count(*)::int FROM corporate.share_events) AS share_events;

-- Expected before import: citizen_canonical_production, 4, 21, 1, 4, 1, 0, 0.
