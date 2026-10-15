-- Operational records contain metadata and review decisions, never document binaries.
ALTER TABLE hub_memberships DROP CONSTRAINT hub_memberships_role_check;
ALTER TABLE hub_memberships ADD CONSTRAINT hub_memberships_role_check CHECK(role IN ('customer','investor','shareholder','board_member','staff','back_office','admin','super_admin','regulatory_reviewer'));
CREATE TABLE hub_readiness_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_key text NOT NULL, title text NOT NULL,
 drive_file_id text, shared_link text, source_date date NOT NULL, edition text NOT NULL,
 document_status text NOT NULL, classification text NOT NULL DEFAULT 'confidential',
 scope text NOT NULL CHECK(scope IN ('live','demonstration')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(scope,source_key), UNIQUE(id,scope),
 CHECK((drive_file_id IS NULL AND shared_link IS NULL) OR (drive_file_id IS NOT NULL AND shared_link ~ '^https://(drive|docs)\.google\.com/'))
);
CREATE TABLE hub_readiness_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL,
 source_number integer NOT NULL CHECK(source_number>0), doc_ref text NOT NULL, doc_title text NOT NULL,
 section text, item text NOT NULL, item_type text NOT NULL, priority text NOT NULL CHECK(priority IN ('A','B')),
 owner_role text NOT NULL, due_date date, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','submitted','verified')),
 replacement_value text NOT NULL DEFAULT '', evidence_link text, review_note text NOT NULL DEFAULT '',
 submitted_by uuid REFERENCES hub_people(id), verified_by uuid REFERENCES hub_people(id), verified_at timestamptz,
 version integer NOT NULL DEFAULT 1, scope text NOT NULL CHECK(scope IN ('live','demonstration')),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,source_number),
 FOREIGN KEY(source_id,scope) REFERENCES hub_readiness_sources(id,scope),
 CHECK(status!='verified' OR (verified_by IS NOT NULL AND submitted_by IS NOT NULL AND verified_by<>submitted_by AND verified_at IS NOT NULL AND evidence_link IS NOT NULL AND replacement_value<>''))
);
CREATE INDEX hub_readiness_items_filter_idx ON hub_readiness_items(scope,status,priority,doc_ref,source_number);
CREATE TABLE hub_readiness_history (
 item_id uuid NOT NULL REFERENCES hub_readiness_items(id), version integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES hub_people(id), record jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(item_id,version)
);
CREATE TABLE hub_review_grants (
 person_id uuid NOT NULL REFERENCES hub_people(id), source_id uuid NOT NULL,
 scope text NOT NULL CHECK(scope IN ('live','demonstration')), expires_at timestamptz NOT NULL,
 granted_by uuid NOT NULL REFERENCES hub_people(id), granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 drive_access_checked boolean NOT NULL CHECK(drive_access_checked), PRIMARY KEY(person_id,source_id),
 FOREIGN KEY(source_id,scope) REFERENCES hub_readiness_sources(id,scope)
);
CREATE TABLE hub_review_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid NOT NULL REFERENCES hub_people(id),
 system text NOT NULL CHECK(system IN ('website','hub','banking','app','core','evidence')),
 title text NOT NULL, details text NOT NULL, severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','triaged','fixed','retested')),
 resolution_note text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 scope text NOT NULL CHECK(scope IN ('live','demonstration')), created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_review_findings_scope_idx ON hub_review_findings(scope,created_at DESC);
