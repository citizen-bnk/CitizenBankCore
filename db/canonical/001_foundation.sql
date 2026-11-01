-- Citizen Digital Ltd canonical registry, designed for a NEW database.
-- This migration is additive. It must not be run against an existing live database
-- until source snapshots, identity matching and cutover checks are complete.
BEGIN;

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS corporate;
CREATE SCHEMA IF NOT EXISTS licensing;
CREATE SCHEMA IF NOT EXISTS documents;

CREATE TABLE IF NOT EXISTS platform.legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  registration_number text NOT NULL UNIQUE,
  jurisdiction text NOT NULL,
  applicant_status text NOT NULL CHECK (applicant_status IN ('intended_applicant','applicant','licensed','non_applicant','inactive')),
  applicant_basis_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  date_of_birth date,
  person_status text NOT NULL DEFAULT 'unverified' CHECK (person_status IN ('unverified','verified','merged','inactive')),
  merged_into uuid REFERENCES platform.people(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (merged_into IS NULL OR merged_into <> id)
);

-- A contact address is not an identity: one family/business email may be shared.
CREATE TABLE IF NOT EXISTS platform.person_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES platform.people(id),
  kind text NOT NULL CHECK (kind IN ('email','phone','postal_address','physical_address')),
  value text NOT NULL,
  verified_at timestamptz,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz
);
CREATE INDEX IF NOT EXISTS person_contacts_lookup_idx ON platform.person_contacts(kind, lower(value));

CREATE TABLE IF NOT EXISTS platform.external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES platform.people(id),
  source_system text NOT NULL CHECK (source_system IN ('website','hub','core','stack_auth','google_form','manual')),
  source_id text NOT NULL,
  matched_by text NOT NULL CHECK (matched_by IN ('verified_subject','reviewed_match','legacy_import')),
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system, source_id)
);

CREATE TABLE IF NOT EXISTS platform.source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_digest text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  review_state text NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','matched','conflict','accepted','superseded')),
  canonical_table text,
  canonical_id uuid,
  UNIQUE(source_system, source_table, source_id, source_digest)
);

CREATE TABLE IF NOT EXISTS corporate.share_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES platform.legal_entities(id),
  code text NOT NULL,
  class_name text NOT NULL,
  authorised_quantity bigint NOT NULL CHECK (authorised_quantity >= 0),
  rights_document_id uuid,
  status text NOT NULL CHECK (status IN ('draft','approved','retired')),
  UNIQUE(entity_id, code)
);

CREATE TABLE IF NOT EXISTS corporate.holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES platform.people(id),
  legal_entity_id uuid REFERENCES platform.legal_entities(id),
  display_name text NOT NULL,
  CHECK ((person_id IS NULL) <> (legal_entity_id IS NULL))
);

