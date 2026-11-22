-- Credentials are encrypted server-side. Document bytes remain exclusively in Drive.
CREATE TABLE hub_integration_connections (
 service text PRIMARY KEY CHECK(service='google_drive'), owner_email text NOT NULL,
 encrypted_token text NOT NULL, configuration jsonb NOT NULL DEFAULT '{}',
 connected_by uuid NOT NULL REFERENCES hub_people(id), connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hub_oauth_states (
 token_hash text PRIMARY KEY, person_id uuid NOT NULL REFERENCES hub_people(id),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
