-- Trigram search on guest names, phones, emails and reservation numbers.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."discount_reason" AS ENUM('repeat_guest', 'corporate_rate_match', 'long_stay', 'service_recovery', 'other');--> statement-breakpoint
CREATE TYPE "public"."night_price_from" AS ENUM('date_price', 'standard_price');--> statement-breakpoint
CREATE TYPE "public"."reservation_guarantee" AS ENUM('none', 'deposit');--> statement-breakpoint
CREATE TYPE "public"."reservation_source" AS ENUM('direct', 'walk_in', 'phone', 'email', 'whatsapp', 'booking_engine', 'ota', 'corporate', 'travel_agent');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."stay_status" AS ENUM('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"email" text,
	"nationality" char(2) DEFAULT 'NG' NOT NULL,
	"search" text GENERATED ALWAYS AS (lower(first_name || ' ' || last_name || ' ' || coalesce(phone, '') || ' ' || coalesce(email, ''))) STORED NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "guests_contact" CHECK ("guests"."phone" is not null or "guests"."email" is not null),
	CONSTRAINT "guests_phone_e164" CHECK ("guests"."phone" is null or "guests"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "guests_names" CHECK (char_length("guests"."first_name") between 1 and 60 and char_length("guests"."last_name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "reservation_counters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"period" char(4) NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_counters_property_period_unique" UNIQUE("property_id","period")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "reservation_status" NOT NULL,
	"source" "reservation_source" NOT NULL,
	"guest_id" uuid NOT NULL,
	"guarantee" "reservation_guarantee" NOT NULL,
	"deposit_due" numeric(14, 2),
	"deposit_due_at" timestamp with time zone,
	"quoted_total" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"notes" text,
	"booked_by_member_id" uuid NOT NULL,
	"booked_by_name" text NOT NULL,
	"device_id" uuid,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"booked_on_business_date" date NOT NULL,
	"arrival" date NOT NULL,
	"departure" date NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_organization_id_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "reservations_organization_id_idempotency_key_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "reservations_property_id_id_unique" UNIQUE("property_id","id"),
	CONSTRAINT "reservations_dates" CHECK ("reservations"."departure" > "reservations"."arrival"),
	CONSTRAINT "reservations_deposit_complete" CHECK (("reservations"."deposit_due" is null) = ("reservations"."deposit_due_at" is null)),
	CONSTRAINT "reservations_notes_length" CHECK ("reservations"."notes" is null or char_length("reservations"."notes") <= 500)
);
--> statement-breakpoint
CREATE TABLE "room_type_inventory" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"booked" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_type_inventory_type_date_unique" UNIQUE("room_type_id","date"),
	CONSTRAINT "room_type_inventory_booked" CHECK ("room_type_inventory"."booked" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stay_nights" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"date" date NOT NULL,
	"plan_price" numeric(14, 2) NOT NULL,
	"sold_price" numeric(14, 2) NOT NULL,
	"extra_adult" numeric(14, 2) NOT NULL,
	"meal_allocation" numeric(14, 2) NOT NULL,
	"price_from" "night_price_from" NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_nights_stay_date_unique" UNIQUE("stay_id","date"),
	CONSTRAINT "stay_nights_prices" CHECK ("stay_nights"."sold_price" > 0 and "stay_nights"."sold_price" <= "stay_nights"."plan_price" and "stay_nights"."sold_price" >= "stay_nights"."meal_allocation")
);
--> statement-breakpoint
CREATE TABLE "stays" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"rate_plan_version" integer NOT NULL,
	"arrival" date NOT NULL,
	"departure" date NOT NULL,
	"adults" smallint NOT NULL,
	"children" smallint DEFAULT 0 NOT NULL,
	"room_id" uuid,
	"status" "stay_status" NOT NULL,
	"quote_hash" text NOT NULL,
	"terms" jsonb NOT NULL,
	"cancellation_deadline" timestamp with time zone,
	"quoted_total" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"discount_percent" numeric(7, 4),
	"discount_rate" numeric(14, 2),
	"discount_reason" "discount_reason",
	"discount_reason_text" text,
	"discount_note" text,
	"discount_by_member_id" uuid,
	"discount_by_name" text,
	"restriction_override" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stays_property_id_id_unique" UNIQUE("property_id","id"),
	CONSTRAINT "stays_dates" CHECK ("stays"."departure" > "stays"."arrival"),
	CONSTRAINT "stays_party" CHECK ("stays"."adults" >= 1 and "stays"."children" >= 0),
	CONSTRAINT "stays_discount_percent" CHECK ("stays"."discount_percent" is null or ("stays"."discount_percent" > 0 and "stays"."discount_percent" < 100)),
	CONSTRAINT "stays_discount_reason" CHECK (("stays"."discount_percent" is null) = ("stays"."discount_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "overbooking_limit" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "booking_prefix" text;--> statement-breakpoint
-- Existing hotels get the first three letters of what follows the brand word ("Kora Lekki" → LEK),
-- with a letter added on a clash within the group (LEKA). Editable until the first reservation.
WITH base AS (
  SELECT id, organization_id,
    left(upper(regexp_replace(
      CASE WHEN position(' ' in trim(name)) > 0 THEN substr(trim(name), position(' ' in trim(name)) + 1) ELSE name END,
      '[^A-Za-z]', '', 'g')), 3) AS prefix
  FROM "properties"
), padded AS (
  SELECT id, organization_id,
    CASE WHEN length(prefix) >= 2 THEN prefix ELSE left(prefix || 'HTL', 3) END AS prefix
  FROM base
), numbered AS (
  SELECT id, prefix, row_number() OVER (PARTITION BY organization_id, prefix ORDER BY id) AS n
  FROM padded
)
UPDATE "properties" p
SET booking_prefix = CASE WHEN n = 1 THEN numbered.prefix ELSE numbered.prefix || chr(63 + n::int) END
FROM numbered WHERE numbered.id = p.id;--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "booking_prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_counters" ADD CONSTRAINT "reservation_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_counters" ADD CONSTRAINT "reservation_counters_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_booked_by_member_id_members_id_fk" FOREIGN KEY ("booked_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_fk" FOREIGN KEY ("organization_id","guest_id") REFERENCES "public"."guests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_inventory" ADD CONSTRAINT "room_type_inventory_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_inventory" ADD CONSTRAINT "room_type_inventory_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_inventory" ADD CONSTRAINT "room_type_inventory_room_type_fk" FOREIGN KEY ("property_id","room_type_id") REFERENCES "public"."room_types"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_nights" ADD CONSTRAINT "stay_nights_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_nights" ADD CONSTRAINT "stay_nights_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_nights" ADD CONSTRAINT "stay_nights_stay_fk" FOREIGN KEY ("property_id","stay_id") REFERENCES "public"."stays"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_discount_by_member_id_members_id_fk" FOREIGN KEY ("discount_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_reservation_fk" FOREIGN KEY ("property_id","reservation_id") REFERENCES "public"."reservations"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_guest_fk" FOREIGN KEY ("organization_id","guest_id") REFERENCES "public"."guests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_type_fk" FOREIGN KEY ("property_id","room_type_id") REFERENCES "public"."room_types"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_rate_plan_fk" FOREIGN KEY ("property_id","rate_plan_id") REFERENCES "public"."rate_plans"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_fk" FOREIGN KEY ("property_id","room_id") REFERENCES "public"."rooms"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guests_organization_id_index" ON "guests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "guests_organization_id_phone_index" ON "guests" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE INDEX "guests_organization_id_lower_email_index" ON "guests" USING btree ("organization_id",lower("email"));--> statement-breakpoint
CREATE INDEX "guests_search_trgm_index" ON "guests" USING gin ("search" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "reservation_counters_organization_id_index" ON "reservation_counters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reservations_organization_id_property_id_arrival_index" ON "reservations" USING btree ("organization_id","property_id","arrival");--> statement-breakpoint
CREATE INDEX "reservations_organization_id_property_id_booked_on_business_date_index" ON "reservations" USING btree ("organization_id","property_id","booked_on_business_date");--> statement-breakpoint
CREATE INDEX "reservations_organization_id_property_id_status_index" ON "reservations" USING btree ("organization_id","property_id","status");--> statement-breakpoint
CREATE INDEX "reservations_guest_id_index" ON "reservations" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "reservations_number_trgm_index" ON "reservations" USING gin ("number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "room_type_inventory_organization_id_property_id_date_index" ON "room_type_inventory" USING btree ("organization_id","property_id","date");--> statement-breakpoint
CREATE INDEX "stay_nights_organization_id_property_id_date_index" ON "stay_nights" USING btree ("organization_id","property_id","date");--> statement-breakpoint
CREATE INDEX "stays_organization_id_property_id_arrival_index" ON "stays" USING btree ("organization_id","property_id","arrival");--> statement-breakpoint
CREATE INDEX "stays_organization_id_property_id_departure_index" ON "stays" USING btree ("organization_id","property_id","departure");--> statement-breakpoint
CREATE INDEX "stays_reservation_id_index" ON "stays" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "stays_guest_id_index" ON "stays" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "stays_rate_plan_id_index" ON "stays" USING btree ("rate_plan_id");--> statement-breakpoint
CREATE INDEX "stays_room_type_id_index" ON "stays" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "stays_room_id_index" ON "stays" USING btree ("room_id") WHERE "stays"."room_id" is not null;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_booking_prefix_unique" UNIQUE("organization_id","booking_prefix");--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_overbooking_limit" CHECK ("room_types"."overbooking_limit" >= 0);--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_booking_prefix_format" CHECK ("properties"."booking_prefix" ~ '^[A-Z]{2,4}$');