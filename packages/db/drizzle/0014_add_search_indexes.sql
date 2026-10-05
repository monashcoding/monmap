ALTER TABLE "areas_of_study" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(code, '') || ' ' || coalesce(title, '')), 'A') || setweight(to_tsvector('english', regexp_replace(coalesce(handbook_description, ''), '<[^>]+>', ' ', 'g')), 'C')) STORED;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(code, '') || ' ' || coalesce(title, '') || ' ' || coalesce(abbreviated_name, '')), 'A') || setweight(to_tsvector('english', regexp_replace(coalesce(overview, ''), '<[^>]+>', ' ', 'g')), 'C')) STORED;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(code, '') || ' ' || coalesce(title, '')), 'A') || setweight(to_tsvector('english', regexp_replace(coalesce(handbook_synopsis, ''), '<[^>]+>', ' ', 'g')), 'C')) STORED;--> statement-breakpoint
CREATE INDEX "aos_code_idx" ON "areas_of_study" USING btree ("code");--> statement-breakpoint
CREATE INDEX "aos_search_idx" ON "areas_of_study" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "aos_title_trgm_idx" ON "areas_of_study" USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "aos_code_trgm_idx" ON "areas_of_study" USING gin (code gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "courses_code_idx" ON "courses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "courses_search_idx" ON "courses" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "units_code_idx" ON "units" USING btree ("code");--> statement-breakpoint
CREATE INDEX "units_search_idx" ON "units" USING gin ("search_vector");