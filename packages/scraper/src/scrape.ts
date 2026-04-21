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
}

const OUT_DIR = "./data";
/** 2 req/s sits well under the AWS WAF rate rule. */
const DELAY_MS = 500;
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
      `pacing: ${DELAY_MS}ms between requests, ${PAUSE_SECONDS}s pause on 403`,
  );

  const counts: Record<string, number> = {};
  const errors: Array<{ url: string; reason: string }> = [];
  let done = 0;

  for (const entry of toFetch) {
    await sleep(DELAY_MS);

    let r = await fetchDetail(buildId, entry);
    // AWS WAF rate-based rule — pause and retry the same URL.
    while (r.status === 403) {
      console.log(`... 403 on ${entry.kind}/${entry.code}; pausing ${PAUSE_SECONDS}s`);
      await sleep(PAUSE_SECONDS * 1000);
      r = await fetchDetail(buildId, entry);
    }

    if (r.status !== 200) {
      errors.push({ url: entry.url, reason: `http ${r.status}` });
      continue;
    }

    let parsed: HandbookDataResponse<unknown>;
    try {
      parsed = JSON.parse(r.body) as HandbookDataResponse<unknown>;
    } catch (e) {
      errors.push({ url: entry.url, reason: `bad json: ${String(e)}` });
      continue;
    }
    if (parsed.pageProps.pageType !== "AIPage") {
      errors.push({
        url: entry.url,
        reason: `pageType=${parsed.pageProps.pageType}`,
      });
      continue;
    }

    await writeJson(pathFor(entry), parsed.pageProps.pageContent);
    const key = `${entry.year}/${entry.kind}`;
    counts[key] = (counts[key] ?? 0) + 1;
    if (++done % 25 === 0) {
      console.log(`... ${done}/${toFetch.length} (errors=${errors.length})`);
    }
  }

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
