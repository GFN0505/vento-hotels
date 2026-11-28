CREATE TYPE "public"."id_document_source" AS ENUM('camera', 'upload', 'offline');--> statement-breakpoint
CREATE TYPE "public"."id_document_status" AS ENUM('pending', 'attached', 'archived');--> statement-breakpoint
CREATE TYPE "public"."id_type" AS ENUM('nin', 'passport', 'drivers_licence', 'voters_card', 'ecowas_id');--> statement-breakpoint
CREATE TYPE "public"."port_of_entry" AS ENUM('lagos_mmia', 'abuja_naia', 'port_harcourt_phia', 'kano_makia', 'enugu', 'seme', 'other');--> statement-breakpoint
CREATE TYPE "public"."registration_source" AS ENUM('desk', 'walk_in', 'offline', 'import');--> statement-breakpoint
CREATE TYPE "public"."registration_rule_audience" AS ENUM('all', 'foreign', 'ecowas');--> statement-breakpoint
CREATE TYPE "public"."visa_type" AS ENUM('visa_on_arrival', 'business', 'tourist', 'transit', 'residence_permit', 'other', 'not_required');--> statement-breakpoint
CREATE TYPE "public"."visit_purpose" AS ENUM('business', 'leisure', 'other');--> statement-breakpoint
ALTER TYPE "public"."reservation_change_kind" ADD VALUE 'check_in';--> statement-breakpoint
ALTER TYPE "public"."reservation_change_kind" ADD VALUE 'check_in_undo';--> statement-breakpoint
ALTER TYPE "public"."reservation_change_kind" ADD VALUE 'check_in_reverse';--> statement-breakpoint
CREATE TABLE "guest_id_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"guest_id" uuid,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" "id_document_status" DEFAULT 'pending' NOT NULL,
	"source" "id_document_source" NOT NULL,
	"id_type" "id_type",
	"id_expiry" date,
	"by_member_id" uuid NOT NULL,
	"by_name" text NOT NULL,
	"device_id" uuid,
	"attached_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_id_documents_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "guest_id_documents_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "guest_id_documents_size" CHECK ("guest_id_documents"."byte_size" > 0 and "guest_id_documents"."byte_size" <= 5242880),
	CONSTRAINT "guest_id_documents_attached" CHECK ("guest_id_documents"."status" = 'pending' or ("guest_id_documents"."guest_id" is not null and "guest_id_documents"."attached_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "guest_registrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"guest_id" uuid,
	"lead" boolean NOT NULL,
	"card_number" text,
	"title" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"nationality" char(2) NOT NULL,
	"phone" text,
	"email" text,
	"date_of_birth" date,
	"address_line" text,
	"address_city" text,
	"address_region" text,
	"address_country" char(2),
	"purpose" "visit_purpose",
	"vehicle_plate" text,
	"occupation" text,
	"id_type" "id_type",
	"id_number_cipher" text,
	"id_number_masked" text,
	"id_country" char(2),
	"id_expiry" date,
	"visa_type" "visa_type",
	"visa_type_text" text,
	"visa_number_cipher" text,
	"visa_number_masked" text,
	"visa_valid_until" date,
	"entry_date" date,
	"port_of_entry" "port_of_entry",
	"port_of_entry_text" text,
	"arriving_from" text,
	"next_destination" text,
	"key_id" text,
	"id_document_id" uuid,
	"rule_set_version" text NOT NULL,
	"reused_from_id" uuid,
	"source" "registration_source" NOT NULL,
	"signature" text DEFAULT 'paper' NOT NULL,
	"business_date" date NOT NULL,
	"by_member_id" uuid NOT NULL,
	"by_name" text NOT NULL,
	"device_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_registrations_property_card_unique" UNIQUE("property_id","card_number"),
	CONSTRAINT "guest_registrations_card" CHECK (("guest_registrations"."lead") = ("guest_registrations"."card_number" is not null)),
	CONSTRAINT "guest_registrations_id_number" CHECK (("guest_registrations"."id_number_cipher" is null) = ("guest_registrations"."id_number_masked" is null) and ("guest_registrations"."visa_number_cipher" is null) = ("guest_registrations"."visa_number_masked" is null)),
	CONSTRAINT "guest_registrations_names" CHECK (char_length("guest_registrations"."first_name") between 1 and 60 and char_length("guest_registrations"."last_name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "registration_card_counters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"year" char(4) NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_card_counters_property_year_unique" UNIQUE("property_id","year")
);
--> statement-breakpoint
CREATE TABLE "registration_rule_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scope" text DEFAULT 'federal' NOT NULL,
	"audience" "registration_rule_audience" NOT NULL,
	"field" text NOT NULL,
	"required" boolean NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_rule_templates_unique" UNIQUE("scope","audience","field","effective_from")
);
--> statement-breakpoint
CREATE TABLE "registration_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid,
	"scope" text DEFAULT 'federal' NOT NULL,
	"audience" "registration_rule_audience" NOT NULL,
	"field" text NOT NULL,
	"required" boolean NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_room_segments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_room_segments_dates" CHECK ("stay_room_segments"."to_date" > "stay_room_segments"."from_date")
);
--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "room_from" date;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "checked_in_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "checked_in_by_name" text;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "checked_in_device_id" uuid;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "checked_in_business_date" date;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "card_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guest_id_documents" ADD CONSTRAINT "guest_id_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_id_documents" ADD CONSTRAINT "guest_id_documents_by_member_id_members_id_fk" FOREIGN KEY ("by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_id_documents" ADD CONSTRAINT "guest_id_documents_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_id_documents" ADD CONSTRAINT "guest_id_documents_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_id_documents" ADD CONSTRAINT "guest_id_documents_guest_fk" FOREIGN KEY ("organization_id","guest_id") REFERENCES "public"."guests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_by_member_id_members_id_fk" FOREIGN KEY ("by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_stay_fk" FOREIGN KEY ("property_id","stay_id") REFERENCES "public"."stays"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_reservation_fk" FOREIGN KEY ("property_id","reservation_id") REFERENCES "public"."reservations"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_guest_fk" FOREIGN KEY ("organization_id","guest_id") REFERENCES "public"."guests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_document_fk" FOREIGN KEY ("organization_id","id_document_id") REFERENCES "public"."guest_id_documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_card_counters" ADD CONSTRAINT "registration_card_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_card_counters" ADD CONSTRAINT "registration_card_counters_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_rules" ADD CONSTRAINT "registration_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_rules" ADD CONSTRAINT "registration_rules_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_room_segments" ADD CONSTRAINT "stay_room_segments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_room_segments" ADD CONSTRAINT "stay_room_segments_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_room_segments" ADD CONSTRAINT "stay_room_segments_stay_fk" FOREIGN KEY ("property_id","stay_id") REFERENCES "public"."stays"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_room_segments" ADD CONSTRAINT "stay_room_segments_room_fk" FOREIGN KEY ("property_id","room_id") REFERENCES "public"."rooms"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_room_segments" ADD CONSTRAINT "stay_room_segments_room_type_fk" FOREIGN KEY ("property_id","room_type_id") REFERENCES "public"."room_types"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_id_documents_organization_id_guest_id_created_at_index" ON "guest_id_documents" USING btree ("organization_id","guest_id","created_at");--> statement-breakpoint
CREATE INDEX "guest_id_documents_status_created_at_index" ON "guest_id_documents" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "guest_registrations_organization_id_guest_id_created_at_index" ON "guest_registrations" USING btree ("organization_id","guest_id","created_at");--> statement-breakpoint
CREATE INDEX "guest_registrations_organization_id_property_id_business_date_index" ON "guest_registrations" USING btree ("organization_id","property_id","business_date");--> statement-breakpoint
CREATE INDEX "guest_registrations_stay_id_index" ON "guest_registrations" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "guest_registrations_id_document_id_index" ON "guest_registrations" USING btree ("id_document_id");--> statement-breakpoint
CREATE INDEX "registration_card_counters_organization_id_index" ON "registration_card_counters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "registration_rules_organization_id_index" ON "registration_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "stay_room_segments_stay_id_index" ON "stay_room_segments" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "stay_room_segments_room_id_index" ON "stay_room_segments" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "stay_room_segments_organization_id_property_id_from_date_index" ON "stay_room_segments" USING btree ("organization_id","property_id","from_date");--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_checked_in_by_member_id_members_id_fk" FOREIGN KEY ("checked_in_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_checked_in_device_id_devices_id_fk" FOREIGN KEY ("checked_in_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stays_organization_id_property_id_checked_in_business_date_index" ON "stays" USING btree ("organization_id","property_id","checked_in_business_date");--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_checked_in" CHECK ("stays"."status" <> 'checked_in' or ("stays"."room_id" is not null and "stays"."checked_in_at" is not null and "stays"."checked_in_by_name" is not null and "stays"."checked_in_business_date" is not null));--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_from" CHECK ("stays"."room_from" is null or ("stays"."room_from" >= "stays"."arrival" and "stays"."room_from" < "stays"."departure"));--> statement-breakpoint
-- A room's current stay is protected from `room_from` on (decision 0030): the nights before an
-- in-house move are kept in stay_room_segments, which have their own constraint. The services check
-- under the room's lock first; these are the last line of defence.
ALTER TABLE "stays" DROP CONSTRAINT "stays_room_no_overlap";--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_no_overlap" EXCLUDE USING gist ("room_id" WITH =, daterange(coalesce("room_from", "arrival"), "departure") WITH &&) WHERE ("status" IN ('confirmed', 'checked_in') AND "room_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "stay_room_segments" ADD CONSTRAINT "stay_room_segments_no_overlap" EXCLUDE USING gist ("room_id" WITH =, daterange("from_date", "to_date") WITH &&);--> statement-breakpoint
-- Vento's starting registration rules (front desk spec, question 1): every row To verify against
-- the Immigration Act 2015 and Regulations 2017 and each pilot state's hotel law before go-live.
INSERT INTO "registration_rule_templates" ("scope", "audience", "field", "required", "effective_from", "source") VALUES
('federal', 'all', 'title', false, '2026-01-01', 'To verify: Vento default'),
('federal', 'all', 'name', true, '2026-01-01', 'To verify: Immigration Regulations 2017 reg. 29 (as reported); state hotel licensing laws'),
('federal', 'all', 'nationality', true, '2026-01-01', 'To verify: Immigration Regulations 2017 reg. 29 (as reported)'),
('federal', 'all', 'contact', true, '2026-01-01', 'To verify: Vento default'),
('federal', 'all', 'address', true, '2026-01-01', 'To verify: Immigration Regulations 2017 reg. 29 (as reported); state hotel licensing laws'),
('federal', 'all', 'id_type', true, '2026-01-01', 'To verify: Vento default'),
('federal', 'all', 'id_number', true, '2026-01-01', 'To verify: Vento default'),
('federal', 'all', 'id_document', true, '2026-01-01', 'To verify: the owner, 28 Nov 2026 (front desk spec question 3)'),
('federal', 'all', 'date_of_birth', false, '2026-01-01', 'To verify: Vento default'),
('federal', 'all', 'purpose', false, '2026-01-01', 'To verify: Vento default'),
('federal', 'all', 'vehicle_plate', false, '2026-01-01', 'To verify: Vento default'),
('federal', 'foreign', 'occupation', true, '2026-01-01', 'To verify: Immigration Regulations 2017 reg. 29 (as reported)'),
('federal', 'foreign', 'id_country', true, '2026-01-01', 'To verify: Vento default'),
('federal', 'foreign', 'id_expiry', true, '2026-01-01', 'To verify: Vento default'),
('federal', 'foreign', 'visa_type', true, '2026-01-01', 'To verify: Immigration Act 2015'),
('federal', 'foreign', 'visa_number', true, '2026-01-01', 'To verify: Immigration Act 2015'),
('federal', 'foreign', 'visa_valid_until', true, '2026-01-01', 'To verify: Immigration Act 2015'),
('federal', 'foreign', 'arriving_from', true, '2026-01-01', 'To verify: Vento default'),
('federal', 'foreign', 'next_destination', true, '2026-01-01', 'To verify: Immigration Regulations 2017 reg. 29 (as reported)'),
('federal', 'foreign', 'entry_date', false, '2026-01-01', 'To verify: Vento default'),
('federal', 'foreign', 'port_of_entry', false, '2026-01-01', 'To verify: Vento default');
