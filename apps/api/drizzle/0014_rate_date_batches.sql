CREATE TABLE "rate_date_batches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"undone_by_batch_id" uuid,
	"undo_of_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_date_batches_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
ALTER TABLE "rate_date_batches" ADD CONSTRAINT "rate_date_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_date_batches" ADD CONSTRAINT "rate_date_batches_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."audit_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_date_batches" ADD CONSTRAINT "rate_date_batches_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_date_batches" ADD CONSTRAINT "rate_date_batches_plan_fk" FOREIGN KEY ("property_id","rate_plan_id") REFERENCES "public"."rate_plans"("property_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_date_batches_organization_id_index" ON "rate_date_batches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rate_date_batches_rate_plan_id_index" ON "rate_date_batches" USING btree ("rate_plan_id");--> statement-breakpoint
CREATE INDEX "rate_date_batches_audit_event_id_index" ON "rate_date_batches" USING btree ("audit_event_id");