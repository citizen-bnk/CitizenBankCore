ALTER TABLE hub_subscription_requests ADD COLUMN IF NOT EXISTS applicant_details jsonb NOT NULL DEFAULT '{}'::jsonb;
