CREATE TABLE hub_vacancies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope text NOT NULL CHECK(scope IN('live','demonstration')),
 source_record_id uuid REFERENCES hub_corporate_records(id),title text NOT NULL,summary text NOT NULL,requirements text NOT NULL,location text NOT NULL,
 kind text NOT NULL CHECK(kind IN('employment','board')),phase text NOT NULL DEFAULT 'pre_licensing',
 closes_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','open','paused','closed','filled')),
 source_link text NOT NULL CHECK(source_link ~ '^https://(drive.google.com/file/d/|docs.google.com/document/d/)'),
 published_at timestamptz,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,scope),UNIQUE(scope,source_record_id)
);
CREATE TABLE hub_job_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope text NOT NULL CHECK(scope IN('live','demonstration')),
 vacancy_id uuid NOT NULL,person_id uuid NOT NULL REFERENCES hub_people(id),request_key uuid NOT NULL,
 cover_statement text NOT NULL,cv_link text NOT NULL CHECK(cv_link ~ '^https://(drive.google.com/file/d/|docs.google.com/document/d/)'),
 references_link text CHECK(references_link IS NULL OR references_link ~ '^https://(drive.google.com/file/d/|docs.google.com/document/d/)'),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','under_review','shortlisted','interview','checks','offered','accepted','onboarding','employed','appointed','rejected','withdrawn','declined')),
 candidate_note text NOT NULL DEFAULT '',offer_link text,contract_link text,approval_link text,regulatory_link text,start_date date,
 conditions_confirmed boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(person_id,vacancy_id),UNIQUE(person_id,request_key),UNIQUE(id,scope),
 FOREIGN KEY(vacancy_id,scope) REFERENCES hub_vacancies(id,scope),
 CHECK(status NOT IN('offered','accepted','onboarding','employed','appointed') OR offer_link IS NOT NULL),
 CHECK(status NOT IN('employed','appointed') OR (contract_link IS NOT NULL AND approval_link IS NOT NULL AND start_date IS NOT NULL AND conditions_confirmed)),
 CHECK(status<>'appointed' OR regulatory_link IS NOT NULL)
);
CREATE INDEX hub_applications_queue ON hub_job_applications(scope,status,created_at);
CREATE TABLE hub_recruitment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid NOT NULL,scope text NOT NULL,
 actor_id uuid NOT NULL REFERENCES hub_people(id),status text NOT NULL,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(application_id,scope) REFERENCES hub_job_applications(id,scope)
);
INSERT INTO hub_vacancies(scope,source_record_id,title,summary,requirements,location,kind,phase,closes_at,status,source_link,published_at)
 SELECT scope,id,CASE reference WHEN 'vacancy-ceo' THEN 'Chief Executive Officer' WHEN 'vacancy-cfo' THEN 'Chief Financial Officer' WHEN 'vacancy-cro' THEN 'Chief Risk Officer' WHEN 'vacancy-coo' THEN 'Chief Operating Officer' WHEN 'vacancy-chief-internal-auditor' THEN 'Chief Internal Auditor' WHEN 'vacancy-compliance-officer-mlro' THEN 'Compliance Officer / MLRO' WHEN 'vacancy-board-chair' THEN 'Board Chair' ELSE title END,
 CASE WHEN reference IN('vacancy-ceo','vacancy-board-chair') THEN 'Succession and replacement recruitment across pre-licensing preparation and future licensed operations. Existing appointments are retained until the approved replacement process is completed.' ELSE 'Leadership and governance recruitment for Citizen Digital Ltd supporting pre-licensing preparation and future operations. Appointments remain subject to company approvals and applicable regulatory assessment.' END,
 'Review the source advertisement for responsibilities and qualifications. Submit your CV, cover statement and professional reference information. Final terms are confirmed through the individual offer.',
 COALESCE(facts->>'location','Lesotho / Southern Africa'),CASE WHEN reference LIKE '%board%' THEN 'board' ELSE 'employment' END,CASE WHEN reference IN('vacancy-ceo','vacancy-board-chair') THEN 'both' ELSE 'pre_licensing' END,
 (CASE WHEN reference LIKE '%board%' THEN '2026-11-05' WHEN reference LIKE '%ceo%' THEN '2026-10-15' WHEN reference LIKE '%cfo%' OR reference LIKE '%cro%' THEN '2026-10-20' WHEN reference LIKE '%coo%' THEN '2026-10-22' ELSE '2026-10-25' END||'T21:59:59Z')::timestamptz,
 'open',source_link,now() FROM hub_corporate_records WHERE kind='vacancy' AND scope='live' AND status<>'archived'
 ON CONFLICT(scope,source_record_id) DO NOTHING;
INSERT INTO hub_vacancies(scope,title,summary,requirements,location,kind,phase,closes_at,status,source_link,published_at)
 SELECT 'demonstration',title,summary,requirements,location,kind,phase,closes_at,'open',source_link,now() FROM hub_vacancies WHERE scope='live';

