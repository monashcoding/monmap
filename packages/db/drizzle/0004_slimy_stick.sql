CREATE TABLE "user_grade" (
	"user_id" text NOT NULL,
	"unit_code" text NOT NULL,
	"mark" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_grade_user_id_unit_code_pk" PRIMARY KEY("user_id","unit_code")
);
--> statement-breakpoint
ALTER TABLE "user_grade" ADD CONSTRAINT "user_grade_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_grade_user_id_idx" ON "user_grade" USING btree ("user_id");