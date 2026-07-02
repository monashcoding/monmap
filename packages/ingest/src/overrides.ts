/**
 * Loader for the checked-in curriculum overrides file. The pure
 * applier lives in `@monmap/db` (`applyCurriculumOverrides`); this
 * module owns the IO so both the full ingest and the backfill /
 * standalone CLIs share one source of truth:
 * `packages/ingest/curriculum-overrides.json`.
 *
 * (The file sits at the package root, not in `data/` — that directory
 * is gitignored for the scraper corpus, and overrides must be in git.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCurriculumOverrides,
  type CurriculumOverride,
} from "@monmap/db";

export const OVERRIDES_PATH = resolve(
  fileURLToPath(import.meta.url),
  "../../curriculum-overrides.json",
);

export function loadCurriculumOverrides(): CurriculumOverride[] {
  const raw = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8")) as unknown;
  validateCurriculumOverrides(raw);
  return raw;
}
