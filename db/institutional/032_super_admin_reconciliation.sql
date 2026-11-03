-- Keep ordinary independent review controls, permitting explicit super-admin reconciliation.
ALTER TABLE hub_corporate_records DROP CONSTRAINT hub_corporate_records_check;
ALTER TABLE hub_corporate_records ADD CONSTRAINT hub_corporate_records_check CHECK(
 status<>'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND
 (confirmed_by IS DISTINCT FROM updated_by OR
  kind IN('holding','stakeholder') AND facts->>'reconciliation_authority'='super_admin'))
);
