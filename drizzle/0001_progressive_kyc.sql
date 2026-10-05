CREATE TABLE IF NOT EXISTS "kyc_profiles" (
 "user_id" text PRIMARY KEY REFERENCES "users"("id"), "declared" jsonb NOT NULL DEFAULT '{}',
 "verified" jsonb NOT NULL DEFAULT '[]', "status" text NOT NULL DEFAULT 'not_started', "valid_until" timestamptz,
 "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kyc_events" (
 "id" text PRIMARY KEY, "user_id" text NOT NULL REFERENCES "users"("id"), "actor_id" text NOT NULL REFERENCES "users"("id"),
 "event" text NOT NULL, "details" jsonb NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passkeys" (
 "id" text PRIMARY KEY, "user_id" text NOT NULL REFERENCES "users"("id"), "public_key" text NOT NULL,
 "counter" integer NOT NULL, "rp_id" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_challenges" (
 "id" text PRIMARY KEY, "challenge" text NOT NULL, "purpose" text NOT NULL, "user_id" text REFERENCES "users"("id"),
 "origin" text NOT NULL, "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
 "id" text PRIMARY KEY, "user_id" text NOT NULL REFERENCES "users"("id"), "authenticated_at" timestamptz NOT NULL DEFAULT now(),
 "last_seen_at" timestamptz NOT NULL DEFAULT now(), "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
 "id" text PRIMARY KEY, "count" integer NOT NULL DEFAULT 1, "expires_at" timestamptz NOT NULL
);
