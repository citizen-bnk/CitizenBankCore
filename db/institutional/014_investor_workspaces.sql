CREATE TABLE hub_recipient_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scope text NOT NULL CHECK(scope IN('live','demonstration')),
 name text NOT NULL, version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES hub_people(id),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,scope), UNIQUE(scope,name)
);
CREATE TABLE hub_group_members (
 group_id uuid NOT NULL, person_id uuid NOT NULL REFERENCES hub_people(id),scope text NOT NULL,
 PRIMARY KEY(group_id,person_id), FOREIGN KEY(group_id,scope) REFERENCES hub_recipient_groups(id,scope)
);
CREATE TABLE hub_document_grants (
 document_id uuid NOT NULL REFERENCES hub_documents(id),person_id uuid NOT NULL REFERENCES hub_people(id),
 scope text NOT NULL, granted_by uuid NOT NULL REFERENCES hub_people(id),
 drive_permission_id text, drive_access text NOT NULL DEFAULT 'pending' CHECK(drive_access IN('pending','verified')),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,person_id)
);
CREATE TABLE hub_document_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope text NOT NULL CHECK(scope IN('live','demonstration')),
 kind text NOT NULL CHECK(kind IN('safe','certificate')),name text NOT NULL,shared_link text NOT NULL,
 drive_file_id text NOT NULL,approved_digest text,approved_by uuid REFERENCES hub_people(id),approved_at timestamptz,
 version integer NOT NULL DEFAULT 1, UNIQUE(scope,kind)
);
ALTER TABLE hub_documents ADD COLUMN IF NOT EXISTS content_digest text;
ALTER TABLE hub_documents ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'linked';
ALTER TABLE hub_documents ADD COLUMN IF NOT EXISTS record_id uuid REFERENCES hub_corporate_records(id);
ALTER TABLE hub_documents ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES hub_subscription_requests(id);
ALTER TABLE hub_documents ADD COLUMN IF NOT EXISTS signature_layout jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE hub_documents ADD COLUMN IF NOT EXISTS record_version integer;
ALTER TABLE hub_documents ADD COLUMN IF NOT EXISTS template_digest text;
CREATE TABLE hub_document_operations (
 id uuid PRIMARY KEY,scope text NOT NULL,actor_id uuid NOT NULL REFERENCES hub_people(id),input_digest text NOT NULL,
 document_id uuid REFERENCES hub_documents(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hub_certificate_references (
 scope text NOT NULL,reference text NOT NULL,operation_id uuid NOT NULL REFERENCES hub_document_operations(id),
 PRIMARY KEY(scope,reference),UNIQUE(operation_id)
);
CREATE TABLE hub_signature_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES hub_people(id),scope text NOT NULL,
 drive_file_id text NOT NULL,shared_link text NOT NULL,content_digest text NOT NULL,version integer NOT NULL DEFAULT 1,
 revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,scope)
);
CREATE TABLE hub_signing_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES hub_documents(id),scope text NOT NULL,
 document_version integer NOT NULL,document_digest text NOT NULL,requested_by uuid NOT NULL REFERENCES hub_people(id),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','processing','completed','cancelled')),
 signed_link text,signed_digest text,operation_id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),version integer NOT NULL DEFAULT 1,
 failure_code text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,UNIQUE(id,scope)
);
ALTER TABLE hub_signing_requests ADD COLUMN processing_at timestamptz;
ALTER TABLE hub_signing_requests ADD COLUMN processing_token uuid;
CREATE UNIQUE INDEX hub_signing_version_once ON hub_signing_requests(document_id,document_version) WHERE status IN('requested','processing','completed');
CREATE TABLE hub_signing_parties (
 request_id uuid NOT NULL,person_id uuid NOT NULL REFERENCES hub_people(id),scope text NOT NULL,capacity text NOT NULL,
 signature_asset_id uuid REFERENCES hub_signature_assets(id),signature_digest text,typed_name text,consent_text text,
 authorised_at timestamptz,PRIMARY KEY(request_id,person_id),FOREIGN KEY(request_id,scope) REFERENCES hub_signing_requests(id,scope)
);
CREATE TABLE hub_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope text NOT NULL CHECK(scope IN('live','demonstration')),
 subject text NOT NULL,body text NOT NULL,kind text NOT NULL CHECK(kind IN('newsletter','contract','update')),
 document_id uuid REFERENCES hub_documents(id),created_by uuid NOT NULL REFERENCES hub_people(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published')),version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,UNIQUE(id,scope)
);
CREATE TABLE hub_message_recipients (
 message_id uuid NOT NULL,person_id uuid NOT NULL REFERENCES hub_people(id),scope text NOT NULL,email text NOT NULL,
 email_status text NOT NULL DEFAULT 'not_sent' CHECK(email_status IN('not_sent','accepted','delivered','bounced','failed','unknown','skipped')),
 provider_id text,email_started_at timestamptz,last_error text,PRIMARY KEY(message_id,person_id),
 FOREIGN KEY(message_id,scope) REFERENCES hub_messages(id,scope)
);
CREATE TABLE hub_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope text NOT NULL CHECK(scope IN('live','demonstration')),
 title text NOT NULL,summary text NOT NULL,status text NOT NULL CHECK(status IN('planned','in_progress','on_hold','completed')),
 allowed_roles text[] NOT NULL DEFAULT '{}',published boolean NOT NULL DEFAULT false,source_link text,
 version integer NOT NULL DEFAULT 1,updated_by uuid NOT NULL REFERENCES hub_people(id),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,scope)
);
CREATE TABLE hub_milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL,scope text NOT NULL,title text NOT NULL,
 target_date date,status text NOT NULL CHECK(status IN('planned','in_progress','on_hold','completed')),
 evidence_link text,version integer NOT NULL DEFAULT 1,updated_by uuid NOT NULL REFERENCES hub_people(id),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,scope) REFERENCES hub_projects(id,scope)
);
CREATE TABLE hub_project_history (
 resource_id uuid NOT NULL,scope text NOT NULL,version integer NOT NULL,kind text NOT NULL,actor_id uuid NOT NULL REFERENCES hub_people(id),
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(resource_id,version)
);
INSERT INTO hub_document_templates(scope,kind,name,shared_link,drive_file_id)
 SELECT s,'safe','SAFE R10 — new subscriptions','https://drive.google.com/file/d/1LOoXZ2_WvENpz0icVY-5Gi2M40UHP3oJ/view','1LOoXZ2_WvENpz0icVY-5Gi2M40UHP3oJ' FROM unnest(ARRAY['live','demonstration']) s;
INSERT INTO hub_document_templates(scope,kind,name,shared_link,drive_file_id)
 SELECT s,'certificate','Citizen share certificate','https://drive.google.com/file/d/1K0ICAxD2MeuKqQ_f0INBbIWHj0pekMsQ/view','1K0ICAxD2MeuKqQ_f0INBbIWHj0pekMsQ' FROM unnest(ARRAY['live','demonstration']) s;
