ALTER TABLE hub_documents ADD COLUMN document_reference text;
ALTER TABLE hub_documents ADD COLUMN revision integer;
ALTER TABLE hub_documents ADD COLUMN supersedes_id uuid REFERENCES hub_documents(id);
CREATE UNIQUE INDEX hub_document_revision ON hub_documents(scope,document_reference,revision) WHERE document_reference IS NOT NULL;
ALTER TABLE hub_form_submissions ADD COLUMN subscription_id uuid REFERENCES hub_subscription_requests(id);
