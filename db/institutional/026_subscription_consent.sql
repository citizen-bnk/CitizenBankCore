-- Preserve historical consent timestamps. Administrator capture is separately
-- flagged and does not constitute acceptance by the subscriber.
ALTER TABLE hub_subscription_requests ADD COLUMN investor_consent_pending boolean NOT NULL DEFAULT false;
ALTER TABLE hub_subscription_requests ADD COLUMN bonus_terms_updated_by uuid REFERENCES hub_people(id);
