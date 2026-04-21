import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@monmap/db";
import { DATABASE_URL } from "@monmap/db/env";
import { ingest } from "./ingest.ts";

function parseArgs(argv: readonly string[]): { year: string; dataDir: string } {
  const out = { year: "2026", dataDir: resolve(fileURLToPath(import.meta.url), "../../../../data") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--year") out.year = argv[++i]!;
    else if (a === "--data-dir") out.dataDir = argv[++i]!;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: pnpm ingest [--year 2026] [--data-dir ./data]`);
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const db = createDb(DATABASE_URL);
const summary = await ingest({ db, dataDir: args.dataDir, year: args.year });

console.log("\n=== summary ===");
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
