-- Fresh institutional system of record. Apply before activating the replacement Hub.
CREATE TABLE hub_people (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_subject text NOT NULL,
 email text NOT NULL, display_name text NOT NULL, phone text, country text, occupation text, bio text,
 account_key text, scope text NOT NULL CHECK(scope IN ('live','demonstration')),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 preferences jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_subject,scope), UNIQUE(email,scope)
);
CREATE TABLE hub_memberships (
 person_id uuid NOT NULL REFERENCES hub_people(id), role text NOT NULL CHECK(role IN ('customer','investor','shareholder','board_member','staff','back_office','admin','super_admin')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(person_id,role)
);
CREATE TABLE hub_sessions (
 token_hash text PRIMARY KEY, person_id uuid NOT NULL REFERENCES hub_people(id), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_sessions_person_idx ON hub_sessions(person_id);
CREATE TABLE hub_auth_attempts (bucket text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX hub_auth_attempts_bucket_idx ON hub_auth_attempts(bucket,created_at);
CREATE TABLE hub_meetings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL, location text NOT NULL, meeting_link text, committee text NOT NULL DEFAULT 'Board',
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
 agenda jsonb NOT NULL DEFAULT '[]', created_by uuid NOT NULL REFERENCES hub_people(id),
 scope text NOT NULL CHECK(scope IN ('live','demonstration')), created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at)
);
CREATE INDEX hub_meetings_scope_date_idx ON hub_meetings(scope,starts_at);
CREATE TABLE hub_meeting_responses (
 meeting_id uuid NOT NULL REFERENCES hub_meetings(id), person_id uuid NOT NULL REFERENCES hub_people(id),
 response text NOT NULL CHECK(response IN ('accepted','declined','tentative')), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(meeting_id,person_id)
);
CREATE TABLE hub_resolutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','approved','rejected','closed')),
 closes_at timestamptz NOT NULL, created_by uuid NOT NULL REFERENCES hub_people(id),
 scope text NOT NULL CHECK(scope IN ('live','demonstration')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hub_votes (
 resolution_id uuid NOT NULL REFERENCES hub_resolutions(id), person_id uuid NOT NULL REFERENCES hub_people(id),
 choice text NOT NULL CHECK(choice IN ('for','against','abstain')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(resolution_id,person_id)
);
CREATE TABLE hub_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES hub_people(id), title text NOT NULL,
 due_at timestamptz, priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('high','normal','low')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','cancelled')), module text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('live','demonstration')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_tasks_owner_scope_idx ON hub_tasks(owner_id,scope,status);
CREATE TABLE hub_investments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES hub_people(id),
 instrument text NOT NULL, shares integer NOT NULL CHECK(shares>=0), amount numeric(18,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL DEFAULT 'LSL', status text NOT NULL CHECK(status IN ('pending','committed','received','issued','cancelled')),
 scope text NOT NULL CHECK(scope IN ('live','demonstration')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_investments_owner_scope_idx ON hub_investments(person_id,scope);
CREATE TABLE hub_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES hub_people(id), name text NOT NULL,
 drive_file_id text NOT NULL, shared_link text NOT NULL CHECK(shared_link ~ '^https://(drive|docs)\.google\.com/'),
 category text NOT NULL, version integer NOT NULL DEFAULT 1, classification text NOT NULL DEFAULT 'confidential',
 allowed_roles text[] NOT NULL DEFAULT '{}', scope text NOT NULL CHECK(scope IN ('live','demonstration')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_documents_scope_owner_idx ON hub_documents(scope,owner_id);
CREATE TABLE hub_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES hub_people(id),
 title text NOT NULL, body text NOT NULL, path text NOT NULL, read_at timestamptz,
 scope text NOT NULL CHECK(scope IN ('live','demonstration')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_notifications_owner_idx ON hub_notifications(person_id,created_at DESC);
CREATE TABLE hub_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES hub_people(id),
 action text NOT NULL, resource_type text NOT NULL, resource_id text, scope text NOT NULL CHECK(scope IN ('live','demonstration')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hub_settings (key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO hub_settings(key,value) VALUES ('business_stage','"pre_licensing"'),('capital_target','25000000');
