CREATE TYPE "public"."fx_rate_source" AS ENUM('cbn', 'market');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'pos_terminal', 'city_ledger', 'card_online');--> statement-breakpoint
CREATE TYPE "public"."tax_base" AS ENUM('net', 'net_plus_service_charge');--> statement-breakpoint
CREATE TYPE "public"."tax_kind" AS ENUM('vat', 'state_tax', 'service_charge');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" char(10) NOT NULL,
	"account_name" text NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "bank_accounts_number_format" CHECK ("bank_accounts"."account_number" ~ '^[0-9]{10}$'),
	CONSTRAINT "bank_accounts_currency" CHECK ("bank_accounts"."currency" in ('NGN','USD','GBP','EUR'))
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"rate_date" date NOT NULL,
	"rate" numeric(14, 4) NOT NULL,
	"source" "fx_rate_source" DEFAULT 'cbn' NOT NULL,
	"entered_by_member_id" uuid,
	"entered_by_name" text NOT NULL,
	"replace_reason" text,
	"superseded_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_currency" CHECK ("fx_rates"."currency" in ('USD','GBP','EUR')),
	CONSTRAINT "fx_rates_positive" CHECK ("fx_rates"."rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_method_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"enabled" boolean NOT NULL,
	"foreign_currencies" text[] DEFAULT '{}'::text[] NOT NULL,
	"guest_transfer_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_method_settings_hotel_method_unique" UNIQUE("property_id","method"),
	CONSTRAINT "payment_method_settings_currencies" CHECK ("payment_method_settings"."foreign_currencies" <@ array['USD','GBP','EUR']::text[]
        and ("payment_method_settings"."method" = 'cash' or cardinality("payment_method_settings"."foreign_currencies") = 0)),
	CONSTRAINT "payment_method_settings_transfer_account" CHECK ("payment_method_settings"."guest_transfer_account_id" is null or "payment_method_settings"."method" = 'bank_transfer'),
	CONSTRAINT "payment_method_settings_online_card_off" CHECK ("payment_method_settings"."method" <> 'card_online' or not "payment_method_settings"."enabled")
);
--> statement-breakpoint
CREATE TABLE "pos_terminals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"terminal_id" text NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_terminals_terminal_id_format" CHECK ("pos_terminals"."terminal_id" ~ '^[A-Z0-9]{1,20}$')
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tax_id" uuid NOT NULL,
	"rate_percent" numeric(7, 4),
	"stop" boolean DEFAULT false NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"base" "tax_base" DEFAULT 'net' NOT NULL,
	"effective_from" date NOT NULL,
	"source" text NOT NULL,
	"reason" text,
	"set_by_member_id" uuid,
	"set_by_name" text NOT NULL,
	"verified_by_member_id" uuid,
	"verified_by_name" text,
	"verified_on" date,
	"verified_source" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_name" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rates_rate_or_stop" CHECK (("tax_rates"."stop" and "tax_rates"."rate_percent" is null)
        or (not "tax_rates"."stop" and "tax_rates"."rate_percent" > 0 and "tax_rates"."rate_percent" <= 100
            and cardinality("tax_rates"."categories") > 0)),
	CONSTRAINT "tax_rates_categories_known" CHECK ("tax_rates"."categories" <@ array['accommodation','food','beverage','events','laundry','other']::text[]),
	CONSTRAINT "tax_rates_verified_complete" CHECK (("tax_rates"."verified_by_name" is null) = ("tax_rates"."verified_on" is null) and ("tax_rates"."verified_on" is null) = ("tax_rates"."verified_source" is null))
);
--> statement-breakpoint
CREATE TABLE "tax_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"state_code" char(2),
	"name" text NOT NULL,
	"paid_to" text,
	"rate_percent" numeric(7, 4) NOT NULL,
	"categories" text[] NOT NULL,
	"base" "tax_base" DEFAULT 'net' NOT NULL,
	"effective_from" date,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_templates_categories_known" CHECK ("tax_templates"."categories" <@ array['accommodation','food','beverage','events','laundry','other']::text[])
);
--> statement-breakpoint
CREATE TABLE "taxes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"name" text NOT NULL,
	"paid_to" text,
	"state_code" char(2),
	"property_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "taxes_scope" CHECK (("taxes"."kind" = 'vat' and "taxes"."state_code" is null and "taxes"."property_id" is null)
        or ("taxes"."kind" = 'state_tax' and "taxes"."state_code" is not null and "taxes"."property_id" is null)
        or ("taxes"."kind" = 'service_charge' and "taxes"."state_code" is null and "taxes"."property_id" is not null)),
	CONSTRAINT "taxes_state_code_format" CHECK ("taxes"."state_code" is null or "taxes"."state_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "taxes_name_length" CHECK (char_length("taxes"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_entered_by_member_id_members_id_fk" FOREIGN KEY ("entered_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_settings" ADD CONSTRAINT "payment_method_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_settings" ADD CONSTRAINT "payment_method_settings_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_settings" ADD CONSTRAINT "payment_method_settings_transfer_account_fk" FOREIGN KEY ("organization_id","guest_transfer_account_id") REFERENCES "public"."bank_accounts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_bank_account_fk" FOREIGN KEY ("organization_id","bank_account_id") REFERENCES "public"."bank_accounts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_set_by_member_id_members_id_fk" FOREIGN KEY ("set_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_verified_by_member_id_members_id_fk" FOREIGN KEY ("verified_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tax_fk" FOREIGN KEY ("organization_id","tax_id") REFERENCES "public"."taxes"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_organization_id_index" ON "bank_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_organization_id_entity_id_index" ON "bank_accounts" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_number_unique" ON "bank_accounts" USING btree ("organization_id",lower("bank_name"),"account_number");--> statement-breakpoint
CREATE INDEX "fx_rates_organization_id_currency_rate_date_index" ON "fx_rates" USING btree ("organization_id","currency","rate_date");--> statement-breakpoint
CREATE INDEX "fx_rates_entered_by_member_id_index" ON "fx_rates" USING btree ("entered_by_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_one_per_date" ON "fx_rates" USING btree ("organization_id","currency","rate_date","source") WHERE "fx_rates"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "payment_method_settings_organization_id_index" ON "payment_method_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_method_settings_guest_transfer_account_id_index" ON "payment_method_settings" USING btree ("guest_transfer_account_id");--> statement-breakpoint
CREATE INDEX "pos_terminals_organization_id_index" ON "pos_terminals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pos_terminals_organization_id_property_id_index" ON "pos_terminals" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX "pos_terminals_bank_account_id_index" ON "pos_terminals" USING btree ("bank_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_terminals_terminal_id_unique" ON "pos_terminals" USING btree ("organization_id","terminal_id");--> statement-breakpoint
CREATE INDEX "tax_rates_organization_id_index" ON "tax_rates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tax_rates_tax_id_effective_from_index" ON "tax_rates" USING btree ("tax_id","effective_from");--> statement-breakpoint
CREATE INDEX "tax_rates_set_by_member_id_index" ON "tax_rates" USING btree ("set_by_member_id");--> statement-breakpoint
CREATE INDEX "tax_rates_verified_by_member_id_index" ON "tax_rates" USING btree ("verified_by_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_one_per_start" ON "tax_rates" USING btree ("tax_id","effective_from") WHERE "tax_rates"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "tax_templates_kind_state_code_index" ON "tax_templates" USING btree ("kind","state_code");--> statement-breakpoint
CREATE INDEX "taxes_organization_id_index" ON "taxes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "taxes_property_id_index" ON "taxes" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxes_one_vat_per_group" ON "taxes" USING btree ("organization_id") WHERE "taxes"."kind" = 'vat';--> statement-breakpoint
CREATE UNIQUE INDEX "taxes_one_service_charge_per_hotel" ON "taxes" USING btree ("property_id") WHERE "taxes"."kind" = 'service_charge';--> statement-breakpoint
CREATE UNIQUE INDEX "taxes_state_tax_name_unique" ON "taxes" USING btree ("organization_id","state_code",lower("name")) WHERE "taxes"."kind" = 'state_tax';--> statement-breakpoint
-- Tax rate versions are never edited in place and never deleted. Only verification and the
-- cancelling of a scheduled version are recorded on the row (spec: "Nothing changes in place").
CREATE FUNCTION vento_tax_rates_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tax rate versions are never deleted' USING ERRCODE = '23001';
  END IF;
  IF (NEW.organization_id, NEW.tax_id, NEW.rate_percent, NEW.stop, NEW.categories, NEW.base,
      NEW.effective_from, NEW.source, NEW.reason, NEW.set_by_member_id, NEW.set_by_name, NEW.created_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.tax_id, OLD.rate_percent, OLD.stop, OLD.categories, OLD.base,
      OLD.effective_from, OLD.source, OLD.reason, OLD.set_by_member_id, OLD.set_by_name, OLD.created_at)
  THEN
    RAISE EXCEPTION 'a tax rate version never changes; schedule a new one' USING ERRCODE = '23001';
  END IF;
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'a cancelled tax rate version never changes' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER tax_rates_guard BEFORE UPDATE OR DELETE ON "tax_rates" FOR EACH ROW EXECUTE FUNCTION vento_tax_rates_guard();
--> statement-breakpoint
-- FX rates are kept for good: a replacement marks the earlier rate superseded, nothing else.
CREATE FUNCTION vento_fx_rates_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FX rates are never deleted' USING ERRCODE = '23001';
  END IF;
  IF (NEW.organization_id, NEW.currency, NEW.rate_date, NEW.rate, NEW.source,
      NEW.entered_by_member_id, NEW.entered_by_name, NEW.replace_reason, NEW.created_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.currency, OLD.rate_date, OLD.rate, OLD.source,
      OLD.entered_by_member_id, OLD.entered_by_name, OLD.replace_reason, OLD.created_at)
     OR OLD.superseded_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'an FX rate never changes; enter a replacement' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER fx_rates_guard BEFORE UPDATE OR DELETE ON "fx_rates" FOR EACH ROW EXECUTE FUNCTION vento_fx_rates_guard();
--> statement-breakpoint
-- Vento's starting rules for "Set up for …". Illustrative defaults, NOT settled law: each is copied
-- in marked To verify, and finance or legal must confirm it against the Nigeria Tax Act 2025 and the
-- state's law before go-live (decision 1). Lagos is the only state template (decision 7).
INSERT INTO "tax_templates" ("kind", "state_code", "name", "paid_to", "rate_percent", "categories", "base", "effective_from", "source") VALUES
  ('vat', NULL, 'VAT', 'NRS', 7.5, array['accommodation','food','beverage','events','laundry','other'], 'net', '2020-02-01', 'Vento default · illustrative · verify against the Nigeria Tax Act 2025 before go-live'),
  ('state_tax', 'LA', 'Lagos consumption tax', 'Lagos State IRS', 5, array['accommodation','food','beverage','events'], 'net', NULL, 'Vento default · illustrative · verify against the Nigeria Tax Act 2025 before go-live'),
  ('service_charge', NULL, 'Service charge', NULL, 10, array['accommodation','food','beverage','events'], 'net', NULL, 'Vento default · illustrative · verify against the Nigeria Tax Act 2025 before go-live');