CREATE TABLE IF NOT EXISTS corporate.beneficial_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES platform.legal_entities(id),
  holder_id uuid NOT NULL REFERENCES corporate.holders(id),
  beneficial_person_id uuid NOT NULL REFERENCES platform.people(id),
  ownership_percent numeric(7,4) CHECK (ownership_percent BETWEEN 0 AND 100),
  control_basis text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  review_state text NOT NULL CHECK (review_state IN ('pending','verified','superseded')),
  evidence_document_id uuid,
  source_record_id uuid REFERENCES platform.source_records(id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS beneficial_interests_entity_person_idx
  ON corporate.beneficial_interests(entity_id, beneficial_person_id);

-- Each confirmed issue, transfer, redemption or correction is represented by
-- balanced entries; pending/unreconciled legacy rows never affect legal holdings.
CREATE TABLE IF NOT EXISTS corporate.share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES platform.legal_entities(id),
  share_class_id uuid NOT NULL REFERENCES corporate.share_classes(id),
  event_type text NOT NULL CHECK (event_type IN ('issue','transfer','redemption','conversion','correction')),
  effective_date date NOT NULL,
  state text NOT NULL CHECK (state IN ('draft','pending_reconciliation','confirmed','void')),
  authority_document_id uuid,
  source_record_id uuid REFERENCES platform.source_records(id),
  supersedes_event_id uuid REFERENCES corporate.share_events(id),
  recorded_by uuid REFERENCES platform.people(id),
  confirmed_by uuid REFERENCES platform.people(id),
  confirmed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'confirmed') = (confirmed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS share_events_entity_date_idx ON corporate.share_events(entity_id, effective_date);

CREATE TABLE IF NOT EXISTS corporate.share_event_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES corporate.share_events(id),
  holder_id uuid REFERENCES corporate.holders(id),
  quantity_delta bigint NOT NULL CHECK (quantity_delta <> 0),
  -- NULL holder is the unissued treasury balance. All event entries must sum to zero.
  UNIQUE(event_id, holder_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS share_event_one_unissued_entry_idx
  ON corporate.share_event_entries(event_id) WHERE holder_id IS NULL;

-- A confirmed event must conserve shares between holders and the unissued
-- balance. Pending legacy evidence can be entered before it is reconciled.
CREATE OR REPLACE FUNCTION corporate.assert_balanced_confirmed_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_id_to_check uuid;
DECLARE event_state text;
DECLARE company_id uuid;
DECLARE class_id uuid;
DECLARE entry_count integer;
DECLARE net_change bigint;
DECLARE issued_quantity bigint;
DECLARE allowed_quantity bigint;
BEGIN
  event_id_to_check := CASE WHEN TG_TABLE_NAME = 'share_events' THEN NEW.id ELSE NEW.event_id END;
  SELECT state, entity_id, share_class_id INTO event_state, company_id, class_id
    FROM corporate.share_events WHERE id = event_id_to_check;
  IF event_state = 'confirmed' THEN
    SELECT count(*), COALESCE(sum(quantity_delta), 0)
      INTO entry_count, net_change
      FROM corporate.share_event_entries WHERE event_id = event_id_to_check;
    IF entry_count < 2 OR net_change <> 0 THEN
      RAISE EXCEPTION 'Confirmed share event % must have at least two balanced entries', event_id_to_check;
    END IF;
    IF EXISTS (
      SELECT 1 FROM corporate.confirmed_holdings
      WHERE entity_id = company_id AND share_class_id = class_id AND quantity < 0
    ) THEN
      RAISE EXCEPTION 'Confirmed share event % would create a negative holding', event_id_to_check;
    END IF;
    SELECT COALESCE(sum(quantity), 0) INTO issued_quantity
      FROM corporate.confirmed_holdings
      WHERE entity_id = company_id AND share_class_id = class_id;
    SELECT c.authorised_quantity INTO allowed_quantity
      FROM corporate.share_classes c WHERE c.id = class_id AND c.entity_id = company_id;
    IF issued_quantity > allowed_quantity THEN
      RAISE EXCEPTION 'Confirmed share event % exceeds authorised shares', event_id_to_check;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER confirmed_share_event_balanced
  AFTER INSERT OR UPDATE ON corporate.share_events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION corporate.assert_balanced_confirmed_event();
CREATE CONSTRAINT TRIGGER confirmed_share_entry_balanced
  AFTER INSERT OR UPDATE ON corporate.share_event_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION corporate.assert_balanced_confirmed_event();

CREATE OR REPLACE FUNCTION corporate.protect_confirmed_share_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'share_events' THEN
    IF OLD.state = 'confirmed' THEN
      RAISE EXCEPTION 'Confirmed share events are immutable; record a correction event';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM corporate.share_events WHERE id = NEW.event_id AND state = 'confirmed') THEN
      RAISE EXCEPTION 'Confirmed share entries are immutable; record a correction event';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM corporate.share_events WHERE id = OLD.event_id AND state = 'confirmed') THEN
      RAISE EXCEPTION 'Confirmed share entries are immutable; record a correction event';
    END IF;
    -- An UPDATE must not move a pending entry into an already confirmed event.
    IF TG_OP = 'UPDATE' AND EXISTS (
      SELECT 1 FROM corporate.share_events WHERE id = NEW.event_id AND state = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'Confirmed share entries are immutable; record a correction event';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_confirmed_share_events
  BEFORE UPDATE OR DELETE ON corporate.share_events
  FOR EACH ROW EXECUTE FUNCTION corporate.protect_confirmed_share_history();
CREATE TRIGGER protect_confirmed_share_entries
  BEFORE INSERT OR UPDATE OR DELETE ON corporate.share_event_entries
  FOR EACH ROW EXECUTE FUNCTION corporate.protect_confirmed_share_history();

CREATE OR REPLACE VIEW corporate.confirmed_holdings AS
  SELECT e.entity_id, e.share_class_id, x.holder_id,
         sum(x.quantity_delta)::bigint AS quantity
  FROM corporate.share_events e
  JOIN corporate.share_event_entries x ON x.event_id = e.id
  WHERE e.state = 'confirmed' AND x.holder_id IS NOT NULL
  GROUP BY e.entity_id, e.share_class_id, x.holder_id;

CREATE TABLE IF NOT EXISTS corporate.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES platform.legal_entities(id),
  subscriber_id uuid NOT NULL REFERENCES corporate.holders(id),
  instrument text NOT NULL CHECK (instrument IN ('safe','ordinary_share','other')),
  reference text NOT NULL,
  currency char(3) NOT NULL,
  amount_committed numeric(18,2) NOT NULL CHECK (amount_committed >= 0),
  amount_received numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount_received >= 0),
  reference_units bigint,
  unit_price numeric(18,2),
  state text NOT NULL CHECK (state IN ('draft','subscribed','part_paid','paid','cancelled','converted')),
  share_event_id uuid REFERENCES corporate.share_events(id),
  source_record_id uuid REFERENCES platform.source_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id, reference),
  CHECK (amount_received <= amount_committed),
  CHECK (instrument <> 'safe' OR share_event_id IS NULL OR state = 'converted')
);

