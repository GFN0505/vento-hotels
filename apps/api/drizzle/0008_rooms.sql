CREATE TYPE "public"."room_bed" AS ENUM('king', 'queen', 'double', 'twin', 'single');--> statement-breakpoint
CREATE TYPE "public"."room_front_office_status" AS ENUM('vacant', 'occupied');--> statement-breakpoint
CREATE TYPE "public"."room_housekeeping_status" AS ENUM('clean', 'inspected', 'dirty', 'out_of_order', 'out_of_service');--> statement-breakpoint
CREATE TABLE "room_connections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_a_id" uuid NOT NULL,
	"room_b_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_connections_pair_unique" UNIQUE("room_a_id","room_b_id"),
	CONSTRAINT "room_connections_ordered" CHECK ("room_connections"."room_a_id" < "room_connections"."room_b_id")
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"bed" "room_bed" NOT NULL,
	"sofa_bed" boolean DEFAULT false NOT NULL,
	"base_occupancy" smallint DEFAULT 2 NOT NULL,
	"max_adults" smallint DEFAULT 2 NOT NULL,
	"max_children" smallint DEFAULT 0 NOT NULL,
	"size_sqm" numeric(6, 1),
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_types_property_id_code_unique" UNIQUE("property_id","code"),
	CONSTRAINT "room_types_property_id_id_unique" UNIQUE("property_id","id"),
	CONSTRAINT "room_types_code_format" CHECK ("room_types"."code" ~ '^[A-Z0-9]{2,6}$'),
	CONSTRAINT "room_types_name_length" CHECK (char_length("room_types"."name") between 1 and 60),
	CONSTRAINT "room_types_occupancy" CHECK ("room_types"."max_adults" >= 1 and "room_types"."max_children" >= 0 and "room_types"."base_occupancy" between 1 and "room_types"."max_adults" + "room_types"."max_children"),
	CONSTRAINT "room_types_size_positive" CHECK ("room_types"."size_sqm" is null or "room_types"."size_sqm" > 0)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"number" text NOT NULL,
	"floor" smallint NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"accessible" boolean DEFAULT false NOT NULL,
	"front_office_status" "room_front_office_status" DEFAULT 'vacant' NOT NULL,
	"housekeeping_status" "room_housekeeping_status" DEFAULT 'dirty' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_property_id_number_unique" UNIQUE("property_id","number"),
	CONSTRAINT "rooms_property_id_id_unique" UNIQUE("property_id","id"),
	CONSTRAINT "rooms_number_format" CHECK ("rooms"."number" ~ '^[A-Z0-9-]{1,10}$'),
	CONSTRAINT "rooms_floor_range" CHECK ("rooms"."floor" between -9 and 199)
);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "live_since" date;--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_room_a_fk" FOREIGN KEY ("property_id","room_a_id") REFERENCES "public"."rooms"("property_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_room_b_fk" FOREIGN KEY ("property_id","room_b_id") REFERENCES "public"."rooms"("property_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_fk" FOREIGN KEY ("property_id","room_type_id") REFERENCES "public"."room_types"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_connections_organization_id_index" ON "room_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "room_connections_room_b_id_index" ON "room_connections" USING btree ("room_b_id");--> statement-breakpoint
CREATE INDEX "room_types_organization_id_index" ON "room_types" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "room_types_organization_id_property_id_sort_order_index" ON "room_types" USING btree ("organization_id","property_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "room_types_active_name_unique" ON "room_types" USING btree ("property_id",lower("name")) WHERE "room_types"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "rooms_organization_id_index" ON "rooms" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rooms_organization_id_property_id_floor_number_index" ON "rooms" USING btree ("organization_id","property_id","floor","number");--> statement-breakpoint
CREATE INDEX "rooms_active_room_type_id_index" ON "rooms" USING btree ("room_type_id") WHERE "rooms"."archived_at" is null;