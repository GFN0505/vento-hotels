CREATE TYPE "public"."penalty_kind" AS ENUM('late_cancellation', 'late_change', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."penalty_status" AS ENUM('to_charge', 'waived', 'charged');--> statement-breakpoint
CREATE TYPE "public"."reservation_change_kind" AS ENUM('modify', 'cancel', 'no_show', 'waive');--> statement-breakpoint
CREATE TYPE "public"."reservation_end_reason" AS ENUM('guest_request', 'company_request', 'deposit_not_paid', 'duplicate', 'other');--> statement-breakpoint
ALTER TYPE "public"."approval_kind" ADD VALUE 'penalty_waiver';--> statement-breakpoint
ALTER TYPE "public"."approval_kind" ADD VALUE 'modify_discount';--> statement-breakpoint
CREATE TABLE "penalties" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"change_id" uuid NOT NULL,
	"kind" "penalty_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"basis" jsonb NOT NULL,
	"business_date" date NOT NULL,
	"status" "penalty_status" DEFAULT 'to_charge' NOT NULL,
	"waived_at" timestamp with time zone,
	"waived_by_member_id" uuid,
	"waived_by_name" text,
	"waiver_reason" text,
	"waiver_business_date" date,
	"approval_id" uuid,
	"approver_member_id" uuid,
	"approver_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "penalties_amount" CHECK ("penalties"."amount" > 0),
	CONSTRAINT "penalties_waived" CHECK (("penalties"."status" = 'waived') = ("penalties"."waived_at" is not null and "penalties"."waived_by_name" is not null and "penalties"."waiver_reason" is not null and "penalties"."waiver_business_date" is not null)),
	CONSTRAINT "penalties_waiver_reason_length" CHECK ("penalties"."waiver_reason" is null or char_length("penalties"."waiver_reason") <= 500)
);
--> statement-breakpoint
CREATE TABLE "reservation_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"stay_id" uuid,
	"kind" "reservation_change_kind" NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"business_date" date NOT NULL,
	"by_member_id" uuid NOT NULL,
	"by_name" text NOT NULL,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_changes_organization_id_idempotency_key_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "reservation_changes_property_id_id_unique" UNIQUE("property_id","id")
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "ended_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "ended_by_name" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "ended_on_business_date" date;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "end_reason" "reservation_end_reason";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "end_reason_text" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "end_note" text;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_reservation_fk" FOREIGN KEY ("property_id","reservation_id") REFERENCES "public"."reservations"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_stay_fk" FOREIGN KEY ("property_id","stay_id") REFERENCES "public"."stays"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_change_fk" FOREIGN KEY ("property_id","change_id") REFERENCES "public"."reservation_changes"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_reservation_fk" FOREIGN KEY ("property_id","reservation_id") REFERENCES "public"."reservations"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "penalties_organization_id_property_id_status_index" ON "penalties" USING btree ("organization_id","property_id","status");--> statement-breakpoint
CREATE INDEX "penalties_organization_id_property_id_business_date_index" ON "penalties" USING btree ("organization_id","property_id","business_date");--> statement-breakpoint
CREATE INDEX "penalties_reservation_id_index" ON "penalties" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "penalties_stay_id_index" ON "penalties" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "penalties_change_id_index" ON "penalties" USING btree ("change_id");--> statement-breakpoint
CREATE INDEX "reservation_changes_reservation_id_index" ON "reservation_changes" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "reservation_changes_organization_id_property_id_business_date_index" ON "reservation_changes" USING btree ("organization_id","property_id","business_date");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_ended" CHECK (("reservations"."status" in ('cancelled', 'no_show')) = ("reservations"."ended_at" is not null));--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_end_text_length" CHECK (("reservations"."end_reason_text" is null or char_length("reservations"."end_reason_text") <= 200) and ("reservations"."end_note" is null or char_length("reservations"."end_note") <= 500));