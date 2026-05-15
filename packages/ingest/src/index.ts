import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@monmap/db";
import { DATABASE_URL } from "@monmap/db/env";
import { ingest } from "./ingest.ts";

function parseArgs(argv: readonly string[]): { year: string; allYears: boolean; dataDir: string } {
  const out = { year: "2026", allYears: false, dataDir: resolve(fileURLToPath(import.meta.url), "../../../scraper/data") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--year") out.year = argv[++i]!;
    else if (a === "--all-years") out.allYears = true;
    else if (a === "--data-dir") out.dataDir = argv[++i]!;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: pnpm ingest [--year 2026] [--all-years] [--data-dir ./data]`);
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
// Ingest is a long-running CLI doing bulk inserts — opt out of the
// serverless-tuned defaults from `createDb` and use a larger pool with
// no idle reaping.
const db = createDb(DATABASE_URL, {
  pool: { max: 4, idle_timeout: 0, prepare: false },
});

const years = args.allYears
  ? (await readdir(join(args.dataDir, "raw"))).filter((d) => /^\d{4}$/.test(d)).sort()
  : [args.year];

for (const year of years) {
  const summary = await ingest({ db, dataDir: args.dataDir, year });
  console.log(`\n=== summary [${year}] ===`);
  console.log(JSON.stringify(summary, null, 2));
}

process.exit(0);
