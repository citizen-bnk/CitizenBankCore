ALTER TABLE cards ADD COLUMN IF NOT EXISTS archived_at timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS card_admin_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), card_id text NOT NULL REFERENCES cards(id),
 actor_hub_id uuid NOT NULL, action text NOT NULL, reason text NOT NULL,
 previous_state jsonb NOT NULL, resulting_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
