/**
 * Curriculum tree walkers live in `@monmap/db` so the ingest pipeline
 * and the webapp share one implementation. The webapp reads pre-baked
 * course columns (requirement_groups, embedded_specialisations,
 * sub_course_refs, component_labels) and only extracts at read time
 * for areas of study, which have no baked equivalent yet.
 */
export {
  type RequirementGroup,
  type EmbeddedSpecialisation,
  type ExcludedAos,
  extractRequirementGroups,
  pickDefaultUnits,
} from "@monmap/db"
