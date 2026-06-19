-- Patch requirement_groups for two courses whose curriculum structures
-- the parser cannot resolve correctly:
--
-- S2000 (Bachelor of Science): Part A has 54cp of sub-containers against
-- a 48cp budget. The parser's `sumOthers < containerCp` rule correctly
-- identifies the 6cp slack but can't determine *which* 6cp sub is
-- optional, so it emits nothing. The two universally-mandatory items in
-- Part A are: SCI1000 (Core communication, 6cp, always required) and
-- one mathematics/statistics unit (6cp, pick 1 of 6). Level 1 science
-- sequences (24cp) are also required but entirely major-specific, so
-- they're covered by AoS selection rather than the template.
-- This row is consulted as the Science component template for every
-- double degree that references S2000 (currently S2004 CS+Science).
--
-- F2010 (Bachelor of Design): Part E "Indonesian studies – For the
-- Indonesia offering only" has a single option (BEI1270) with
-- required=1, so pickDefaultUnits auto-loads it. Australian students
-- (the vast majority) should never see BEI1270 in the default template.
-- Removing Part E from requirement_groups fixes this for both standalone
-- F2010 and the Design component of F2012 (Design+IT).

--> statement-breakpoint

-- Science: add the two universally-required Part A groups.
-- Applies to all handbook years where the row exists (the parser stores
-- [] for every year, so this is safe to back-fill across all years).
UPDATE courses
SET requirement_groups = '[
  {
    "grouping": "Part A. Core communication",
    "required": 1,
    "options": ["SCI1000"]
  },
  {
    "grouping": "Part A. Mathematics and statistics unit",
    "required": 1,
    "options": ["STA1010", "SCI1020", "MTH1035", "MTH1030", "SCI1022", "MTH1020"]
  }
]'::jsonb
WHERE code = 'S2000'
  AND requirement_groups::text = '[]';

--> statement-breakpoint

-- Design: strip Part E (Indonesian studies, campus-specific) from the
-- default template. Keeps Parts A, B, and C intact.
UPDATE courses
SET requirement_groups = (
  SELECT jsonb_agg(grp)
  FROM jsonb_array_elements(requirement_groups) AS grp
  WHERE grp->>'grouping' NOT ILIKE '%indonesian%'
)
WHERE code = 'F2010'
  AND requirement_groups::text ILIKE '%indonesian%';
