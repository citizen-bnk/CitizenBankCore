-- Fields required by canonical profile retrieval and login audit, reconstructed
-- from the current website API contracts. Additive; does not import user data.
ALTER TABLE user_profiles
 ADD COLUMN IF NOT EXISTS profile_completion_dismissed_at timestamptz,
 ADD COLUMN IF NOT EXISTS profile_steps_completed jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS id_type text,
 ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
 ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS user_login_history (
 id bigserial PRIMARY KEY,
 user_id text NOT NULL REFERENCES user_profiles(user_id),
 login_timestamp timestamptz NOT NULL DEFAULT now(),
 ip_address text, user_agent text, location_country text, location_city text,
 success boolean NOT NULL DEFAULT true, failure_reason text
);
CREATE INDEX IF NOT EXISTS user_login_history_user_time_idx
 ON user_login_history(user_id,login_timestamp DESC);
