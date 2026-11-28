CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "public"."out_of_order_reason" AS ENUM('ac', 'plumbing', 'electrical', 'renovation', 'other');--> statement-breakpoint
CREATE TYPE "public"."out_of_order_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."room_status_outcome" AS ENUM('applied', 'superseded');--> statement-breakpoint
ALTER TYPE "public"."discount_reason" ADD VALUE 'upgrade';--> statement-breakpoint
ALTER TYPE "public"."reservation_change_kind" ADD VALUE 'room';--> statement-breakpoint
CREATE TABLE "room_out_of_order" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"back_in_service" date NOT NULL,
	"reason" "out_of_order_reason" NOT NULL,
	"reason_text" text,
	"note" text,
	"status" "out_of_order_status" DEFAULT 'active' NOT NULL,
	"business_date" date NOT NULL,
	"by_member_id" uuid NOT NULL,
	"by_name" text NOT NULL,
	"device_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"last_key" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_out_of_order_organization_id_idempotency_key_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "room_out_of_order_dates" CHECK ("room_out_of_order"."back_in_service" > "room_out_of_order"."from_date"),
	CONSTRAINT "room_out_of_order_length" CHECK ("room_out_of_order"."back_in_service" - "room_out_of_order"."from_date" <= 365),
	CONSTRAINT "room_out_of_order_text_length" CHECK (("room_out_of_order"."reason_text" is null or char_length("room_out_of_order"."reason_text") <= 100) and ("room_out_of_order"."note" is null or char_length("room_out_of_order"."note") <= 200)),
	CONSTRAINT "room_out_of_order_other_text" CHECK ("room_out_of_order"."reason" <> 'other' or "room_out_of_order"."reason_text" is not null)
);
--> statement-breakpoint
CREATE TABLE "room_status_commands" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"status" "room_housekeeping_status" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "room_status_outcome" NOT NULL,
	"by_member_id" uuid NOT NULL,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_status_commands_organization_id_idempotency_key_unique" UNIQUE("organization_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "housekeeping_status_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "housekeeping_status_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "housekeeping_status_by_name" text;--> statement-breakpoint
ALTER TABLE "room_out_of_order" ADD CONSTRAINT "room_out_of_order_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_out_of_order" ADD CONSTRAINT "room_out_of_order_by_member_id_members_id_fk" FOREIGN KEY ("by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_out_of_order" ADD CONSTRAINT "room_out_of_order_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_out_of_order" ADD CONSTRAINT "room_out_of_order_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_out_of_order" ADD CONSTRAINT "room_out_of_order_room_fk" FOREIGN KEY ("property_id","room_id") REFERENCES "public"."rooms"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_status_commands" ADD CONSTRAINT "room_status_commands_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_status_commands" ADD CONSTRAINT "room_status_commands_by_member_id_members_id_fk" FOREIGN KEY ("by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_status_commands" ADD CONSTRAINT "room_status_commands_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_status_commands" ADD CONSTRAINT "room_status_commands_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_status_commands" ADD CONSTRAINT "room_status_commands_room_fk" FOREIGN KEY ("property_id","room_id") REFERENCES "public"."rooms"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_out_of_order_organization_id_property_id_from_date_index" ON "room_out_of_order" USING btree ("organization_id","property_id","from_date");--> statement-breakpoint
CREATE INDEX "room_out_of_order_room_id_index" ON "room_out_of_order" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_status_commands_room_id_index" ON "room_status_commands" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_status_commands_organization_id_property_id_index" ON "room_status_commands" USING btree ("organization_id","property_id");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_housekeeping_status_by_member_id_members_id_fk" FOREIGN KEY ("housekeeping_status_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_housekeeping_status_stored" CHECK ("rooms"."housekeeping_status" in ('clean', 'inspected', 'dirty'));;--> statement-breakpoint
-- A room holds at most one confirmed or checked-in stay a night, and one active out-of-order
-- period at a time (tape chart spec, "Availability locking"). The services check under the room's
-- lock first; these are the last line of defence.
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_no_overlap" EXCLUDE USING gist ("room_id" WITH =, daterange("arrival", "departure") WITH &&) WHERE ("status" IN ('confirmed', 'checked_in') AND "room_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "room_out_of_order" ADD CONSTRAINT "room_out_of_order_no_overlap" EXCLUDE USING gist ("room_id" WITH =, daterange("from_date", "back_in_service") WITH &&) WHERE ("status" = 'active');