CREATE TABLE hub_form_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sheet_id text NOT NULL, sheet_row integer NOT NULL CHECK(sheet_row>=2),
 scope text NOT NULL DEFAULT 'live' CHECK(scope IN('live','demonstration')), source_link text NOT NULL,
 source_digest text NOT NULL, source_timestamp text NOT NULL, facts jsonb NOT NULL,
 person_id uuid REFERENCES hub_people(id), corporate_record_id uuid REFERENCES hub_corporate_records(id),
 review_status text NOT NULL DEFAULT 'pending_reconciliation' CHECK(review_status IN('pending_reconciliation','source_changed','reconciled','conflict')),
 version integer NOT NULL DEFAULT 1, synced_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sheet_id,sheet_row,scope)
);
CREATE TABLE hub_form_submission_history (
 submission_id uuid NOT NULL REFERENCES hub_form_submissions(id),version integer NOT NULL,
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(submission_id,version)
);
CREATE TABLE hub_form_sync_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sheet_id text NOT NULL,scope text NOT NULL,
 rows_read integer NOT NULL,changed integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
