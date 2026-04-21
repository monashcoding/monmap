/**
 * Map a unit code to a faculty/school *prefix* and a stable colour.
 *
 * Monash unit codes start with a 3-letter discipline prefix (FIT, MAT,
 * ENG, etc). We colour the left rail of each unit card by prefix so a
 * glance over the planner reveals "am I taking too many FIT units this
 * semester?" without reading titles. The palette is hand-picked for
 * legibility against both light and dark backgrounds; prefixes we
 * haven't charted fall back to a hash-based slot so a new discipline
 * still gets a distinct colour (stable across renders) without any
 * code change.
 */

export interface FacultyStyle {
  /** Short text shown vertically on the rail (the prefix itself). */
  label: string;
  /** Tailwind utility class for the rail background. */
  railClass: string;
  /** Tailwind utility class for the rail text (on top of bg). */
  railTextClass: string;
}

const FALLBACK_PALETTE: { bg: string; text: string }[] = [
  { bg: "bg-violet-500", text: "text-white" },
  { bg: "bg-sky-500", text: "text-white" },
  { bg: "bg-rose-500", text: "text-white" },
  { bg: "bg-amber-500", text: "text-white" },
  { bg: "bg-teal-500", text: "text-white" },
  { bg: "bg-fuchsia-500", text: "text-white" },
  { bg: "bg-lime-600", text: "text-white" },
  { bg: "bg-slate-500", text: "text-white" },
];

/** Hand-picked mappings, mostly lifted from Monash's own faculty palette. */
const KNOWN: Record<string, { bg: string; text: string }> = {
  FIT: { bg: "bg-[#5b2d90]", text: "text-white" }, // IT — Monash purple
  ENG: { bg: "bg-[#d35400]", text: "text-white" }, // Engineering — orange
  MEC: { bg: "bg-[#d35400]", text: "text-white" },
  CIV: { bg: "bg-[#d35400]", text: "text-white" },
  ELE: { bg: "bg-[#d35400]", text: "text-white" },
  SCI: { bg: "bg-teal-600", text: "text-white" }, // Science — teal
  MAT: { bg: "bg-teal-600", text: "text-white" },
  MTH: { bg: "bg-teal-600", text: "text-white" },
  PHY: { bg: "bg-teal-700", text: "text-white" },
  CHM: { bg: "bg-teal-700", text: "text-white" },
  BIO: { bg: "bg-emerald-600", text: "text-white" },
  BMS: { bg: "bg-emerald-600", text: "text-white" },
  BUS: { bg: "bg-blue-600", text: "text-white" }, // Business
  ECF: { bg: "bg-blue-600", text: "text-white" },
  ECC: { bg: "bg-blue-600", text: "text-white" },
  MGF: { bg: "bg-blue-600", text: "text-white" },
  MGW: { bg: "bg-blue-600", text: "text-white" },
  MKF: { bg: "bg-blue-600", text: "text-white" },
  ACF: { bg: "bg-blue-700", text: "text-white" },
  ACX: { bg: "bg-blue-700", text: "text-white" },
  ACB: { bg: "bg-blue-700", text: "text-white" },
  LAW: { bg: "bg-rose-700", text: "text-white" }, // Law
  JUR: { bg: "bg-rose-700", text: "text-white" },
  ART: { bg: "bg-pink-600", text: "text-white" }, // Arts
  ATS: { bg: "bg-pink-600", text: "text-white" },
  HIS: { bg: "bg-pink-700", text: "text-white" },
  MUS: { bg: "bg-fuchsia-600", text: "text-white" },
  THE: { bg: "bg-fuchsia-600", text: "text-white" },
  MED: { bg: "bg-red-600", text: "text-white" }, // Medicine
  PHH: { bg: "bg-red-600", text: "text-white" },
  NUR: { bg: "bg-red-700", text: "text-white" },
  PHA: { bg: "bg-red-500", text: "text-white" },
  OCC: { bg: "bg-red-500", text: "text-white" },
  PSY: { bg: "bg-purple-600", text: "text-white" },
  EDF: { bg: "bg-sky-600", text: "text-white" }, // Education
  EDU: { bg: "bg-sky-600", text: "text-white" },
  ARC: { bg: "bg-amber-600", text: "text-white" }, // Art, Design, Architecture
  DES: { bg: "bg-amber-600", text: "text-white" },
  IND: { bg: "bg-amber-600", text: "text-white" },
};

export function facultyStyle(code: string): FacultyStyle {
  const prefix = code.slice(0, 3).toUpperCase();
  const hit = KNOWN[prefix];
  if (hit) {
    return { label: prefix, railClass: hit.bg, railTextClass: hit.text };
  }
  // Hash to a stable fallback slot — same code always lands on the same colour.
  const slot = FALLBACK_PALETTE[hashString(prefix) % FALLBACK_PALETTE.length];
  return { label: prefix, railClass: slot.bg, railTextClass: slot.text };
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
