CREATE TABLE IF NOT EXISTS hub_recruitment_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text UNIQUE NOT NULL,
 vacancy_id uuid NOT NULL REFERENCES hub_vacancies(id), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hub_recruitment_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), draft_id uuid NOT NULL REFERENCES hub_recruitment_drafts(id),
 purpose text NOT NULL CHECK(purpose IN ('cv','references','selfie','id_photo')), name text NOT NULL,
 drive_file_id text NOT NULL, shared_link text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hub_job_applications ALTER COLUMN person_id DROP NOT NULL;
ALTER TABLE hub_job_applications ALTER COLUMN cv_link DROP NOT NULL;
ALTER TABLE hub_recruitment_events ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE hub_job_applications ADD COLUMN IF NOT EXISTS applicant_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE hub_job_applications ADD COLUMN IF NOT EXISTS contact_verified boolean NOT NULL DEFAULT false;
ALTER TABLE hub_job_applications ADD COLUMN IF NOT EXISTS guest_draft_id uuid UNIQUE REFERENCES hub_recruitment_drafts(id);
