-- Hotels and companies settings (spec: stage-1-hotels-and-companies.md). Additive only: new columns
-- have defaults or are nullable, so code from before this migration keeps working.
CREATE TYPE "public"."file_upload_status" AS ENUM('pending', 'confirmed', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "file_uploads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid,
	"purpose" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"status" "file_upload_status" DEFAULT 'pending' NOT NULL,
	"width" integer,
	"height" integer,
	"created_by_member_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_uploads_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "file_uploads_byte_size_positive" CHECK ("file_uploads"."byte_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "pending_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "pending_entity_from" date;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "logo_upload_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_uploads_organization_id_index" ON "file_uploads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "file_uploads_property_id_index" ON "file_uploads" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "file_uploads_status_created_at_index" ON "file_uploads" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_logo_upload_id_file_uploads_id_fk" FOREIGN KEY ("logo_upload_id") REFERENCES "public"."file_uploads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- The unique key comes first: the composite foreign key below references it.
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_pending_entity_fk" FOREIGN KEY ("organization_id","pending_entity_id") REFERENCES "public"."entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_organization_id_lower_name_unique" ON "entities" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "entities_organization_id_rc_number_unique" ON "entities" USING btree ("organization_id","rc_number") WHERE "entities"."rc_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_organization_id_tin_digits_unique" ON "entities" USING btree ("organization_id",regexp_replace("tin", '[^0-9]', '', 'g')) WHERE "entities"."tin" is not null;--> statement-breakpoint
CREATE INDEX "properties_pending_entity_id_index" ON "properties" USING btree ("pending_entity_id") WHERE "properties"."pending_entity_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "properties_organization_id_lower_name_unique" ON "properties" USING btree ("organization_id",lower("name"));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_pending_entity_complete" CHECK (("properties"."pending_entity_id" is null) = ("properties"."pending_entity_from" is null));