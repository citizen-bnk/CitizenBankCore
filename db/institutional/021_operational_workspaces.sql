CREATE TABLE hub_finding_history (
 finding_id uuid NOT NULL REFERENCES hub_review_findings(id), version integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES hub_people(id), snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(finding_id,version)
);
CREATE TABLE hub_operational_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scope text NOT NULL CHECK(scope IN('live','demonstration')),
 kind text NOT NULL CHECK(kind IN('risk','finance')), title text NOT NULL, summary text NOT NULL,
 facts jsonb NOT NULL DEFAULT '{}', evidence_link text, owner_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','review','closed')),
 version integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL, approved_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id) REFERENCES hub_people(id), FOREIGN KEY(updated_by) REFERENCES hub_people(id),
 FOREIGN KEY(approved_by) REFERENCES hub_people(id),
 CHECK(status<>'closed' OR (approved_by IS NOT NULL AND approved_by<>updated_by AND evidence_link IS NOT NULL))
);
CREATE INDEX hub_operational_scope_idx ON hub_operational_records(scope,kind,updated_at DESC);
CREATE TABLE hub_operational_history (
 record_id uuid NOT NULL REFERENCES hub_operational_records(id), version integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES hub_people(id), snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(record_id,version)
);
