-- Analytics events written by the short-link and reminder features. Replaces the events table the old hosting
-- platform provided. Safe to run more than once.
CREATE TABLE IF NOT EXISTS public.app_events (
    id         bigserial PRIMARY KEY,
    type       text        NOT NULL,
    data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_events_type_created_idx ON public.app_events (type, created_at DESC);
