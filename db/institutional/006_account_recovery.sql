CREATE TABLE hub_recovery_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL,
 expires_at timestamptz NOT NULL,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
