ALTER TABLE "guest_id_documents" DROP CONSTRAINT "guest_id_documents_attached";--> statement-breakpoint
ALTER TABLE "guest_id_documents" ADD CONSTRAINT "guest_id_documents_attached" CHECK ("guest_id_documents"."status" = 'pending' or "guest_id_documents"."purged_at" is not null or ("guest_id_documents"."guest_id" is not null and "guest_id_documents"."attached_at" is not null));--> statement-breakpoint
-- Uploads purged before this change: archived too, so nothing can attach them.
UPDATE "guest_id_documents" SET "status" = 'archived', "archived_at" = coalesce("archived_at", "purged_at") WHERE "purged_at" IS NOT NULL AND "status" = 'pending';
