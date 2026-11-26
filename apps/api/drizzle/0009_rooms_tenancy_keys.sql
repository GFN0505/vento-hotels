-- The unique key comes first: the composite foreign keys below reference it.
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "room_connections" DROP CONSTRAINT "room_connections_property_id_properties_id_fk";
--> statement-breakpoint
ALTER TABLE "room_types" DROP CONSTRAINT "room_types_property_id_properties_id_fk";
--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_property_id_properties_id_fk";
--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;
