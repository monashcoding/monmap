/**
 * Curriculum tree walkers live in `@monmap/db` so the ingest pipeline
 * and the webapp share one implementation. The webapp reads pre-baked
 * course columns (requirement_groups, embedded_specialisations,
 * sub_course_refs, component_labels) and only extracts at read time
 * for areas of study, which have no baked equivalent yet.
 *
 * Imported from the `/curriculum` subpath, not the package root: these
 * are pure tree/array functions with no imports of their own, and
 * client components need `groupIsMandatory` for the "Core" badge. The
 * root index would drag drizzle and the postgres driver into the
 * browser bundle.
 */
export {
  type RequirementGroup,
  type DegreeShape,
  type EmbeddedSpecialisation,
  type ExcludedAos,
  containerParts,
  extractRequirementGroups,
  groupIsMandatory,
  pickDefaultUnits,
} from "@monmap/db/curriculum"
