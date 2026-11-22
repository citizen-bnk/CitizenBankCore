ALTER TABLE hub_document_templates DROP CONSTRAINT hub_document_templates_kind_check;
ALTER TABLE hub_document_templates ADD CONSTRAINT hub_document_templates_kind_check CHECK(kind IN('safe','safe_topup','certificate'));
ALTER TABLE hub_document_templates ADD COLUMN source_details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE hub_document_template_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id uuid NOT NULL REFERENCES hub_document_templates(id),
 scope text NOT NULL,version integer NOT NULL,snapshot jsonb NOT NULL,actor_id uuid REFERENCES hub_people(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(template_id,version)
);
CREATE TABLE hub_subscription_document_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES hub_subscription_requests(id),scope text NOT NULL CHECK(scope IN('live','demonstration')),
 source_version integer NOT NULL,actor_id uuid NOT NULL REFERENCES hub_people(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','completed','blocked','superseded')),
 attempts integer NOT NULL DEFAULT 0,lease uuid,started_at timestamptz,completed_at timestamptz,
 results jsonb NOT NULL DEFAULT '[]'::jsonb,issue_code text,issue_message text,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(subscription_id,source_version)
);
CREATE INDEX hub_document_jobs_pending ON hub_subscription_document_jobs(status,created_at);
CREATE FUNCTION hub_queue_subscription_documents() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status NOT IN('withdrawn','declined') AND (TG_OP='INSERT' OR NEW.version IS DISTINCT FROM OLD.version) THEN
  INSERT INTO hub_subscription_document_jobs(subscription_id,scope,source_version,actor_id) VALUES(NEW.id,NEW.scope,NEW.version,COALESCE(NEW.captured_by,NEW.person_id)) ON CONFLICT(subscription_id,source_version) DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER hub_subscription_document_job AFTER INSERT OR UPDATE ON hub_subscription_requests FOR EACH ROW EXECUTE FUNCTION hub_queue_subscription_documents();

CREATE FUNCTION hub_retain_document_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO hub_document_template_history(template_id,scope,version,snapshot,actor_id) VALUES(OLD.id,OLD.scope,OLD.version,to_jsonb(OLD),OLD.approved_by) ON CONFLICT(template_id,version) DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE TRIGGER hub_document_template_history BEFORE UPDATE ON hub_document_templates FOR EACH ROW EXECUTE FUNCTION hub_retain_document_template();
