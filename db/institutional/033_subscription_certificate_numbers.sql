CREATE TABLE hub_subscription_certificate_numbers (
 subscription_id uuid PRIMARY KEY REFERENCES hub_subscription_requests(id),
 scope text NOT NULL CHECK(scope IN ('live','demonstration')),
 person_id uuid NOT NULL REFERENCES hub_people(id),
 base_reference text NOT NULL CHECK(base_reference ~ '^CB[1-9][0-9]*$'),
 sequence integer NOT NULL CHECK(sequence>=0),
 reference text NOT NULL,
 assigned_by uuid NOT NULL REFERENCES hub_people(id),
 note text NOT NULL CHECK(length(note)>=10),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(scope,reference), UNIQUE(scope,base_reference,sequence)
);
CREATE FUNCTION hub_assign_subscription_certificate(p_subscription uuid,p_scope text,p_actor uuid,p_base text,p_topup boolean,p_note text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE sub hub_subscription_requests; prior hub_subscription_certificate_numbers; next_sequence integer; allocated text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('citizen-certificate:'||p_scope,0));
 SELECT * INTO sub FROM hub_subscription_requests WHERE id=p_subscription AND scope=p_scope AND status NOT IN('withdrawn','declined') FOR UPDATE;
 IF sub.id IS NULL THEN RAISE EXCEPTION 'Subscription unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hub_memberships m JOIN hub_people p ON p.id=m.person_id WHERE p.id=p_actor AND p.scope=p_scope AND p.active AND m.active AND m.role IN('admin','super_admin')) THEN RAISE EXCEPTION 'Administrator required'; END IF;
 SELECT * INTO prior FROM hub_subscription_certificate_numbers WHERE subscription_id=p_subscription;
 IF FOUND THEN
  IF prior.base_reference<>p_base OR (prior.sequence>0)<>p_topup THEN RAISE EXCEPTION 'Certificate number already assigned'; END IF;
  RETURN prior.reference;
 END IF;
 IF EXISTS(SELECT 1 FROM hub_subscription_certificate_numbers WHERE scope=p_scope AND base_reference=p_base AND person_id<>sub.person_id)
 OR EXISTS(SELECT 1 FROM hub_documents WHERE scope=p_scope AND category IN('certificate','certificate_preview') AND document_reference ~ ('^'||p_base||'(-[0-9]+)?$') AND COALESCE((SELECT person_id FROM hub_subscription_requests WHERE id=hub_documents.subscription_id),(SELECT person_id FROM hub_corporate_records WHERE id=hub_documents.record_id),owner_id) IS DISTINCT FROM sub.person_id) THEN RAISE EXCEPTION 'Certificate series unavailable'; END IF;
 IF p_topup THEN
  SELECT GREATEST(COALESCE(max(sequence),0),COALESCE((SELECT max(substring(document_reference FROM length(p_base)+2)::integer) FROM hub_documents WHERE scope=p_scope AND category IN('certificate','certificate_preview') AND document_reference ~ ('^'||p_base||'-[0-9]+$')),0))+1 INTO next_sequence FROM hub_subscription_certificate_numbers WHERE scope=p_scope AND base_reference=p_base;
 ELSE next_sequence:=0;
 END IF;
 allocated:=p_base||CASE WHEN next_sequence=0 THEN '' ELSE '-'||CASE WHEN next_sequence<10 THEN '0' ELSE '' END||next_sequence::text END;
 IF EXISTS(SELECT 1 FROM hub_documents WHERE scope=p_scope AND document_reference=allocated) THEN RAISE EXCEPTION 'Certificate number already in use'; END IF;
 INSERT INTO hub_subscription_certificate_numbers(subscription_id,scope,person_id,base_reference,sequence,reference,assigned_by,note) VALUES(sub.id,p_scope,sub.person_id,p_base,next_sequence,allocated,p_actor,p_note);
 INSERT INTO hub_audit(actor_id,action,resource_type,resource_id,scope) VALUES(p_actor,'subscription.certificate_number_assigned','subscription_request',sub.id::text,p_scope);
 RETURN allocated;
END;
$$;
