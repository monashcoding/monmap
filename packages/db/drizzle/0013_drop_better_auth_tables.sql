-- Drop the legacy Better Auth tables: session, account, verification.
--
-- Migration 0009 was meant to do this, but it never ran. Its journal
-- `when` (and 0008's) was hand-written with a 2025 date instead of 2026,
-- so both sort before 0007, and the migrator only applies entries newer
-- than the latest applied `created_at`. Both files are now no-ops anyway.
-- This migration issues the drops under a new, correctly ordered entry.
--
-- Why the drop is now safe (checked against a copy of production,
-- 2026-10-05):
--   * No code reads or writes these tables. schema.ts no longer defines
--     them, and the webapp resolves identity from the central MAC service
--     (packages/webapp/lib/auth-server.ts).
--   * The last write to `session` is 2026-07-02 09:18 UTC, the day of the
--     MAC-auth cutover. No session row is unexpired, while new `user`
--     rows keep arriving, so the central service does not write here.
--   * No foreign key and no view references these tables. Their own FKs
--     to `user` go away with them; `user` stays as the local mirror.
--
-- Guard: if any `session` row is still unexpired, something still mints
-- Better Auth sessions against this database. The migration then fails
-- instead of dropping live data.
--
-- IF EXISTS keeps the migration safe on a database where the tables were
-- already dropped by hand. The guard's IFs are nested on purpose:
-- PL/pgSQL plans a whole IF expression at once, so `to_regclass(...) AND
-- EXISTS (SELECT ... FROM "session")` fails when `session` is missing.
DO $$
BEGIN
  IF to_regclass('public.session') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "session" WHERE "expires_at" > now()) THEN
      RAISE EXCEPTION 'Refusing to drop "session": it holds unexpired rows, so something still writes Better Auth sessions to this database';
    END IF;
  END IF;
END $$;--> statement-breakpoint
DROP TABLE IF EXISTS "session";--> statement-breakpoint
DROP TABLE IF EXISTS "account";--> statement-breakpoint
DROP TABLE IF EXISTS "verification";
