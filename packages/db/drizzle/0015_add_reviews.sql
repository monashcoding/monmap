CREATE TYPE "public"."review_entity_kind" AS ENUM('unit', 'course', 'aos');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('published', 'flagged', 'shadowbanned');--> statement-breakpoint
CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_kind" "review_entity_kind" NOT NULL,
	"entity_code" text NOT NULL,
	"overall" smallint NOT NULL,
	"ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body" text NOT NULL,
	"year_taken" text,
	"author_initials" text NOT NULL,
	"status" "review_status" DEFAULT 'published' NOT NULL,
	"classifier_label" text,
	"classifier_confidence" real,
	"classifier_scores" jsonb,
	"classifier_error" text,
	"classified_at" timestamp,
	"moderated_by" text,
	"moderated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_overall_range" CHECK ("review"."overall" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_user_entity_idx" ON "review" USING btree ("user_id","entity_kind","entity_code");--> statement-breakpoint
CREATE INDEX "review_entity_published_idx" ON "review" USING btree ("entity_kind","entity_code","created_at" DESC NULLS LAST) WHERE "review"."status" = 'published';--> statement-breakpoint
CREATE INDEX "review_status_created_idx" ON "review" USING btree ("status","created_at" DESC NULLS LAST);