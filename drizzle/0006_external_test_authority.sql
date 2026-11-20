ALTER TABLE kyc_events ALTER COLUMN actor_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE kyc_events ADD COLUMN IF NOT EXISTS external_actor_id text;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='kyc_events'::regclass AND conname='kyc_event_one_actor') THEN
  ALTER TABLE kyc_events ADD CONSTRAINT kyc_event_one_actor CHECK ((actor_id IS NULL) <> (external_actor_id IS NULL));
 END IF;
END $$;
