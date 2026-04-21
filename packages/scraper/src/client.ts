import type { ContentKind, SitemapEntry } from "./types.ts";

export const BASE = "https://handbook.monash.edu";

export class HandbookError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = "HandbookError";
  }
}

async function httpGet(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
}

/** Parse `buildId` out of the home page's `__NEXT_DATA__` script tag. */
export async function fetchBuildId(): Promise<string> {
  const res = await httpGet(`${BASE}/`);
  if (res.status !== 200) throw new HandbookError(`home ${res.status}`, `${BASE}/`);
  const match = res.body.match(
    /<script id="__NEXT_DATA__"[^>]*>(\{[\s\S]*?\})<\/script>/,
  );
  if (!match?.[1]) throw new HandbookError("__NEXT_DATA__ not found", `${BASE}/`);
  const parsed = JSON.parse(match[1]) as { buildId?: string };
  if (!parsed.buildId) throw new HandbookError("buildId missing", `${BASE}/`);
  return parsed.buildId;
}

function parseLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]!.trim());
  return out;
}

/** Enumerate every AI-page URL across the sitemap index, deduped by URL. */
export async function enumerateAll(): Promise<SitemapEntry[]> {
  const indexRes = await httpGet(`${BASE}/sitemap.xml`);
  if (indexRes.status !== 200)
    throw new HandbookError(`sitemap.xml ${indexRes.status}`, `${BASE}/sitemap.xml`);

  const seen = new Map<string, SitemapEntry>();
  for (const childUrl of parseLocs(indexRes.body)) {
    const res = await httpGet(childUrl);
    if (res.status !== 200)
      throw new HandbookError(`sitemap ${res.status}`, childUrl);
    for (const loc of parseLocs(res.body)) {
      const m = loc.match(
        /^https:\/\/handbook\.monash\.edu\/(\d{4})\/(units|courses|aos)\/([^/?#]+)\/?$/,
      );
      if (!m) continue;
      seen.set(loc, { year: m[1]!, kind: m[2] as ContentKind, code: m[3]!, url: loc });
    }
  }
  return [...seen.values()];
}

export function detailUrl(buildId: string, e: SitemapEntry): string {
  const qs = new URLSearchParams();
  qs.append("catchAll", e.year);
  qs.append("catchAll", e.kind);
  qs.append("catchAll", e.code);
  return `${BASE}/_next/data/${buildId}/${e.year}/${e.kind}/${e.code}.json?${qs.toString()}`;
}

/** Fetch a single detail record. Caller handles rate-limiting + retries. */
export async function fetchDetail(
  buildId: string,
  entry: SitemapEntry,
): Promise<{ status: number; body: string }> {
  return httpGet(detailUrl(buildId, entry));
}
