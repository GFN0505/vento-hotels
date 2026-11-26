CREATE TYPE "public"."cancellation_kind" AS ENUM('free_until', 'non_refundable');--> statement-breakpoint
CREATE TYPE "public"."cancellation_penalty" AS ENUM('first_night', 'percent_of_stay', 'full_stay');--> statement-breakpoint
CREATE TYPE "public"."deposit_due" AS ENUM('at_booking', 'within_hours');--> statement-breakpoint
CREATE TYPE "public"."deposit_kind" AS ENUM('none', 'first_night', 'percent_of_stay', 'full_stay');--> statement-breakpoint
CREATE TYPE "public"."meal_plan" AS ENUM('room_only', 'bed_breakfast', 'half_board', 'full_board');--> statement-breakpoint
CREATE TYPE "public"."rate_bookable_by" AS ENUM('anyone', 'corporate_only');--> statement-breakpoint
CREATE TYPE "public"."rate_pricing" AS ENUM('own', 'derived');--> statement-breakpoint
CREATE TABLE "rate_dates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"price" numeric(14, 2),
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"closed_to_arrival" boolean DEFAULT false NOT NULL,
	"min_stay" smallint,
	"season_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_dates_plan_type_date_unique" UNIQUE("rate_plan_id","room_type_id","date"),
	CONSTRAINT "rate_dates_currency_ngn" CHECK ("rate_dates"."currency" = 'NGN'),
	CONSTRAINT "rate_dates_price" CHECK ("rate_dates"."price" is null or ("rate_dates"."price" > 0 and "rate_dates"."price" <= 100000000 and "rate_dates"."price" = trunc("rate_dates"."price"))),
	CONSTRAINT "rate_dates_min_stay" CHECK ("rate_dates"."min_stay" is null or "rate_dates"."min_stay" between 1 and 30),
	CONSTRAINT "rate_dates_season_name" CHECK ("rate_dates"."season_name" is null or char_length("rate_dates"."season_name") between 1 and 40),
	CONSTRAINT "rate_dates_not_empty" CHECK ("rate_dates"."price" is not null or "rate_dates"."closed" or "rate_dates"."closed_to_arrival" or "rate_dates"."min_stay" is not null or "rate_dates"."season_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "rate_plan_room_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"weekday_price" numeric(14, 2),
	"weekend_price" numeric(14, 2),
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_plan_room_types_plan_type_unique" UNIQUE("rate_plan_id","room_type_id"),
	CONSTRAINT "rate_plan_room_types_property_plan_type_unique" UNIQUE("property_id","rate_plan_id","room_type_id"),
	CONSTRAINT "rate_plan_room_types_currency_ngn" CHECK ("rate_plan_room_types"."currency" = 'NGN'),
	CONSTRAINT "rate_plan_room_types_prices" CHECK (("rate_plan_room_types"."weekday_price" is null or ("rate_plan_room_types"."weekday_price" > 0 and "rate_plan_room_types"."weekday_price" <= 100000000 and "rate_plan_room_types"."weekday_price" = trunc("rate_plan_room_types"."weekday_price")))
        and ("rate_plan_room_types"."weekend_price" is null or ("rate_plan_room_types"."weekday_price" is not null and "rate_plan_room_types"."weekend_price" > 0 and "rate_plan_room_types"."weekend_price" <= 100000000 and "rate_plan_room_types"."weekend_price" = trunc("rate_plan_room_types"."weekend_price"))))
);
--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"pricing" "rate_pricing" NOT NULL,
	"parent_id" uuid,
	"adjustment_percent" numeric(7, 4),
	"adjustment_amount" numeric(14, 2),
	"meal_plan" "meal_plan" DEFAULT 'room_only' NOT NULL,
	"meal_allocation" numeric(14, 2),
	"cancellation_kind" "cancellation_kind" NOT NULL,
	"cancellation_hours" smallint,
	"cancellation_penalty" "cancellation_penalty",
	"cancellation_percent" numeric(7, 4),
	"deposit_kind" "deposit_kind" NOT NULL,
	"deposit_percent" numeric(7, 4),
	"deposit_due" "deposit_due",
	"deposit_due_hours" smallint,
	"min_stay" smallint DEFAULT 1 NOT NULL,
	"extra_adult" numeric(14, 2),
	"bookable_by" "rate_bookable_by" DEFAULT 'anyone' NOT NULL,
	"prices_include_taxes" boolean DEFAULT false NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_plans_property_id_id_unique" UNIQUE("property_id","id"),
	CONSTRAINT "rate_plans_property_id_code_unique" UNIQUE("property_id","code"),
	CONSTRAINT "rate_plans_code_format" CHECK ("rate_plans"."code" ~ '^[A-Z0-9-]{2,10}$'),
	CONSTRAINT "rate_plans_name_length" CHECK (char_length("rate_plans"."name") between 1 and 60),
	CONSTRAINT "rate_plans_currency_ngn" CHECK ("rate_plans"."currency" = 'NGN'),
	CONSTRAINT "rate_plans_pricing" CHECK (("rate_plans"."pricing" = 'own' and "rate_plans"."parent_id" is null and "rate_plans"."adjustment_percent" is null and "rate_plans"."adjustment_amount" is null)
        or ("rate_plans"."pricing" = 'derived' and "rate_plans"."parent_id" is not null and "rate_plans"."parent_id" <> "rate_plans"."id"
          and ("rate_plans"."adjustment_percent" is null) <> ("rate_plans"."adjustment_amount" is null) and "rate_plans"."extra_adult" is null)),
	CONSTRAINT "rate_plans_adjustment_range" CHECK (("rate_plans"."adjustment_percent" is null or "rate_plans"."adjustment_percent" between -90 and 100)
        and ("rate_plans"."adjustment_amount" is null or ("rate_plans"."adjustment_amount" = trunc("rate_plans"."adjustment_amount") and abs("rate_plans"."adjustment_amount") <= 100000000))),
	CONSTRAINT "rate_plans_meal_allocation" CHECK (("rate_plans"."meal_plan" = 'room_only') = ("rate_plans"."meal_allocation" is null)
        and ("rate_plans"."meal_allocation" is null or "rate_plans"."meal_allocation" > 0)),
	CONSTRAINT "rate_plans_cancellation" CHECK (("rate_plans"."cancellation_kind" = 'non_refundable' and "rate_plans"."cancellation_hours" is null and "rate_plans"."cancellation_penalty" is null and "rate_plans"."cancellation_percent" is null)
        or ("rate_plans"."cancellation_kind" = 'free_until' and "rate_plans"."cancellation_hours" between 0 and 720 and "rate_plans"."cancellation_penalty" is not null
          and ("rate_plans"."cancellation_penalty" = 'percent_of_stay') = ("rate_plans"."cancellation_percent" is not null))),
	CONSTRAINT "rate_plans_deposit" CHECK (("rate_plans"."deposit_kind" = 'none' and "rate_plans"."deposit_due" is null and "rate_plans"."deposit_percent" is null and "rate_plans"."deposit_due_hours" is null)
        or ("rate_plans"."deposit_kind" <> 'none' and "rate_plans"."deposit_due" is not null
          and ("rate_plans"."deposit_kind" = 'percent_of_stay') = ("rate_plans"."deposit_percent" is not null)
          and ("rate_plans"."deposit_due" = 'within_hours') = ("rate_plans"."deposit_due_hours" is not null))),
	CONSTRAINT "rate_plans_percent_range" CHECK (("rate_plans"."cancellation_percent" is null or "rate_plans"."cancellation_percent" between 0.01 and 100)
        and ("rate_plans"."deposit_percent" is null or "rate_plans"."deposit_percent" between 0.01 and 100)),
	CONSTRAINT "rate_plans_min_stay" CHECK ("rate_plans"."min_stay" between 1 and 30),
	CONSTRAINT "rate_plans_extra_adult" CHECK ("rate_plans"."extra_adult" is null or "rate_plans"."extra_adult" > 0)
);
--> statement-breakpoint
ALTER TABLE "rate_dates" ADD CONSTRAINT "rate_dates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_dates" ADD CONSTRAINT "rate_dates_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_dates" ADD CONSTRAINT "rate_dates_plan_room_type_fk" FOREIGN KEY ("property_id","rate_plan_id","room_type_id") REFERENCES "public"."rate_plan_room_types"("property_id","rate_plan_id","room_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_room_types" ADD CONSTRAINT "rate_plan_room_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_room_types" ADD CONSTRAINT "rate_plan_room_types_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_room_types" ADD CONSTRAINT "rate_plan_room_types_plan_fk" FOREIGN KEY ("property_id","rate_plan_id") REFERENCES "public"."rate_plans"("property_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_room_types" ADD CONSTRAINT "rate_plan_room_types_room_type_fk" FOREIGN KEY ("property_id","room_type_id") REFERENCES "public"."room_types"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_parent_fk" FOREIGN KEY ("property_id","parent_id") REFERENCES "public"."rate_plans"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_dates_organization_id_index" ON "rate_dates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rate_dates_organization_id_property_id_date_index" ON "rate_dates" USING btree ("organization_id","property_id","date");--> statement-breakpoint
CREATE INDEX "rate_plan_room_types_organization_id_index" ON "rate_plan_room_types" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rate_plan_room_types_room_type_id_index" ON "rate_plan_room_types" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "rate_plans_organization_id_index" ON "rate_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rate_plans_organization_id_property_id_sort_order_index" ON "rate_plans" USING btree ("organization_id","property_id","sort_order");--> statement-breakpoint
CREATE INDEX "rate_plans_parent_id_index" ON "rate_plans" USING btree ("parent_id") WHERE "rate_plans"."parent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_plans_active_name_unique" ON "rate_plans" USING btree ("property_id",lower("name")) WHERE "rate_plans"."archived_at" is null;