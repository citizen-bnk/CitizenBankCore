-- Additive ledger. Existing settlement evidence remains unchanged and is not
-- guessed into historical cash receipts. SAFE units never become issued stock.
ALTER TABLE hub_subscription_requests ADD COLUMN bonus_units integer NOT NULL DEFAULT 0 CHECK(bonus_units>=0);
ALTER TABLE hub_subscription_requests ADD COLUMN bonus_approved_by uuid REFERENCES hub_people(id);
ALTER TABLE hub_subscription_requests ADD COLUMN bonus_approved_at timestamptz;
ALTER TABLE hub_subscription_requests ADD COLUMN captured_by uuid REFERENCES hub_people(id);
ALTER TABLE hub_subscription_requests ADD COLUMN capture_note text;
ALTER TABLE hub_subscription_requests ADD COLUMN minimum_exception text;
ALTER TABLE hub_subscription_requests ADD COLUMN ledger_managed boolean NOT NULL DEFAULT false;
ALTER TABLE hub_subscription_requests ADD CONSTRAINT bonus_approval_pair CHECK((bonus_approved_by IS NULL)=(bonus_approved_at IS NULL));
CREATE TABLE hub_subscription_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL REFERENCES hub_subscription_requests(id),
 request_key uuid NOT NULL UNIQUE,
 amount numeric(18,2) NOT NULL CHECK(amount>0),
 received_on date NOT NULL,
 reference text NOT NULL,
 note text NOT NULL,
 proof_link text,
 recorded_by uuid NOT NULL REFERENCES hub_people(id),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 voided_by uuid REFERENCES hub_people(id),
 voided_at timestamptz,
 void_note text,
 CHECK((voided_by IS NULL)=(voided_at IS NULL)),
 CHECK(proof_link IS NULL OR proof_link ~ '^https://(drive.google.com/file/d/|docs.google.com/(document|spreadsheets)/d/)')
);
CREATE INDEX hub_subscription_payment_idx ON hub_subscription_payments(subscription_id);
CREATE TABLE hub_subscription_ledger_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL REFERENCES hub_subscription_requests(id),
 version integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES hub_people(id),
 action text NOT NULL,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscription_id,version)
);
