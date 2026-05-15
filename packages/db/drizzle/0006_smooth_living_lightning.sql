ALTER TABLE "courses" ADD COLUMN "requirement_groups" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "embedded_specialisations" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "sub_course_refs" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "component_labels" jsonb;