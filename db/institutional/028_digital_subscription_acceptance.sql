ALTER TABLE hub_subscription_requests ADD COLUMN IF NOT EXISTS digital_accepted_at timestamptz;
ALTER TABLE hub_subscription_requests ADD COLUMN IF NOT EXISTS digital_accepted_by uuid REFERENCES hub_people(id);
ALTER TABLE hub_subscription_requests ADD COLUMN IF NOT EXISTS digital_acceptance_note text;
