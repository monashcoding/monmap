import { mkdir, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { enumerateAll, fetchBuildId, fetchDetail } from "./client.ts";
import type {
  ContentKind,
  HandbookDataResponse,
  ScrapeManifest,
  SitemapEntry,
} from "./types.ts";

interface ScrapeOptions {
  readonly years: readonly string[] | "all";
  readonly kinds: readonly ContentKind[];
  readonly resume: boolean;
  /** Requests started per second. */
  readonly rate: number;
}

const OUT_DIR = "./data";
/** Requests in flight at once. Pacing comes from `rate`, not from this. */
const MAX_IN_FLIGHT = 8;
/** Block windows are ~5 min; 6 min keeps us out of them with margin. */
const PAUSE_SECONDS = 360;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

function pathFor(e: SitemapEntry): string {
  return join(OUT_DIR, "raw", e.year, e.kind, `${e.code}.json`);
}

export async function scrape(opts: ScrapeOptions): Promise<ScrapeManifest> {
  console.log("Fetching build ID from home page...");
  const buildId = await fetchBuildId();
  console.log(`buildId=${buildId}`);

  console.log("Enumerating sitemap...");
  const all = await enumerateAll();
  console.log(`sitemap: ${all.length} total URLs`);

  const wantYears = opts.years === "all" ? null : new Set(opts.years);
  const wantKinds = new Set<ContentKind>(opts.kinds);
  const filtered = all.filter(
    (e) => wantKinds.has(e.kind) && (!wantYears || wantYears.has(e.year)),
  );
  console.log(`after filter: ${filtered.length} pages`);

  const toFetch: SitemapEntry[] = [];
  let skipped = 0;
  if (opts.resume) {
    for (const e of filtered) {
      if (await exists(pathFor(e))) skipped++;
      else toFetch.push(e);
    }
  } else {
    toFetch.push(...filtered);
  }
  console.log(
    `to fetch: ${toFetch.length} (skipping ${skipped} already on disk)\n` +
      `pacing: ${opts.rate} req/s, ${PAUSE_SECONDS}s pause on 403`,
  );

  const counts: Record<string, number> = {};
  const errors: Array<{ url: string; reason: string }> = [];
  let done = 0;

  // Requests start on a fixed schedule (one every 1000/rate ms) rather
  // than "fetch, then sleep", so slow responses don't stretch the run.
  // A 403 pauses every request until the WAF block window has passed.
  const intervalMs = 1000 / opts.rate;
  let nextStart = Date.now();
  let pausedUntil = 0;
  const inFlight = new Set<Promise<void>>();

  async function waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const at = Math.max(nextStart, pausedUntil);
      if (now >= at) {
        nextStart = Math.max(nextStart, now) + intervalMs;
        return;
      }
      await sleep(at - now);
    }
  }

  async function fetchOne(entry: SitemapEntry): Promise<void> {
    let r = await fetchDetail(buildId, entry);
    // AWS WAF rate-based rule — pause and retry the same URL.
    while (r.status === 403) {
      if (Date.now() >= pausedUntil) {
        console.log(`... 403 on ${entry.kind}/${entry.code}; pausing ${PAUSE_SECONDS}s`);
        pausedUntil = Date.now() + PAUSE_SECONDS * 1000;
      }
      await waitForSlot();
      r = await fetchDetail(buildId, entry);
    }

    if (r.status !== 200) {
      errors.push({ url: entry.url, reason: `http ${r.status}` });
      return;
    }

    let parsed: HandbookDataResponse<unknown>;
    try {
      parsed = JSON.parse(r.body) as HandbookDataResponse<unknown>;
    } catch (e) {
      errors.push({ url: entry.url, reason: `bad json: ${String(e)}` });
      return;
    }
    if (parsed.pageProps.pageType !== "AIPage") {
      errors.push({
        url: entry.url,
        reason: `pageType=${parsed.pageProps.pageType}`,
      });
      return;
    }

    await writeJson(pathFor(entry), parsed.pageProps.pageContent);
    const key = `${entry.year}/${entry.kind}`;
    counts[key] = (counts[key] ?? 0) + 1;
    if (++done % 25 === 0) {
      console.log(`... ${done}/${toFetch.length} (errors=${errors.length})`);
    }
  }

  for (const entry of toFetch) {
    while (inFlight.size >= MAX_IN_FLIGHT) await Promise.race(inFlight);
    await waitForSlot();
    const p: Promise<void> = fetchOne(entry)
      .catch((e: unknown) => {
        errors.push({ url: entry.url, reason: `fetch failed: ${String(e)}` });
      })
      .finally(() => inFlight.delete(p));
    inFlight.add(p);
  }
  await Promise.all(inFlight);

  console.log(`complete: wrote=${done} skipped=${skipped} errors=${errors.length}`);

  const manifest: ScrapeManifest = {
    buildId,
    scrapedAt: new Date().toISOString(),
    years: [...new Set(filtered.map((e) => e.year))].sort(),
    counts,
    errors,
  };
  await writeJson(join(OUT_DIR, "manifest.json"), manifest);
  return manifest;
}
