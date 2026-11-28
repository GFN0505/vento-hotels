-- Cashier shifts (spec: docs/specs/stage-1-cashier-shifts.md). Drawer terminals point at a
-- terminal of the same hotel, so pos_terminals gets a (property_id, id) key first.
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_property_id_id_unique" UNIQUE("property_id","id");--> statement-breakpoint
CREATE TYPE "public"."cash_count_line_kind" AS ENUM('cash', 'pos_terminal', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."cashier_shift_status" AS ENUM('open', 'counted', 'closed');--> statement-breakpoint
ALTER TYPE "public"."approval_kind" ADD VALUE 'cash_variance';--> statement-breakpoint
CREATE TABLE "cash_drawer_terminals" (
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"drawer_id" uuid NOT NULL,
	"pos_terminal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_drawer_terminals_drawer_id_pos_terminal_id_pk" PRIMARY KEY("drawer_id","pos_terminal_id")
);
--> statement-breakpoint
CREATE TABLE "cash_drawers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_drawers_property_id_id_unique" UNIQUE("property_id","id"),
	CONSTRAINT "cash_drawers_name_length" CHECK (char_length("cash_drawers"."name") between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "cashier_shift_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"kind" "cash_count_line_kind" NOT NULL,
	"currency" char(3) NOT NULL,
	"pos_terminal_id" uuid,
	"notes" jsonb,
	"counted" numeric(14, 2) NOT NULL,
	"expected" numeric(14, 2) NOT NULL,
	"difference" numeric(14, 2) NOT NULL,
	"fx_rate" numeric(14, 4),
	"fx_source" "fx_rate_source",
	"fx_rate_date" date,
	"counted_ngn" numeric(14, 2) NOT NULL,
	"expected_ngn" numeric(14, 2) NOT NULL,
	"difference_ngn" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashier_shift_count_lines_currency" CHECK ("cashier_shift_count_lines"."currency" in ('NGN','USD','GBP','EUR')),
	CONSTRAINT "cashier_shift_count_lines_terminal" CHECK (("cashier_shift_count_lines"."kind" = 'pos_terminal') = ("cashier_shift_count_lines"."pos_terminal_id" is not null)),
	CONSTRAINT "cashier_shift_count_lines_fx" CHECK (("cashier_shift_count_lines"."currency" <> 'NGN' or "cashier_shift_count_lines"."fx_rate" is null) and ("cashier_shift_count_lines"."fx_rate" is null) = ("cashier_shift_count_lines"."fx_rate_date" is null) and ("cashier_shift_count_lines"."fx_rate" is null) = ("cashier_shift_count_lines"."fx_source" is null)),
	CONSTRAINT "cashier_shift_count_lines_counted" CHECK ("cashier_shift_count_lines"."counted" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cashier_shifts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"drawer_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"business_date" date NOT NULL,
	"member_id" uuid NOT NULL,
	"member_name" text NOT NULL,
	"device_id" uuid,
	"device_name" text,
	"status" "cashier_shift_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"opening_float" numeric(14, 2) NOT NULL,
	"opening_notes" jsonb NOT NULL,
	"handover_from_shift_id" uuid,
	"handover_from_name" text,
	"handover_expected" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"handover_difference" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"handover_reason" text,
	"handover_approval_id" uuid,
	"terminal_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"counted_at" timestamp with time zone,
	"counted_business_date" date,
	"cash_counted" numeric(14, 2),
	"total_difference" numeric(14, 2),
	"closed_at" timestamp with time zone,
	"closed_business_date" date,
	"close_reason" text,
	"close_approval_id" uuid,
	"float_kept" numeric(14, 2),
	"drop_ngn" numeric(14, 2),
	"drop_bag_number" text,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"open_idempotency_key" uuid NOT NULL,
	"count_idempotency_key" uuid,
	"close_idempotency_key" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashier_shifts_property_id_id_unique" UNIQUE("property_id","id"),
	CONSTRAINT "cashier_shifts_number_unique" UNIQUE("property_id","business_date","number"),
	CONSTRAINT "cashier_shifts_open_key_unique" UNIQUE("organization_id","open_idempotency_key"),
	CONSTRAINT "cashier_shifts_count_key_unique" UNIQUE("organization_id","count_idempotency_key"),
	CONSTRAINT "cashier_shifts_close_key_unique" UNIQUE("organization_id","close_idempotency_key"),
	CONSTRAINT "cashier_shifts_number_positive" CHECK ("cashier_shifts"."number" >= 1),
	CONSTRAINT "cashier_shifts_float_non_negative" CHECK ("cashier_shifts"."opening_float" >= 0),
	CONSTRAINT "cashier_shifts_handover_reason" CHECK ("cashier_shifts"."handover_difference" = 0 or "cashier_shifts"."handover_reason" is not null),
	CONSTRAINT "cashier_shifts_counted_complete" CHECK ("cashier_shifts"."status" = 'open' or ("cashier_shifts"."counted_at" is not null and "cashier_shifts"."counted_business_date" is not null and "cashier_shifts"."cash_counted" is not null and "cashier_shifts"."total_difference" is not null)),
	CONSTRAINT "cashier_shifts_closed_complete" CHECK ("cashier_shifts"."status" <> 'closed' or ("cashier_shifts"."closed_at" is not null and "cashier_shifts"."closed_business_date" is not null and "cashier_shifts"."float_kept" is not null and "cashier_shifts"."drop_ngn" is not null)),
	CONSTRAINT "cashier_shifts_close_reason" CHECK ("cashier_shifts"."status" <> 'closed' or "cashier_shifts"."total_difference" = 0 or "cashier_shifts"."close_reason" is not null),
	CONSTRAINT "cashier_shifts_float_kept" CHECK ("cashier_shifts"."float_kept" is null or ("cashier_shifts"."float_kept" >= 0 and "cashier_shifts"."float_kept" <= "cashier_shifts"."cash_counted")),
	CONSTRAINT "cashier_shifts_bag_number" CHECK ("cashier_shifts"."drop_bag_number" is null or "cashier_shifts"."drop_bag_number" ~ '^[A-Z0-9-]{1,20}$'),
	CONSTRAINT "cashier_shifts_currency" CHECK ("cashier_shifts"."currency" = 'NGN')
);
--> statement-breakpoint
ALTER TABLE "cash_drawer_terminals" ADD CONSTRAINT "cash_drawer_terminals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_terminals" ADD CONSTRAINT "cash_drawer_terminals_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_terminals" ADD CONSTRAINT "cash_drawer_terminals_drawer_fk" FOREIGN KEY ("property_id","drawer_id") REFERENCES "public"."cash_drawers"("property_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_terminals" ADD CONSTRAINT "cash_drawer_terminals_terminal_fk" FOREIGN KEY ("property_id","pos_terminal_id") REFERENCES "public"."pos_terminals"("property_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shift_count_lines" ADD CONSTRAINT "cashier_shift_count_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shift_count_lines" ADD CONSTRAINT "cashier_shift_count_lines_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shift_count_lines" ADD CONSTRAINT "cashier_shift_count_lines_shift_fk" FOREIGN KEY ("property_id","shift_id") REFERENCES "public"."cashier_shifts"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_drawer_fk" FOREIGN KEY ("property_id","drawer_id") REFERENCES "public"."cash_drawers"("property_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_drawer_terminals_organization_id_property_id_index" ON "cash_drawer_terminals" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX "cash_drawer_terminals_pos_terminal_id_index" ON "cash_drawer_terminals" USING btree ("pos_terminal_id");--> statement-breakpoint
CREATE INDEX "cash_drawers_organization_id_property_id_index" ON "cash_drawers" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_drawers_name_unique" ON "cash_drawers" USING btree ("property_id",lower("name")) WHERE "cash_drawers"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "cashier_shift_count_lines_organization_id_property_id_index" ON "cashier_shift_count_lines" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX "cashier_shift_count_lines_pos_terminal_id_index" ON "cashier_shift_count_lines" USING btree ("pos_terminal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_shift_count_lines_one_per_line" ON "cashier_shift_count_lines" USING btree ("shift_id","kind","currency",coalesce("pos_terminal_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "cashier_shifts_organization_id_property_id_business_date_index" ON "cashier_shifts" USING btree ("organization_id","property_id","business_date");--> statement-breakpoint
CREATE INDEX "cashier_shifts_organization_id_member_id_index" ON "cashier_shifts" USING btree ("organization_id","member_id");--> statement-breakpoint
CREATE INDEX "cashier_shifts_drawer_id_opened_at_index" ON "cashier_shifts" USING btree ("drawer_id","opened_at");--> statement-breakpoint
CREATE INDEX "cashier_shifts_device_id_index" ON "cashier_shifts" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_shifts_one_per_drawer" ON "cashier_shifts" USING btree ("drawer_id") WHERE "cashier_shifts"."status" <> 'closed';--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_shifts_one_per_member" ON "cashier_shifts" USING btree ("organization_id","member_id") WHERE "cashier_shifts"."status" <> 'closed';--> statement-breakpoint--> statement-breakpoint
-- Count lines are written once, at submit: the snapshot of expected, counted and difference that
-- nobody can change afterwards (Open question 5: no reopen).
CREATE TRIGGER cashier_shift_count_lines_append_only BEFORE UPDATE OR DELETE ON "cashier_shift_count_lines"
  FOR EACH ROW EXECUTE FUNCTION vento_forbid_update_delete();--> statement-breakpoint
-- A shift only moves forward (open → counted → closed), is never deleted, and what was recorded at
-- each step stays as it was: the opening float and hand-over, then the count, then the close.
CREATE OR REPLACE FUNCTION vento_cashier_shift_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cashier shifts are never deleted.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'open' AND NEW.status = 'counted') OR (OLD.status = 'counted' AND NEW.status = 'closed')
  ) THEN
    RAISE EXCEPTION 'A cashier shift can''t go from % to %.', OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.opening_float <> OLD.opening_float OR NEW.opening_notes <> OLD.opening_notes
    OR NEW.member_id <> OLD.member_id OR NEW.drawer_id <> OLD.drawer_id
    OR NEW.number <> OLD.number OR NEW.business_date <> OLD.business_date
    OR NEW.opened_at <> OLD.opened_at
    OR NEW.handover_expected <> OLD.handover_expected
    OR NEW.handover_difference <> OLD.handover_difference
    OR NEW.handover_reason IS DISTINCT FROM OLD.handover_reason
    OR NEW.handover_approval_id IS DISTINCT FROM OLD.handover_approval_id THEN
    RAISE EXCEPTION 'A cashier shift''s opening can''t be changed.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'open' AND (
    NEW.counted_at IS DISTINCT FROM OLD.counted_at
    OR NEW.cash_counted IS DISTINCT FROM OLD.cash_counted
    OR NEW.total_difference IS DISTINCT FROM OLD.total_difference
  ) THEN
    RAISE EXCEPTION 'A submitted count can''t be changed.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'closed' AND (
    NEW.closed_at IS DISTINCT FROM OLD.closed_at
    OR NEW.close_reason IS DISTINCT FROM OLD.close_reason
    OR NEW.close_approval_id IS DISTINCT FROM OLD.close_approval_id
    OR NEW.float_kept IS DISTINCT FROM OLD.float_kept
    OR NEW.drop_ngn IS DISTINCT FROM OLD.drop_ngn
    OR NEW.drop_bag_number IS DISTINCT FROM OLD.drop_bag_number
  ) THEN
    RAISE EXCEPTION 'A closed cashier shift can''t be changed.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER cashier_shifts_forward BEFORE UPDATE OR DELETE ON "cashier_shifts"
  FOR EACH ROW EXECUTE FUNCTION vento_cashier_shift_forward();--> statement-breakpoint
-- Every hotel has at least one drawer: Desk 1, with the hotel's active POS terminal when it has
-- exactly one. Creating a hotel creates Desk 1 in the same transaction from now on.
INSERT INTO "cash_drawers" ("organization_id", "property_id", "name")
  SELECT "organization_id", "id", 'Desk 1' FROM "properties";--> statement-breakpoint
INSERT INTO "cash_drawer_terminals" ("organization_id", "property_id", "drawer_id", "pos_terminal_id")
  SELECT d."organization_id", d."property_id", d."id", t."id"
  FROM "cash_drawers" d
  JOIN "pos_terminals" t ON t."property_id" = d."property_id" AND t."archived_at" IS NULL
  WHERE (SELECT count(*) FROM "pos_terminals" x
         WHERE x."property_id" = d."property_id" AND x."archived_at" IS NULL) = 1;
