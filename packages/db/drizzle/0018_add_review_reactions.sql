CREATE TYPE "public"."review_reaction_kind" AS ENUM('up', 'down', 'laugh', 'sad', 'angry', 'wow');--> statement-breakpoint
CREATE TABLE "review_reaction" (
	"review_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" "review_reaction_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_reaction_review_id_user_id_reaction_pk" PRIMARY KEY("review_id","user_id","reaction")
);
--> statement-breakpoint
ALTER TABLE "review_reaction" ADD CONSTRAINT "review_reaction_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reaction" ADD CONSTRAINT "review_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_reaction_user_idx" ON "review_reaction" USING btree ("user_id");