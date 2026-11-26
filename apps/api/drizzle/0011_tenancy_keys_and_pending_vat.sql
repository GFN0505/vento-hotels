-- Hotels and companies, review fixes: composite tenancy keys for a hotel's company and logo, the
-- uploader's member key, a scheduled VAT registration change per company, and upload purge times.
-- Additive while the app runs: new keys and columns first, the keys they replace dropped last, so
-- there is never a moment without a constraint. Run the preflight in docs/ops/deploy.md first.
--
-- Data step: RC numbers saved before 0010 (e.g. '1184402', 'rc-1184402') take the form the API
-- stores, 'RC 1184402'. Values that aren't an RC number are left for a person to fix.
UPDATE "entities"
SET "rc_number" = coalesce(substring(upper("rc_number") from '^\s*(LLP|RC|BN|IT|LP)'), 'RC') || ' ' || substring("rc_number" from '([0-9]{1,8})\s*$')
WHERE "rc_number" ~* '^\s*(LLP|RC|BN|IT|LP)?[\s.-]*[0-9]{1,8}\s*$'
  AND "rc_number" !~ '^(LLP|RC|BN|IT|LP) [0-9]{1,8}$';--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "pending_vat_registered" boolean;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "pending_vat_from" date;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_pending_vat_complete" CHECK (("entities"."pending_vat_registered" is null) = ("entities"."pending_vat_from" is null));--> statement-breakpoint
ALTER TABLE "file_uploads" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_uploads_created_by_member_id_index" ON "file_uploads" USING btree ("created_by_member_id");--> statement-breakpoint
-- The unique key comes first: the composite foreign key below references it.
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_logo_upload_fk" FOREIGN KEY ("organization_id","logo_upload_id") REFERENCES "public"."file_uploads"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Replaced by the composite keys above and by the lower(name) unique indexes from 0010.
ALTER TABLE "properties" DROP CONSTRAINT "properties_entity_id_entities_id_fk";--> statement-breakpoint
ALTER TABLE "properties" DROP CONSTRAINT "properties_logo_upload_id_file_uploads_id_fk";--> statement-breakpoint
DROP INDEX "entities_organization_id_name_index";--> statement-breakpoint
DROP INDEX "properties_organization_id_name_index";
