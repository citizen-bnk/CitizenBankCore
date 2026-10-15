CREATE TABLE hub_ai_tasks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES hub_people(id),
 scope text NOT NULL CHECK(scope IN('live','demonstration')),instruction text NOT NULL,
 command jsonb NOT NULL,status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','executing','succeeded','failed','cancelled')),
 result jsonb,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',completed_at timestamptz
);
CREATE INDEX hub_ai_tasks_actor_scope ON hub_ai_tasks(actor_id,scope,created_at DESC);
