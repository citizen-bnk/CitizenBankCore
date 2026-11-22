ALTER TABLE hub_subscription_requests ADD COLUMN super_admin_approved_at timestamptz;
ALTER TABLE hub_subscription_requests ADD COLUMN super_admin_approved_by uuid REFERENCES hub_people(id);
ALTER TABLE hub_subscription_requests DROP CONSTRAINT subscription_received_evidence;
ALTER TABLE hub_subscription_requests ADD CONSTRAINT subscription_received_evidence CHECK(
 status NOT IN('received','pending_conversion') OR
 (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND
  (super_admin_approved_at IS NOT NULL AND super_admin_approved_by IS NOT NULL OR
   digital_accepted_at IS NOT NULL AND digital_accepted_by IS NOT NULL OR
   agreement_link IS NOT NULL AND payment_link IS NOT NULL))
);
