CREATE TYPE "public"."requisite_type" AS ENUM('prerequisite', 'corequisite', 'prohibition', 'permission', 'other');--> statement-breakpoint
CREATE TABLE "areas_of_study" (
	"year" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"study_level" text,
	"credit_points" integer,
	"school" text,
	"academic_org" text,
	"handbook_description" text,
	"curriculum_structure" jsonb,
	"raw" jsonb NOT NULL,
	CONSTRAINT "areas_of_study_year_code_pk" PRIMARY KEY("year","code")
);
--> statement-breakpoint
CREATE TABLE "course_areas_of_study" (
	"course_year" text NOT NULL,
	"course_code" text NOT NULL,
	"aos_year" text NOT NULL,
	"aos_code" text NOT NULL,
	"relationship" text NOT NULL,
	CONSTRAINT "course_areas_of_study_course_year_course_code_aos_year_aos_code_relationship_pk" PRIMARY KEY("course_year","course_code","aos_year","aos_code","relationship")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"year" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"abbreviated_name" text,
	"aqf_level" text,
	"credit_points" integer,
	"type" text,
	"status" text,
	"school" text,
	"cricos_code" text,
	"overview" text,
	"on_campus" boolean,
	"online" boolean,
	"full_time" boolean,
	"part_time" boolean,
	"curriculum_structure" jsonb,
	"raw" jsonb NOT NULL,
	CONSTRAINT "courses_year_code_pk" PRIMARY KEY("year","code")
);
--> statement-breakpoint
CREATE TABLE "requisites" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" text NOT NULL,
	"unit_code" text NOT NULL,
	"requisite_type" "requisite_type" NOT NULL,
	"description" text,
	"rule" jsonb
);
--> statement-breakpoint
CREATE TABLE "unit_offerings" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" text NOT NULL,
	"unit_code" text NOT NULL,
	"name" text,
	"display_name" text,
	"teaching_period" text,
	"location" text,
	"attendance_mode" text,
	"offered" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"year" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"credit_points" integer,
	"level" text,
	"type" text,
	"status" text,
	"undergrad_postgrad" text,
	"school" text,
	"academic_org" text,
	"handbook_synopsis" text,
	"raw" jsonb NOT NULL,
	CONSTRAINT "units_year_code_pk" PRIMARY KEY("year","code")
);
--> statement-breakpoint
CREATE INDEX "aos_title_idx" ON "areas_of_study" USING btree ("title");--> statement-breakpoint
CREATE INDEX "course_aos_course_idx" ON "course_areas_of_study" USING btree ("course_year","course_code");--> statement-breakpoint
CREATE INDEX "course_aos_aos_idx" ON "course_areas_of_study" USING btree ("aos_year","aos_code");--> statement-breakpoint
CREATE INDEX "courses_title_idx" ON "courses" USING btree ("title");--> statement-breakpoint
CREATE INDEX "requisites_unit_idx" ON "requisites" USING btree ("year","unit_code");--> statement-breakpoint
CREATE INDEX "offerings_unit_idx" ON "unit_offerings" USING btree ("year","unit_code");--> statement-breakpoint
CREATE INDEX "offerings_slot_idx" ON "unit_offerings" USING btree ("year","teaching_period","location");--> statement-breakpoint
CREATE INDEX "units_title_idx" ON "units" USING btree ("title");--> statement-breakpoint
CREATE INDEX "units_school_idx" ON "units" USING btree ("school");