CREATE TABLE IF NOT EXISTS corporate.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES platform.legal_entities(id),
  person_id uuid NOT NULL REFERENCES platform.people(id),
  office text NOT NULL,
  status text NOT NULL CHECK (status IN ('nominated','fit_proper_review','company_approved','regulatory_pending','effective','ended','withdrawn')),
  company_approval_document_id uuid,
  regulatory_document_id uuid,
  effective_from date,
  effective_to date,
  source_record_id uuid REFERENCES platform.source_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS documents.records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES platform.legal_entities(id),
  category text NOT NULL,
  title text NOT NULL,
  owner_person_id uuid REFERENCES platform.people(id),
  access_class text NOT NULL CHECK (access_class IN ('internal','confidential','regulator','investor_private','public')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents.versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents.records(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  document_state text NOT NULL CHECK (document_state IN ('draft','approved','signed','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_number)
);
ALTER TABLE platform.legal_entities ADD CONSTRAINT legal_entities_applicant_basis_fk
  FOREIGN KEY (applicant_basis_document_id) REFERENCES documents.records(id);
CREATE TABLE IF NOT EXISTS corporate.shareholder_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES platform.legal_entities(id),
  agreement_type text NOT NULL CHECK (agreement_type IN ('master','accession','amendment','transfer','bonus_allocation')),
  document_id uuid NOT NULL REFERENCES documents.records(id),
  version_id uuid REFERENCES documents.versions(id),
  status text NOT NULL CHECK (status IN ('draft','circulated','part_signed','effective','superseded','cancelled')),
  effective_date date,
  supersedes_agreement_id uuid REFERENCES corporate.shareholder_agreements(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS corporate.agreement_parties (
  agreement_id uuid NOT NULL REFERENCES corporate.shareholder_agreements(id),
  holder_id uuid NOT NULL REFERENCES corporate.holders(id),
  signature_state text NOT NULL CHECK (signature_state IN ('not_requested','requested','authorised','signed','declined')),
  signed_at timestamptz,
  PRIMARY KEY (agreement_id, holder_id),
  CHECK (signed_at IS NULL OR signature_state = 'signed')
);
ALTER TABLE corporate.share_classes ADD CONSTRAINT share_classes_rights_document_fk
  FOREIGN KEY (rights_document_id) REFERENCES documents.records(id);
ALTER TABLE corporate.share_events ADD CONSTRAINT share_events_authority_document_fk
  FOREIGN KEY (authority_document_id) REFERENCES documents.records(id);
ALTER TABLE corporate.appointments ADD CONSTRAINT appointments_company_document_fk
  FOREIGN KEY (company_approval_document_id) REFERENCES documents.records(id);
ALTER TABLE corporate.appointments ADD CONSTRAINT appointments_regulatory_document_fk
  FOREIGN KEY (regulatory_document_id) REFERENCES documents.records(id);
ALTER TABLE corporate.beneficial_interests ADD CONSTRAINT beneficial_interests_evidence_fk
  FOREIGN KEY (evidence_document_id) REFERENCES documents.records(id);

CREATE TABLE IF NOT EXISTS licensing.requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES platform.legal_entities(id),
  requirement_code text NOT NULL,
  title text NOT NULL,
  description text,
  pack_document_code text,
  pack_section text,
  requirement_type text,
  priority char(1) NOT NULL CHECK (priority IN ('A','B')),
  owner_role text,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','submitted_for_review','verified','not_applicable')),
  source_record_id uuid REFERENCES platform.source_records(id),
  evidence_document_id uuid REFERENCES documents.records(id),
  verified_by uuid REFERENCES platform.people(id),
  verified_at timestamptz,
  UNIQUE(entity_id, requirement_code)
);

CREATE TABLE IF NOT EXISTS licensing.submission_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES platform.legal_entities(id),
  version_number integer NOT NULL,
  manifest_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('assembled','approved','lodged','superseded')),
  lodged_at timestamptz,
  cbl_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id, version_number),
  CHECK (status <> 'lodged' OR lodged_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS licensing.submission_documents (
  snapshot_id uuid NOT NULL REFERENCES licensing.submission_snapshots(id),
  document_version_id uuid NOT NULL REFERENCES documents.versions(id),
  pack_section text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  PRIMARY KEY (snapshot_id, document_version_id),
  UNIQUE(snapshot_id, position)
);
CREATE TABLE IF NOT EXISTS licensing.correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES platform.legal_entities(id),
  related_promoter_id uuid REFERENCES platform.legal_entities(id),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  subject text NOT NULL,
  external_reference text,
  correspondence_date date NOT NULL,
  document_id uuid NOT NULL REFERENCES documents.records(id),
  classification text NOT NULL CHECK (classification IN ('pre_application','application','information_request','decision','other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (entity_id IS NOT NULL OR related_promoter_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS platform.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_person_id uuid REFERENCES platform.people(id),
  action text NOT NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  before_digest text,
  after_digest text,
  happened_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform.legal_entities
  (legal_name, registration_number, jurisdiction, applicant_status)
VALUES ('Citizen Digital Ltd', '99073', 'LS', 'intended_applicant')
ON CONFLICT (registration_number) DO NOTHING;

COMMIT;
