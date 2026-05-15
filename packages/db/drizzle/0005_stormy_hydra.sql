CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "courses_title_trgm_idx" ON "courses" USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "courses_code_trgm_idx" ON "courses" USING gin (code gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "units_title_trgm_idx" ON "units" USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "units_code_trgm_idx" ON "units" USING gin (code gin_trgm_ops);