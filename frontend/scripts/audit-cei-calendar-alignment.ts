/**
 * Confronto calendario app (saintsCalendar) vs pagina CEI «Liturgia del giorno».
 * Passo 1: rank/colore/titolo primario CEI per ogni giorno dell'anno.
 * Passo 2: simula resolveLiturgicalColorForDay + banner come in app.
 *
 * Uso:
 *   npx tsx scripts/audit-cei-calendar-alignment.ts [anno]
 *   npx tsx scripts/audit-cei-calendar-alignment.ts 2026-10-17 2027-01-13
 */
import { writeFileSync } from "node:fs";
import { parseLocalDate, localDateStr, addDays } from "../src/dateUtils";
import {
  getLiturgicalSeason,
  getSaintsForDate,
  resolveLiturgicalColorForDay,
  isCalendarFeastObservedOnDate,
} from "../src/localLiturgy";
import {
  parseBannerCelebration,
  homeStripDayMeta,
  calendarCelebrationBannerTitle,
} from "../src/homeBannerUtils";
import { shouldSuppressFacultativeMemory } from "../src/liturgicalCelebrationUtils";
import {
  extractCelebrationColorBlocksFromHtml,
  extractPrimaryCelebrationTitleFromCeiHtml,
  pickPrimaryCeiMassBlock,
} from "../src/liturgicalColorUtils";
import { fetchCeiHtml, resolveLiturgyFromCeiHtml } from "../src/liturgyScraper";

