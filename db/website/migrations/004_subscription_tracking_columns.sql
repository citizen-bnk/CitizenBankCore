-- Columns the website's investor screens read from share_subscriptions but the first reconstruction (001) lacked.
-- Without them GET /api/subscriptions/core/my-public-subscriptions fails with a 500 for every account, so an
-- investor cannot see their own subscriptions. Additive and safe to run on a database that already has them.
ALTER TABLE share_subscriptions
  ADD COLUMN IF NOT EXISTS installment_plan text,
  ADD COLUMN IF NOT EXISTS payment_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS certificate_issued_date timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_user_id text;
