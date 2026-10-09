ALTER TABLE hub_notifications ADD COLUMN source_key text;
CREATE UNIQUE INDEX hub_notification_source_idx ON hub_notifications(person_id,scope,source_key) WHERE source_key IS NOT NULL;
CREATE FUNCTION hub_notify_vacancy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='open' AND NEW.closes_at>now() THEN
 INSERT INTO hub_notifications(person_id,scope,title,body,path,source_key)
 SELECT p.id,p.scope,'Career opportunity: '||NEW.title,'A position is available. Review the source advertisement, apply in Citizen Hub, or share its link.','/careers?position='||NEW.id,'vacancy:'||NEW.id
 FROM hub_people p WHERE p.scope=NEW.scope AND p.active AND COALESCE(p.preferences->>'career_updates','true')='true'
 AND EXISTS(SELECT 1 FROM hub_memberships m WHERE m.person_id=p.id AND m.active AND m.role IN('investor','shareholder'))
 ON CONFLICT(person_id,scope,source_key) WHERE source_key IS NOT NULL DO NOTHING;
 END IF;
 RETURN NEW;
END
$$;
CREATE TRIGGER hub_vacancy_notification AFTER INSERT OR UPDATE OF status ON hub_vacancies FOR EACH ROW EXECUTE FUNCTION hub_notify_vacancy();
UPDATE hub_vacancies SET status=status WHERE status='open';
