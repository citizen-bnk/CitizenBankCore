CREATE TABLE IF NOT EXISTS banking_email_outbox (
 id text PRIMARY KEY,event_key text NOT NULL UNIQUE,user_id text NOT NULL REFERENCES users(id),
 person_id text,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),handed_off_at timestamptz
);
CREATE INDEX IF NOT EXISTS banking_email_pending_idx ON banking_email_outbox(status,next_attempt_at);