function extractPageTitleFromCeiHtml(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return "";
  let t = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/\s*[-–—]\s*sito\s+ufficiale.*$/i, "").trim();
  t = t.replace(/^Liturgi[ae]?\s+del(?:l['’]a)?\s+giorno\s+\d{1,2}\s+\w+\s+\d{4}\s*[-–—]\s*/i, "").trim();
  return t;
}
import saintsCalendar from "../src/data/saintsCalendar.json";
import catalog from "../src/data/optionalSaintsCatalog.json";

function resolveAuditWindow(): { startISO: string; endISO: string; outFile: string; label: string } {
  const a = process.argv[2] || "2026";
  const b = process.argv[3];
  if (/^\d{4}-\d{2}-\d{2}$/.test(a) && b && /^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return {
      startISO: a,
      endISO: b,
      outFile: `scripts/_cei-calendar-alignment_${a}_${b}.json`,
      label: `${a} → ${b}`,
    };
  }
  const year = Number(a) || 2026;
  return {
    startISO: `${year}-01-01`,
    endISO: `${year}-12-31`,
    outFile: `scripts/_cei-calendar-alignment-${year}.json`,
    label: `anno ${year}`,
  };
}

const WINDOW = resolveAuditWindow();

type Issue = {
  iso: string;
  kind: string;
  detail: string;
  severity: "high" | "medium" | "low";
};

type DayRow = {
  iso: string;
  ceiPageTitle: string;
  ceiPrimaryH3: string | null;
  ceiOgFacoltativa: boolean;
  ceiOgObbligatoria: boolean;
  ceiPrimaryColor: string | null;
  ceiBlockCount: number;
  calendarBest: { title: string; rank: string; color: string; observed: boolean } | null;
  appTitle: string;
  appColor: string;
  stripColor: string;
  stripSubtitle: string | null;
  bannerRank: string;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleAligns(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const fa = na.split(" ").filter((w) => w.length > 3);
  const fb = nb.split(" ").filter((w) => w.length > 3);
  const hit = fa.filter((w) => fb.some((x) => x === w || x.startsWith(w)));
  return hit.length >= 2;
}

function isFeriaLikeTitle(t: string): boolean {
  const x = norm(t);
  return (
    /\bsettimana\b/.test(x) ||
    /\bferia\b/.test(x) ||
    /\blunedi\b|\bmartedi\b|\bmercoledi\b|\bgiovedi\b|\bvenerdi\b|\bsabato\b/.test(x) ||
    /\bdomenica\b/.test(x) ||
    /\bottava\b/.test(x) ||
    /fra l ottava/.test(x)
  );
}

function bestCalendarSaint(date: Date) {
  const season = getLiturgicalSeason(date);
  const saints = getSaintsForDate(date);
  if (!saints.length) return null;
  const rankPriority: Record<string, number> = {
    solennita: 1,
    festa: 2,
    memoria_obbligatoria: 3,
    memoria_facoltativa: 4,
  };
  let best = saints[0];
  for (const s of saints) {
    if (rankPriority[s.rank] < rankPriority[best.rank]) best = s;
  }
  return {
    title: best.title,
    rank: best.rank,
    color: best.color,
    observed: isCalendarFeastObservedOnDate(best, date, season.season),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = await Promise.all(items.slice(i, i + limit).map(fn));
    out.push(...chunk);
    if (i + limit < items.length) await sleep(200);
  }
  return out;
}

async function auditRange(startISO: string, endISO: string): Promise<{ rows: DayRow[]; issues: Issue[] }> {
  const issues: Issue[] = [];
  const rows: DayRow[] = [];
  const dates: Date[] = [];
  let d = parseLocalDate(startISO);
  const end = parseLocalDate(endISO);
  while (d.getTime() <= end.getTime()) {
    dates.push(new Date(d.getTime()));
    d = addDays(d, 1);
  }

  const catalogDates = new Set(
    (catalog as { saints: { date: string }[] }).saints.map((s) => s.date),
  );
  const calFacultative = new Map<string, string[]>();
  for (const day of saintsCalendar as { date: string; celebrations: { title: string; rank: string }[] }[]) {
    for (const c of day.celebrations) {
      if (c.rank === "memoria_facoltativa") {
        const list = calFacultative.get(day.date) ?? [];
        list.push(c.title);
        calFacultative.set(day.date, list);
      }
    }
  }

  await mapPool(dates, 4, async (date) => {
    const iso = localDateStr(date);
    const season = getLiturgicalSeason(date);
    const saints = getSaintsForDate(date);
    const cal = bestCalendarSaint(date);
    const html = await fetchCeiHtml(date);

    let ceiPageTitle = "";
    let ceiPrimaryH3: string | null = null;
    let ceiOgFacoltativa = false;
    let ceiOgObbligatoria = false;
    let ceiPrimaryColor: string | null = null;
    let ceiBlockCount = 0;
    let appTitle = "";
    let appColor = "";
    let scrapedLiturgicalColor = "";

    if (html) {
      ceiPageTitle = extractPageTitleFromCeiHtml(html);
      ceiOgFacoltativa = /\bmemoria\s+facoltativa\b/i.test(ceiPageTitle);
      ceiOgObbligatoria = /\bmemoria\s+obbligatoria\b/i.test(ceiPageTitle);
      ceiPrimaryH3 = extractPrimaryCelebrationTitleFromCeiHtml(html);
      const blocks = extractCelebrationColorBlocksFromHtml(html);
      ceiBlockCount = blocks.length;
      const primaryBlock = pickPrimaryCeiMassBlock(blocks, null);
      ceiPrimaryColor = primaryBlock?.color ?? null;

      const resolved = resolveLiturgyFromCeiHtml(html, date, "calendar_day");
      scrapedLiturgicalColor = resolved.liturgical_color || "";
      appTitle = resolved.title;
      const final = resolveLiturgicalColorForDay(
        date,
        season,
        saints,
        resolved.title,
        resolved.liturgical_color,
      );
      appColor = final.color;
    }

    const strip = homeStripDayMeta(
      date,
      appTitle || ceiPageTitle,
      null,
      scrapedLiturgicalColor,
    );
    const banner = parseBannerCelebration(appTitle || ceiPageTitle, season.season, date);

    const row: DayRow = {
      iso,
      ceiPageTitle,
      ceiPrimaryH3,
      ceiOgFacoltativa,
      ceiOgObbligatoria,
      ceiPrimaryColor,
      ceiBlockCount,
      calendarBest: cal,
      appTitle,
      appColor,
      stripColor: strip.liturgicalColor,
      stripSubtitle: strip.subtitle,
      bannerRank: banner.rankLabel,
    };
    rows.push(row);

    if (!html) {
      issues.push({ iso, kind: "cei-fetch-fail", detail: "HTML non disponibile", severity: "medium" });
      return;
    }

    // --- Rank calendar vs CEI (santo nel titolo pagina) ---
    if (cal?.observed && cal.rank === "memoria_obbligatoria") {
      if (ceiOgFacoltativa && titleAligns(ceiPageTitle, cal.title)) {
        issues.push({
          iso,
          kind: "cal-obblig-cei-facoltativa",
          detail: `Calendario obbligatoria; CEI facoltativa: «${cal.title}»`,
          severity: "high",
        });
      }
      if (
        isFeriaLikeTitle(appTitle) &&
        !shouldSuppressFacultativeMemory(ceiPageTitle) &&
        titleAligns(ceiPageTitle, cal.title) &&
        ceiOgFacoltativa
      ) {
        issues.push({
          iso,
          kind: "feria-title-facoltativa-saint",
          detail: `Titolo app feria «${appTitle}» ma CEI facoltativa «${cal.title}»`,
          severity: "high",
        });
      }
    }

    if (cal?.rank === "memoria_facoltativa") {
      const inCatalog = catalogDates.has(iso.slice(5));
      if (!inCatalog) {
        issues.push({
          iso,
          kind: "facoltativa-not-in-catalog",
          detail: cal.title,
          severity: "low",
        });
      }
      if (ceiOgObbligatoria && titleAligns(ceiPageTitle, cal.title)) {
        issues.push({
          iso,
          kind: "cal-facolt-cei-obblig",
          detail: cal.title,
          severity: "medium",
        });
      }
    }

    // --- Colore feria + bianco (bug 22 ott) ---
    if (
      isFeriaLikeTitle(banner.displayTitle) &&
      banner.rankLabel === "Feria" &&
      (appColor === "bianco" || strip.liturgicalColor === "bianco") &&
      season.color === "verde"
    ) {
      issues.push({
        iso,
        kind: "feria-green-season-white-app",
        detail: `banner feria, season verde, app/strip bianco (title=${appTitle})`,
        severity: "high",
      });
    }

    if (ceiPrimaryColor && appColor && ceiPrimaryColor !== appColor && isFeriaLikeTitle(appTitle)) {
      issues.push({
        iso,
        kind: "app-color-not-cei-primary",
        detail: `CEI primario ${ceiPrimaryColor}, app ${appColor}, titolo «${appTitle}»`,
        severity: "high",
      });
    }

    // CEI due formulari: pagina facoltativa ma primario feria (comportamento atteso se non si sceglie santo)
    if (
      ceiOgFacoltativa &&
      ceiBlockCount >= 2 &&
      ceiPrimaryH3 &&
      isFeriaLikeTitle(ceiPrimaryH3) &&
      cal?.rank === "memoria_facoltativa" &&
      titleAligns(ceiPageTitle, cal.title)
    ) {
      // informational only — not an issue if catalog + optional selection exists
    }

    if (
      cal?.observed &&
      cal.rank === "memoria_obbligatoria" &&
      isFeriaLikeTitle(appTitle) &&
      !ceiOgFacoltativa &&
      !titleAligns(ceiPageTitle, cal.title)
    ) {
      issues.push({
        iso,
        kind: "cal-obblig-hidden-by-cei-feria",
        detail: `Calendario «${cal.title}» osservata ma messa CEI «${appTitle}»`,
        severity: "medium",
      });
    }
  });

  rows.sort((a, b) => a.iso.localeCompare(b.iso));
  issues.sort((a, b) => a.iso.localeCompare(b.iso));
  return { rows, issues };
}

function summarize(issues: Issue[]) {
  const byKind: Record<string, Issue[]> = {};
  for (const i of issues) {
    (byKind[i.kind] ??= []).push(i);
  }
  console.log("\n=== PER TIPO (conteggio) ===");
  for (const [k, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
    const sev = list[0]?.severity ?? "?";
    console.log(`  ${list.length}\t[${sev}]\t${k}`);
  }
  console.log("\n=== ALTA PRIORITÀ ===");
  for (const i of issues.filter((x) => x.severity === "high")) {
    console.log(`  ${i.iso}  ${i.kind}: ${i.detail}`);
  }
  console.log("\n=== MEDIA (max 25) ===");
  for (const i of issues.filter((x) => x.severity === "medium").slice(0, 25)) {
    console.log(`  ${i.iso}  ${i.kind}: ${i.detail}`);
  }
}

function summarizeRangeExtras(rows: DayRow[]) {
  const stripMismatch = rows.filter((r) => r.stripColor && r.appColor && r.stripColor !== r.appColor);
  console.log("\n=== STRISCIA vs MESSA (colore) ===");
  console.log(stripMismatch.length ? "  mismatch:" : "  nessun mismatch strip/app");
  for (const r of stripMismatch) {
    const season = getLiturgicalSeason(parseLocalDate(r.iso)).season;
    console.log(`  ${r.iso} [${season}] strip=${r.stripColor} app=${r.appColor} | ${r.appTitle.slice(0, 55)}`);
  }

  const bySeason: Record<string, number> = {};
  for (const r of rows) {
    const s = getLiturgicalSeason(parseLocalDate(r.iso)).season;
    bySeason[s] = (bySeason[s] || 0) + 1;
  }
  console.log("\n=== Giorni per stagione (app) ===");
  for (const [s, n] of Object.entries(bySeason).sort()) {
    console.log(`  ${n}\t${s}`);
  }

  const nataleWindow = rows.filter((r) => {
    const s = getLiturgicalSeason(parseLocalDate(r.iso)).season;
    return s === "Natale" || s === "Avvento";
  });
  const highRisk = nataleWindow.filter(
    (r) =>
      r.stripColor !== r.appColor ||
      (r.bannerRank === "Feria" && (r.appColor === "bianco" || r.stripColor === "bianco") &&
        getLiturgicalSeason(parseLocalDate(r.iso)).color === "verde"),
  );
  if (highRisk.length) {
    console.log("\n=== Avvento/Natale — controlli colore (attenzione) ===");
    for (const r of highRisk) {
      console.log(
        `  ${r.iso} strip=${r.stripColor} app=${r.appColor} rank=${r.bannerRank} | ${r.appTitle.slice(0, 50)}`,
      );
    }
  } else {
    console.log("\n=== Avvento/Natale — nessuna anomalia colore feria/bianco ===");
  }
}

async function main() {
  const dayCount =
    daysBetween(parseLocalDate(WINDOW.startISO), parseLocalDate(WINDOW.endISO)) + 1;
  console.log(`Audit CEI ↔ calendario — ${WINDOW.label} (${dayCount} giorni, fetch CEI)...`);
  const { rows, issues } = await auditRange(WINDOW.startISO, WINDOW.endISO);
  writeFileSync(
    WINDOW.outFile,
    JSON.stringify(
      {
        window: WINDOW,
        issueCount: issues.length,
        issues,
        rows,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Scritto ${WINDOW.outFile}`);
  console.log(`Totale issue: ${issues.length}`);
  summarize(issues);
  summarizeRangeExtras(rows);

  // Passo 2: solo calendario obbligatorie vs CEI facoltativa nel titolo (doppio controllo senza logica strip)
  const obbligFacolt: string[] = [];
  for (const row of rows) {
    if (!row.calendarBest?.observed) continue;
    if (row.calendarBest.rank !== "memoria_obbligatoria") continue;
    if (row.ceiOgFacoltativa && titleAligns(row.ceiPageTitle, row.calendarBest.title)) {
      obbligFacolt.push(`${row.iso} ${row.calendarBest.title}`);
    }
  }
  console.log("\n=== PASSO 2: memorie OBBLIGATORIE in calendario ma CEI dice FACOLTATIVA (titolo) ===");
  console.log(obbligFacolt.length ? obbligFacolt.join("\n") : "  (nessuna)");
}

function daysBetween(a: Date, b: Date): number {
  const a0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const b0 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((b0 - a0) / 86_400_000);
}

void main();
