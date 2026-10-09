CREATE TABLE hub_data_room_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),drive_file_id text NOT NULL,
 title text NOT NULL,category text NOT NULL,summary text NOT NULL,
 shared_link text NOT NULL CHECK(shared_link ~ '^https://(drive.google.com/file/d/|docs.google.com/(document|spreadsheets|presentation)/d/)'),
 stage integer NOT NULL DEFAULT 1 CHECK(stage BETWEEN 1 AND 5),
 document_status text NOT NULL DEFAULT 'working_reference',
 publication text NOT NULL DEFAULT 'draft' CHECK(publication IN('draft','released','withdrawn')),
 scope text NOT NULL CHECK(scope IN('live','demonstration')),
 updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(drive_file_id,scope)
);
CREATE TABLE hub_data_room_access(person_id uuid NOT NULL REFERENCES hub_people(id),stage integer NOT NULL CHECK(stage BETWEEN 1 AND 5),granted_by uuid NOT NULL REFERENCES hub_people(id),granted_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(person_id,stage));
CREATE TABLE hub_investor_questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),person_id uuid NOT NULL REFERENCES hub_people(id),question text NOT NULL CHECK(length(question) BETWEEN 3 AND 4000),answer text,answered_by uuid REFERENCES hub_people(id),answered_at timestamptz,scope text NOT NULL CHECK(scope IN('live','demonstration')),created_at timestamptz NOT NULL DEFAULT now());
