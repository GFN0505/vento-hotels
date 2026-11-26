ALTER TABLE "sessions" ADD COLUMN "device_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_pins" ADD COLUMN "lock_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_device_id_index" ON "sessions" USING btree ("device_id");