-- Re-create the polymorphic FKs (restores the original — broken — init state).
-- NOTE: with both constraints present, every insert into accompanying_rangers
-- violates one of the two FKs. Provided only for migration symmetry; do not
-- apply unless rolling back the entire feature.
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_ranger_event_fk" FOREIGN KEY ("entity_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_ranger_patrol_fk" FOREIGN KEY ("entity_id") REFERENCES "patrols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
