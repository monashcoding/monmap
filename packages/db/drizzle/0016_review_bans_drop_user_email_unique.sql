CREATE TABLE "review_author_ban" (
	"user_id" text PRIMARY KEY NOT NULL,
	"banned_by" text NOT NULL,
	"banned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "review_author_ban" ADD CONSTRAINT "review_author_ban_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_deleted_hidden" CHECK ("review"."deleted_at" IS NULL OR "review"."status" <> 'published');