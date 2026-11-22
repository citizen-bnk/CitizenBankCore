ALTER TABLE hub_document_operations ADD COLUMN processing_token uuid;
ALTER TABLE hub_document_operations ADD COLUMN processing_at timestamptz;
ALTER TABLE hub_documents ADD COLUMN signed_link text;
ALTER TABLE hub_documents ADD COLUMN signed_digest text;
ALTER TABLE hub_documents ADD COLUMN signed_file_id text;
CREATE UNIQUE INDEX hub_generated_document_once ON hub_documents(scope,state) WHERE state LIKE 'draft:%';
CREATE UNIQUE INDEX hub_active_signature_asset ON hub_signature_assets(owner_id,scope) WHERE revoked_at IS NULL;
ALTER TABLE hub_messages ADD COLUMN document_link text;
ALTER TABLE hub_messages ADD COLUMN document_version integer;

ALTER TABLE hub_message_recipients ADD COLUMN provider_event_at timestamptz;
CREATE TABLE hub_document_action_limits (
 person_id uuid NOT NULL REFERENCES hub_people(id), action text NOT NULL,
 window_at timestamptz NOT NULL, attempts integer NOT NULL,
 PRIMARY KEY(person_id,action)
);
