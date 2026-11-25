CREATE TABLE "invitation_properties" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "all_properties" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation_properties" ADD CONSTRAINT "invitation_properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_properties" ADD CONSTRAINT "invitation_properties_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_properties" ADD CONSTRAINT "invitation_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_properties_invitation_id_property_id_index" ON "invitation_properties" USING btree ("invitation_id","property_id");--> statement-breakpoint
CREATE INDEX "invitation_properties_organization_id_index" ON "invitation_properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_properties_property_id_index" ON "invitation_properties" USING btree ("property_id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tokenHash_unique" UNIQUE("token_hash");