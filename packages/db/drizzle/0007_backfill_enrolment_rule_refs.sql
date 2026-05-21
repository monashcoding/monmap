-- Backfill requisite_refs for units that store their PREREQUISITE /
-- PROHIBITION relationships in enrolment_rules HTML rather than in the
-- structured requisites field.
--
-- Pattern: entries whose description contains a <strong>PREREQUISITE</strong>
-- or <strong>PROHIBITION</strong> label followed by handbook unit links.
-- We extract every /units/CODE href from those descriptions and insert a
-- matching requisite_refs edge.  ON CONFLICT is a no-op so this is safe
-- to re-run, and structured-requisite rows are never duplicated because
-- the two sources are disjoint (verified: zero overlap in 2026 corpus).

--> statement-breakpoint

-- Prerequisites from enrolment_rules HTML
INSERT INTO requisite_refs (year, unit_code, requisite_type, requires_unit_code)
SELECT DISTINCT
  er.year,
  er.unit_code,
  'prerequisite'::requisite_type,
  upper(m[1])
FROM enrolment_rules er,
     regexp_matches(er.description, 'handbook\.monash\.edu/[^"]+/units/([A-Za-z][A-Za-z0-9-]*)', 'g') m
WHERE er.description ~* '<strong>\s*PREREQUISITE'
ON CONFLICT (year, unit_code, requisite_type, requires_unit_code) DO NOTHING;

--> statement-breakpoint

-- Prohibitions from enrolment_rules HTML
INSERT INTO requisite_refs (year, unit_code, requisite_type, requires_unit_code)
SELECT DISTINCT
  er.year,
  er.unit_code,
  'prohibition'::requisite_type,
  upper(m[1])
FROM enrolment_rules er,
     regexp_matches(er.description, 'handbook\.monash\.edu/[^"]+/units/([A-Za-z][A-Za-z0-9-]*)', 'g') m
WHERE er.description ~* '<strong>\s*PROHIBITION'
ON CONFLICT (year, unit_code, requisite_type, requires_unit_code) DO NOTHING;
