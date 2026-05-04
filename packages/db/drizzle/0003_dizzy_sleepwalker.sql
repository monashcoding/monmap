-- Replace the single-plan-per-user table with the multi-plan shape.
-- Safe to drop because the table was empty when this migration was
-- written; if you ship plans before applying this, replace with an
-- in-place ALTER instead.

DROP TABLE "user_plan";
--> statement-breakpoint
CREATE TABLE "user_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_plan" ADD CONSTRAINT "user_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_plan_user_id_idx" ON "user_plan" USING btree ("user_id");
