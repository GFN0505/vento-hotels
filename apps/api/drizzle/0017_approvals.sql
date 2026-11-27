CREATE TYPE "public"."approval_kind" AS ENUM('stay_discount');--> statement-breakpoint
CREATE TYPE "public"."approval_method" AS ENUM('pin_here', 'inbox');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."approval_value_kind" AS ENUM('percent', 'amount_ngn');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"permission" text NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"value_kind" "approval_value_kind" NOT NULL,
	"status" "approval_status" NOT NULL,
	"method" "approval_method",
	"requester_member_id" uuid NOT NULL,
	"requester_name" text NOT NULL,
	"requester_limit" numeric(14, 4),
	"approver_member_id" uuid,
	"approver_name" text,
	"approver_limit" numeric(14, 4),
	"binding_hash" text NOT NULL,
	"subject" jsonb NOT NULL,
	"draft" jsonb,
	"action_key" uuid NOT NULL,
	"reason" text,
	"comment" text,
	"business_date" date NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"used_entity_type" text,
	"used_entity_id" uuid,
	"used_reference" text,
	"request_device_id" uuid,
	"approver_device_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_organization_id_idempotency_key_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "approvals_not_self" CHECK ("approvals"."approver_member_id" <> "approvals"."requester_member_id"),
	CONSTRAINT "approvals_used_only_approved" CHECK ("approvals"."used_at" is null or "approvals"."status" = 'approved'),
	CONSTRAINT "approvals_comment_length" CHECK ("approvals"."comment" is null or char_length("approvals"."comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_organization_id_approver_member_id_status_index" ON "approvals" USING btree ("organization_id","approver_member_id","status");--> statement-breakpoint
CREATE INDEX "approvals_organization_id_requester_member_id_requested_at_index" ON "approvals" USING btree ("organization_id","requester_member_id","requested_at");--> statement-breakpoint
CREATE INDEX "approvals_property_id_status_expires_at_index" ON "approvals" USING btree ("property_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "approvals_organization_id_action_key_index" ON "approvals" USING btree ("organization_id","action_key");--> statement-breakpoint
CREATE INDEX "approvals_used_entity_id_index" ON "approvals" USING btree ("used_entity_id");