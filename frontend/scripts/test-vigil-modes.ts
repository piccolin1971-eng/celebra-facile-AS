/**
 * Verifica automatica modalità vigilia su date campione CEI.
 * Esegui: npx tsx scripts/test-vigil-modes.ts
 */
import { fetchCeiHtml, resolveLiturgyFromCeiHtml, scrapeLiturgy } from "../src/liturgyScraper";
import { parseLocalDate } from "../src/dateUtils";
import type { CelebrationMode } from "../src/massSession";

type Case = {
  id: string;
  date: string;
  mode: CelebrationMode;
  titleIncludes?: RegExp;
  readingIncludes?: RegExp;
  readingExcludes?: RegExp;
};

const CASES: Case[] = [
  {
    id: "pp-vigil-proper",
    date: "2026-06-28",
    mode: "vigil_proper",
    titleIncludes: /pietro|paolo|vigil/i,
    readingIncludes: /At\s+3|3,\s*1-10/i,
    readingExcludes: /At\s+12|12,\s*1-11/i,
  },
  {
    id: "pp-calendar-day",
    date: "2026-06-28",
    mode: "calendar_day",
    titleIncludes: /XIII\s+DOMENICA|Tempo\s+Ordinario/i,
    readingExcludes: /At\s+12|12,\s*1-11/i,
  },
  {
    id: "pp-solemnity-day-on-29",
    date: "2026-06-29",
    mode: "calendar_day",
    titleIncludes: /pietro|paolo/i,
    readingIncludes: /At\s+12|12,\s*1-11/i,
  },
  {
    id: "natale-vigil-proper",
    date: "2025-12-24",
    mode: "vigil_proper",
    titleIncludes: /natale|vigil/i,
  },
  {
    id: "natale-calendar-mattino",
    date: "2025-12-24",
    mode: "calendar_day",
    titleIncludes: /mattino|24\s+dicembre|feria/i,
  },
  {
    id: "immacolata-solemnity-from-vigil-eve",
    date: "2025-12-07",
    mode: "solemnity_day",
    titleIncludes: /immacolat/i,
  },
  {
    id: "immacolata-advent-calendar",
    date: "2025-12-07",
    mode: "calendar_day",
    titleIncludes: /avvento|domenica/i,
    readingExcludes: /immacolat/i,
  },
  {
    id: "assunzione-vigil-proper",
    date: "2026-08-14",
    mode: "vigil_proper",
    titleIncludes: /assunzion|vigil/i,
  },
  {
    id: "assunzione-calendar-feria",
    date: "2026-08-14",
    mode: "calendar_day",
    readingExcludes: /assunzion/i,
  },
];

function readingBlob(lit: { readings?: { reference?: string; text?: string }[] }) {
  return (lit.readings || [])
    .map((r) => `${r.reference || ""} ${r.text || ""}`)
    .join("\n");
}

async function resolveForCase(c: Case) {
  const d = parseLocalDate(c.date);
  if (c.mode === "solemnity_day") {
    return scrapeLiturgy(d, c.mode);
  }
  const html = await fetchCeiHtml(d);
  if (!html) throw new Error("no html");
  return resolveLiturgyFromCeiHtml(html, d, c.mode);
}

async function main() {
  let failed = 0;
  for (const c of CASES) {
    try {
      const lit = await resolveForCase(c);
      const blob = `${lit.title}\n${readingBlob(lit)}`;
      let ok = true;
      if (c.titleIncludes && !c.titleIncludes.test(lit.title)) {
        console.error("FAIL", c.id, "title:", lit.title);
        ok = false;
      }
      if (c.readingIncludes && !c.readingIncludes.test(blob)) {
        console.error("FAIL", c.id, "missing reading:", c.readingIncludes);
        ok = false;
      }
      if (c.readingExcludes && c.readingExcludes.test(blob)) {
        console.error("FAIL", c.id, "excluded reading found");
        ok = false;
      }
      if (!lit.readings || lit.readings.length === 0) {
        console.error("FAIL", c.id, "no readings");
        ok = false;
      }
      if (ok) console.log("OK", c.id, "→", lit.title.slice(0, 72));
      else failed++;
    } catch (e) {
      console.error("FAIL", c.id, e);
      failed++;
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

void main();
