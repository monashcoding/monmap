CREATE TABLE "entity_stats" (
	"kind" "review_entity_kind" NOT NULL,
	"code" text NOT NULL,
	"planners" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "entity_stats_kind_code_pk" PRIMARY KEY("kind","code")
);
--> statement-breakpoint
CREATE TABLE "entity_view" (
	"day" date NOT NULL,
	"kind" "review_entity_kind" NOT NULL,
	"code" text NOT NULL,
	"visitor" text NOT NULL,
	CONSTRAINT "entity_view_day_kind_code_visitor_pk" PRIMARY KEY("day","kind","code","visitor")
);
--> statement-breakpoint
CREATE TABLE "entity_view_daily" (
	"day" date NOT NULL,
	"kind" "review_entity_kind" NOT NULL,
	"code" text NOT NULL,
	"viewers" integer NOT NULL,
	CONSTRAINT "entity_view_daily_day_kind_code_pk" PRIMARY KEY("day","kind","code")
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"name" text PRIMARY KEY NOT NULL,
	"finished_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_core" (
	"year" text NOT NULL,
	"unit_code" text NOT NULL,
	"sources" integer NOT NULL,
	CONSTRAINT "unit_core_year_unit_code_pk" PRIMARY KEY("year","unit_code")
);
