-- Drop the Better Auth session/account/verification tables.
--
-- MonMap has cut over to the central MAC identity service
-- (auth.monashcoding.com): it no longer mints sessions or performs OAuth,
-- so these three tables are now dead. Identity is owned centrally and
-- verified per request from a JWT (see webapp/lib/mac-auth.ts).
--
-- The `user` table is intentionally KEPT as a local mirror so the foreign
-- keys from `user_plan` / `user_grade` stay intact — its ids already equal
-- the central `macUserId`, so no user data moves. `getCurrentUser()`
-- upserts a mirror row on first sight.
--
-- Each table owns its own FK to `user` (onDelete cascade); dropping the
-- table drops that constraint. Nothing else references these tables.
DROP TABLE IF EXISTS "session";--> statement-breakpoint
DROP TABLE IF EXISTS "account";--> statement-breakpoint
DROP TABLE IF EXISTS "verification";
