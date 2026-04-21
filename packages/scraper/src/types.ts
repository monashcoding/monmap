/**
 * Types mirroring the Monash Handbook's Next.js data endpoint.
 *
 * Everything under `pageContent` is Monash's own CourseLoop-shaped schema.
 * We type the fields we know and care about; the index signature keeps
 * unknown fields visible without losing them on downstream adaptation.
 */

export type ContentKind = "units" | "courses" | "aos";

export interface SitemapEntry {
  readonly year: string;
  readonly kind: ContentKind;
  readonly code: string;
  readonly url: string;
}

/** A CourseLoop-style "pick from lookup table" reference. */
export interface CLReference {
  readonly value: string | null;
  readonly cl_id?: string;
  readonly key?: string;
}

/** Top-level wrapper returned by `/_next/data/{buildId}/...json`. */
export interface HandbookDataResponse<T = unknown> {
  readonly pageProps: PageProps<T>;
}

export interface PageProps<T = unknown> {
  readonly pageType: "AIPage" | "ErrorPage" | "ErrorPage404" | string;
  readonly pageContent: T;
  readonly pageErrors: readonly unknown[];
}

/* -------------------------------------------------------------------------
 * Unit content — observed ~100 fields. These are the ones we actually plan
 * to consume in a student-facing planner; everything else rides through the
 * index signature until we need it.
 * ----------------------------------------------------------------------- */

export interface Requisite {
  readonly academic_item_code?: string;
  readonly active?: string;
  readonly requisite_cl_id?: string;
  readonly description?: string;
  readonly requisite_type?: CLReference;
  readonly cl_id?: CLReference;
  readonly academic_item_version_number?: string;
  readonly order?: string;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly container?: readonly unknown[];
  readonly [key: string]: unknown;
}

export interface UnitOffering {
  readonly name?: string;
  readonly display_name?: string;
  readonly location?: CLReference;
  readonly teaching_period?: CLReference;
  readonly attendance_mode?: CLReference;
  readonly study_level?: CLReference;
  readonly offered?: string;
  readonly publish?: string;
  readonly quota_number?: string;
  readonly clarification_to_appear_in_handbook?: string;
  readonly fees_domestic?: string;
  readonly [key: string]: unknown;
}

export interface UnitContent {
  readonly code: string;
  readonly title: string;
  readonly unit_code?: string;
  readonly credit_points?: string;
  readonly level?: string;
  readonly type?: string;
  readonly status?: string;
  readonly contentTypeLabel?: string;
  readonly academic_item_type?: string;
  readonly implementation_year?: string;
  readonly study_level?: CLReference;
  readonly handbook_synopsis?: string;
  readonly overview?: string;
  readonly content?: string;
  readonly requisites?: readonly Requisite[];
  readonly unit_offering?: readonly UnitOffering[];
  readonly enrolment_rules?: readonly unknown[];
  readonly assessments?: readonly unknown[];
  readonly unit_learning_outcomes?: readonly unknown[];
  readonly workload_requirements?: readonly unknown[];
  readonly area_of_study_links?: string;
  readonly exclusions?: string;
  readonly school?: CLReference;
  readonly academic_org?: CLReference;
  readonly [key: string]: unknown;
}

/* -------------------------------------------------------------------------
 * Course content — ~158 fields. `curriculumStructure` is the nested tree
 * that expresses "core units + X credit points from list Y + majors".
 * ----------------------------------------------------------------------- */

export interface CurriculumStructure {
  readonly curriculum_structure?: unknown;
  readonly relationship_type?: string;
  readonly name?: string;
  readonly credit_points?: string;
  readonly parent_id?: string;
  readonly cl_id?: string;
  readonly container?: readonly unknown[];
  readonly [key: string]: unknown;
}

export interface CourseContent {
  readonly code: string;
  readonly title: string;
  readonly course_code?: string;
  readonly credit_points?: string;
  readonly type?: string;
  readonly aqf_level?: string;
  readonly abbreviated_name?: string;
  readonly description?: string;
  readonly curriculumStructure?: CurriculumStructure;
  readonly majors_minors?: readonly unknown[];
  readonly specialisations?: readonly unknown[];
  readonly double_degrees?: readonly unknown[];
  readonly requirements?: unknown;
  readonly structure?: unknown;
  readonly entry?: unknown;
  readonly entry_list?: readonly unknown[];
  readonly entry_requirements_onshore?: unknown;
  readonly entry_requirements_transnational?: unknown;
  readonly english_language_requirements?: unknown;
  readonly learning_outcomes?: readonly unknown[];
  readonly accrediting_bodies?: readonly unknown[];
  readonly professional_accreditation?: unknown;
  readonly implementation_year?: string;
  readonly school?: CLReference;
  readonly owning_org?: CLReference;
  readonly [key: string]: unknown;
}

/* -------------------------------------------------------------------------
 * Area of Study content — ~62 fields.
 * ----------------------------------------------------------------------- */

export interface AosContent {
  readonly code: string;
  readonly title: string;
  readonly aos_code?: string;
  readonly credit_points?: string;
  readonly type?: string;
  readonly curriculumStructure?: CurriculumStructure;
  readonly aos_offering?: readonly unknown[];
  readonly aos_offering_locations?: readonly unknown[];
  readonly related_aos?: readonly unknown[];
  readonly learning_outcomes?: readonly unknown[];
  readonly entry_requirements_onshore?: unknown;
  readonly entry_requirements_transnational?: unknown;
  readonly handbook_description?: string;
  readonly academic_coordinator?: unknown;
  readonly school?: CLReference;
  readonly academic_org?: CLReference;
  readonly [key: string]: unknown;
}

export type PageContentByKind<K extends ContentKind> =
  K extends "units" ? UnitContent :
  K extends "courses" ? CourseContent :
  K extends "aos" ? AosContent :
  never;

/** Manifest entry for what we saved to disk. */
export interface ScrapeManifest {
  readonly buildId: string;
  readonly scrapedAt: string;
  readonly years: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
  readonly errors: ReadonlyArray<{
    readonly url: string;
    readonly reason: string;
  }>;
}
