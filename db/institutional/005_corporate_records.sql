CREATE TABLE hub_corporate_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL,
 kind text NOT NULL CHECK(kind IN('stakeholder','holding','appointment','vacancy')),
 title text NOT NULL,
 person_id uuid REFERENCES hub_people(id),
 facts jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'work_in_progress' CHECK(status IN('work_in_progress','conflict','confirmed','archived')),
 source_link text NOT NULL CHECK(source_link ~ '^https://(drive.google.com/file/d/|docs.google.com/(document|spreadsheets|presentation)/d/)'),
 source_date date,
 review_note text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1,
 updated_by uuid REFERENCES hub_people(id),
 confirmed_by uuid REFERENCES hub_people(id),
 confirmed_at timestamptz,
 scope text NOT NULL CHECK(scope IN('live','demonstration')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(scope,reference),
 CHECK(status<>'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by IS DISTINCT FROM updated_by))
);
CREATE TABLE hub_corporate_history (
 record_id uuid NOT NULL REFERENCES hub_corporate_records(id),
 version integer NOT NULL,
 actor_id uuid REFERENCES hub_people(id),
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(record_id,version)
);
CREATE TABLE hub_correction_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES hub_corporate_records(id),
 person_id uuid NOT NULL REFERENCES hub_people(id),
 record_version integer NOT NULL,
 proposed_facts jsonb NOT NULL,
 explanation text NOT NULL,
 source_link text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined')),
 resolved_by uuid REFERENCES hub_people(id),
 resolution_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
