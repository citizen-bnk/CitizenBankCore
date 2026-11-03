ALTER TABLE hub_subscription_requests ADD COLUMN bonus_offering_kind text NOT NULL DEFAULT 'company' CHECK(bonus_offering_kind IN('company','person'));
ALTER TABLE hub_subscription_requests ADD COLUMN bonus_offering_person_id uuid REFERENCES hub_people(id);
ALTER TABLE hub_subscription_requests ADD COLUMN bonus_source_record_id uuid REFERENCES hub_corporate_records(id);
ALTER TABLE hub_subscription_requests ADD COLUMN bonus_agreement_document_id uuid REFERENCES hub_documents(id);
ALTER TABLE hub_subscription_requests ADD COLUMN source_form_id uuid UNIQUE REFERENCES hub_form_submissions(id);
ALTER TABLE hub_subscription_requests ADD CONSTRAINT bonus_personal_source CHECK(bonus_offering_kind<>'person' OR bonus_offering_person_id IS NOT NULL AND bonus_source_record_id IS NOT NULL);
