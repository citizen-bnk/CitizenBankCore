-- Shared inbox metadata used by the Hub, board and investor APIs. No files or document bytes.
CREATE TABLE IF NOT EXISTS notifications (
 id bigserial PRIMARY KEY, user_id text REFERENCES user_profiles(user_id), recipient_email text,
 email_subject text NOT NULL, email_content text NOT NULL, email_type text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 read_status boolean NOT NULL DEFAULT false, read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (user_id IS NOT NULL OR recipient_email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS notifications_user_inbox_idx ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_email_inbox_idx ON notifications(lower(recipient_email), created_at DESC);
CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id text PRIMARY KEY REFERENCES user_profiles(user_id),
 channel_sms boolean NOT NULL DEFAULT true, channel_email boolean NOT NULL DEFAULT true,
 channel_push boolean NOT NULL DEFAULT true, channel_whatsapp boolean NOT NULL DEFAULT false,
 phone_number text, whatsapp_number text, quiet_hours_start time, quiet_hours_end time,
 timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
