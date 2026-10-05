import { scrape } from "./scrape.ts";
import type { ContentKind } from "./types.ts";

function parseArgs(argv: readonly string[]): {
  allYears: boolean;
  years: string[];
  kinds: ContentKind[];
  resume: boolean;
  rate: number;
} {
  const out = {
    allYears: false,
    years: ["2026"],
    kinds: ["units", "courses", "aos"] as ContentKind[],
    resume: true,
    rate: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--all-years") out.allYears = true;
    else if (a === "--years") out.years = argv[++i]!.split(",");
    else if (a === "--kinds") out.kinds = argv[++i]!.split(",") as ContentKind[];
    else if (a === "--no-resume") out.resume = false;
    else if (a === "--rate") out.rate = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`monmap scraper

Monash Handbook's CloudFront has an AWS WAF rate-based rule on source IP.
The scraper starts requests at a fixed rate (default 2 req/s) and pauses
6 min on 403.

Usage: pnpm scrape [options]

Options:
  --all-years            Scrape every year in the sitemap (2020–current).
  --years <Y1,Y2,...>    Comma-separated list of years (default: 2026).
  --kinds <k1,k2,...>    units,courses,aos (default: all).
  --no-resume            Re-fetch even if file exists on disk.
  --rate <n>             Requests started per second (default: 2).
  -h, --help             Show this help.

Output:
  ./data/raw/<year>/<kind>/<code>.json   # raw pageContent verbatim
  ./data/manifest.json                   # run summary
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await scrape({
    years: args.allYears ? "all" : args.years,
    kinds: args.kinds,
    resume: args.resume,
    rate: args.rate,
  });
  console.log("\n=== manifest ===");
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
