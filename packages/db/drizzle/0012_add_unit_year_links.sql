CREATE TABLE "unit_year_links" (
	"year" text NOT NULL,
	"unit_code" text NOT NULL,
	"linked_year" text NOT NULL,
	CONSTRAINT "unit_year_links_year_unit_code_pk" PRIMARY KEY("year","unit_code")
);
