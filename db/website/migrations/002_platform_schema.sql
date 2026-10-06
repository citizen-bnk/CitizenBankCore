-- platform schema, step C of the Citizen Bank integration plan (docs/ARCHITECTURE.md).
--
-- One person record per human, the identity-provider subjects that map to it, and the
-- roles they hold. Idempotent: safe to run more than once. Nothing here changes or
-- deletes existing tables (user_profiles, roles, user_roles stay as they are until
-- the apps are switched over).
--
-- Design rules:
--   * People are never merged automatically (no unique constraint on email).
--   * One identity subject maps to exactly one person (UNIQUE provider, subject).
--   * Roles are a controlled vocabulary (platform.role_definition).
--   * Ambiguous or incomplete source data goes to migration_review for a human.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.role_definition (
    role        text PRIMARY KEY,
    description text NOT NULL,
    workspace   text NOT NULL CHECK (workspace IN ('member', 'back_office', 'banking'))
);

INSERT INTO platform.role_definition (role, description, workspace) VALUES
    ('customer',     'Demo banking customer (Internet Banking and the app)',  'banking'),
    ('investor',     'Holds an investment subscription or SAFE',              'member'),
    ('shareholder',  'Registered shareholder (set by the register, not by payment)', 'member'),
    ('board_member', 'Appointed board member',                                'member'),
    ('staff',        'Operational staff',                                     'back_office'),
    ('back_office',  'Back-office finance and administration',                'back_office'),
    ('admin',        'Administrator',                                         'back_office'),
    ('super_admin',  'Super administrator',                                   'back_office')
ON CONFLICT (role) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform.person (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name  text,
    primary_email text,
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
    version       integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS person_email_idx ON platform.person (lower(primary_email));

CREATE TABLE IF NOT EXISTS platform.identity_mapping (
    id         bigserial PRIMARY KEY,
    person_id  uuid NOT NULL REFERENCES platform.person (id),
    provider   text NOT NULL CHECK (provider IN ('stack_auth', 'core', 'legacy_website')),
    subject    text NOT NULL,
    status     text NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'pending_review')),
    source     text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, subject)
);
CREATE INDEX IF NOT EXISTS identity_mapping_person_idx ON platform.identity_mapping (person_id);

CREATE TABLE IF NOT EXISTS platform.membership (
    id         bigserial PRIMARY KEY,
    person_id  uuid NOT NULL REFERENCES platform.person (id),
    role       text NOT NULL REFERENCES platform.role_definition (role),
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_to   timestamptz,
    granted_by text,
    source     text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (person_id, role)
);

CREATE TABLE IF NOT EXISTS platform.migration_review (
    id          bigserial PRIMARY KEY,
    kind        text NOT NULL,
    subject_key text NOT NULL,
    detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
    status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by text,
    UNIQUE (kind, subject_key)
);

CREATE TABLE IF NOT EXISTS platform.audit_log (
    id          bigserial PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor       text NOT NULL,
    action      text NOT NULL,
    target_type text NOT NULL,
    target_id   text NOT NULL,
    detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Non-sensitive projection for services that only need to know who a person is
-- (for example Bank Core). Deliberately excludes email.
CREATE OR REPLACE VIEW platform.person_public AS
    SELECT id, display_name, status FROM platform.person;
