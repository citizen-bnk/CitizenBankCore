ALTER TABLE hub_subscription_requests ADD COLUMN payment_authorisation_basis text CHECK(payment_authorisation_basis IN('settlement','deferred'));
ALTER TABLE hub_subscription_requests ADD COLUMN payment_authorised_by uuid REFERENCES hub_people(id);
ALTER TABLE hub_subscription_requests ADD COLUMN payment_authorised_at timestamptz;
ALTER TABLE hub_subscription_requests ADD COLUMN deferred_payment_motivation text;
ALTER TABLE hub_subscription_requests ADD COLUMN deferred_payment_due date;
