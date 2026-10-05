CREATE TABLE IF NOT EXISTS "admin_invites" (
 "id" text PRIMARY KEY, "token_hash" text NOT NULL UNIQUE, "user_id" text NOT NULL REFERENCES "users"("id"),
 "expires_at" timestamptz NOT NULL, "consumed_at" timestamptz
);
