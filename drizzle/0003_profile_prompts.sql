ALTER TABLE "users" ADD COLUMN "profile_prompt_state" jsonb NOT NULL DEFAULT '{"day":"","answered":0,"deferred":false,"suppressed":[]}'::jsonb;
