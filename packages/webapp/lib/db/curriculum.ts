/**
 * Curriculum tree walkers live in `@monmap/db` so the ingest pipeline
 * and the webapp share one implementation. This file re-exports them
 * so existing webapp imports keep working.
 */
export {
  type RequirementGroup,
  type EmbeddedSpecialisation,
  type SubCourseRef,
  type ComponentLabelMap,
  extractRequirementGroups,
  extractEmbeddedSpecialisations,
  extractSubCourseRefs,
  extractComponentLabels,
  extractUnitRefs,
  pickDefaultUnits,
} from "@monmap/db"
