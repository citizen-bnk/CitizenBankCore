CREATE TABLE hub_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL,
 title text NOT NULL,
 summary text NOT NULL,
 instrument text NOT NULL,
 currency text NOT NULL DEFAULT 'LSL' CHECK(currency ~ '^[A-Z]{3}$'),
 unit_price numeric(18,2) NOT NULL CHECK(unit_price>0),
 min_units integer NOT NULL DEFAULT 1 CHECK(min_units>0),
 max_units integer NOT NULL CHECK(max_units>=min_units),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','open','closed')),
 terms_link text,
 approved_by uuid REFERENCES hub_people(id),
 approved_at timestamptz,
 closes_at timestamptz,
 version integer NOT NULL DEFAULT 1,
 scope text NOT NULL CHECK(scope IN('live','demonstration')),
 UNIQUE(scope,reference), UNIQUE(id,scope),
 CHECK(scope='demonstration' OR status<>'open' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND terms_link ~ '^https://(drive.google.com/file/d/|docs.google.com/(document|spreadsheets|presentation)/d/)'))
);
CREATE TABLE hub_subscription_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_key uuid NOT NULL,
 person_id uuid NOT NULL REFERENCES hub_people(id),
 opportunity_id uuid NOT NULL,
 opportunity_version integer NOT NULL,
 units integer NOT NULL CHECK(units>0),
 unit_price numeric(18,2) NOT NULL CHECK(unit_price>0),
 currency text NOT NULL,
 source_of_funds text NOT NULL,
 purpose text NOT NULL,
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','under_review','declined','withdrawn')),
 scope text NOT NULL CHECK(scope IN('live','demonstration')),
 consent_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(person_id,request_key),
 FOREIGN KEY(opportunity_id,scope) REFERENCES hub_opportunities(id,scope)
);
INSERT INTO hub_opportunities(reference,title,summary,instrument,unit_price,min_units,max_units,status,scope) VALUES
 ('example-ordinary','Citizen ordinary shares — fictional example','Practise a share subscription request with fictional terms. This is not a real offer.','Ordinary shares',100,10,1000,'open','demonstration'),
 ('example-preference','Citizen preference shares — fictional example','Explore a second fictional share class and submit a request for review. No return or ownership is promised.','Preference shares',250,4,400,'open','demonstration')
ON CONFLICT(scope,reference) DO NOTHING;
