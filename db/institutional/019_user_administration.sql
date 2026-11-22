CREATE TABLE hub_role_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, person_id uuid NOT NULL REFERENCES hub_people(id),
 actor_id uuid NOT NULL REFERENCES hub_people(id), scope text NOT NULL CHECK(scope IN ('live','demonstration')),
 previous_roles text[] NOT NULL, assigned_roles text[] NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION hub_assign_roles(actor uuid, target uuid, expected integer, requested text[], explanation text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE a hub_people; p hub_people; oldroles text[]; super boolean;
BEGIN
 PERFORM id FROM hub_people WHERE id IN (actor,target) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM hub_people WHERE id=actor AND active;
 SELECT * INTO p FROM hub_people WHERE id=target AND active;
 IF a.id IS NULL OR p.id IS NULL OR a.scope<>p.scope THEN RETURN 'USER_UNAVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hub_memberships WHERE person_id=actor AND active AND role IN ('admin','super_admin')) THEN RETURN 'ROLE_ADMIN_REQUIRED'; END IF;
 SELECT EXISTS(SELECT 1 FROM hub_memberships WHERE person_id=actor AND active AND role='super_admin') INTO super;
 SELECT coalesce(array_agg(role ORDER BY role),ARRAY[]::text[]) INTO oldroles FROM hub_memberships WHERE person_id=target AND active;
 IF p.version<>expected THEN RETURN 'RECORD_CONFLICT'; END IF;
 IF cardinality(requested)=0 OR NOT requested <@ ARRAY['customer','investor','shareholder','board_member','staff','back_office','admin','super_admin','candidate']::text[] THEN RETURN 'ROLE_INVALID'; END IF;
 IF NOT super AND (('super_admin'=ANY(requested)) OR ('super_admin'=ANY(oldroles))) THEN RETURN 'SUPER_ADMIN_REQUIRED'; END IF;
 IF p.scope='live' AND lower(p.email)='phafanep@gmail.com' AND NOT ('super_admin'=ANY(requested)) THEN RETURN 'OWNER_ACCESS_PROTECTED'; END IF;
 IF actor=target AND NOT requested @> oldroles THEN RETURN 'SELF_ACCESS_PROTECTED'; END IF;
 UPDATE hub_memberships SET active=false WHERE person_id=target;
 INSERT INTO hub_memberships(person_id,role) SELECT target,unnest(requested) ON CONFLICT(person_id,role) DO UPDATE SET active=true;
 UPDATE hub_people SET version=version+1,updated_at=now() WHERE id=target;
 INSERT INTO hub_role_history(person_id,actor_id,scope,previous_roles,assigned_roles,reason) VALUES(target,actor,a.scope,oldroles,requested,explanation);
 INSERT INTO hub_audit(actor_id,action,resource_type,resource_id,scope) VALUES(actor,'administrator.roles_changed','person',target::text,a.scope);
 UPDATE hub_sessions SET revoked_at=now() WHERE person_id=target AND actor<>target AND revoked_at IS NULL;
 RETURN 'OK';
END $$;
