-- Backfill requisite_refs for units that record their PREREQUISITE,
-- PROHIBITION, or CO-REQUISITE relationships as HTML prose in
-- enrolment_rules rather than in the structured requisites field.
-- (~2,340 unit-years across Science, Engineering, Pharmacy, Education and
-- others, all seven handbook years.)
--
-- Extraction is anchor-based and high-precision:
--   * The description is split into sections at each <strong> label, so a
--     description carrying several labels attributes each unit link to its
--     OWN section rather than the whole blob. This matters: 121 descriptions
--     mix PREREQUISITE and PROHIBITION, and 81/32 mix CO-REQUISITE with
--     PREREQUISITE/PROHIBITION -- classifying the whole blob would mislabel
--     ~126 edges (e.g. tag a prohibited unit as a prerequisite).
--   * Only /units/CODE hrefs are taken, across every handbook URL host the
--     corpus uses (handbook.monash.edu/<year>/units/CODE plus the legacy
--     www[3].monash.edu/pubs/.../units/CODE.html). The /courses/ and /aos/
--     links that appear in the same prose ("incompatible with course
--     versions E3001, ...") are intentionally ignored.
--   * Self-references are dropped (a unit listing itself, e.g. CHM3990's own
--     corequisite -- 105 such artifacts in the corpus).
--
-- NOT extracted: plain-text codes with no anchor ("...or MTH1040",
-- "LAW1100 or LAW1101"). Parsing those needs NLP and would mistake course
-- codes (4531, M6011) for units. See docs/handbook-internals.md.
--
-- This is kept in lockstep with the ingest extractor in
-- packages/ingest/src/parse.ts so a re-ingest reproduces exactly these rows.
-- ON CONFLICT is a no-op, so it is safe to re-run and never duplicates a
-- structured-requisite row (the two sources are disjoint: a single incidental
-- overlap across the whole 2020-2026 corpus).

--> statement-breakpoint

INSERT INTO requisite_refs (year, unit_code, requisite_type, requires_unit_code)
SELECT DISTINCT
  er.year,
  er.unit_code,
  (CASE
     WHEN seg ~* '^<strong[^>]*>\s*PREREQUISITE'  THEN 'prerequisite'
     WHEN seg ~* '^<strong[^>]*>\s*PROHIBITION'   THEN 'prohibition'
     WHEN seg ~* '^<strong[^>]*>\s*CO-?REQUISITE' THEN 'corequisite'
   END)::requisite_type,
  upper(m[1])
FROM enrolment_rules er,
     regexp_split_to_table(er.description, '(?=<strong)') AS seg,
     regexp_matches(seg, '/units/([A-Za-z][A-Za-z0-9]+)', 'g') AS m
WHERE seg ~* '^<strong[^>]*>\s*(PREREQUISITE|PROHIBITION|CO-?REQUISITE)'
  AND er.unit_code <> upper(m[1])
ON CONFLICT (year, unit_code, requisite_type, requires_unit_code) DO NOTHING;
