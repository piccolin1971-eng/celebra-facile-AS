/**
 * Controllo approfondito memorie facoltative (bios, liturgia, conflitti Home).
 * Uso: npx tsx scripts/audit-optional-saints-full.ts
 */
import catalog from "../src/data/optionalSaintsCatalog.json";
import bios from "../src/data/optionalSaintBios.json";
import bundles from "../src/data/optionalSaintLiturgyBundles.json";
import { getOptionalSaintBioPreview } from "../src/optionalSaintBio";
import { getOptionalSaintLiturgyBundle } from "../src/optionalSaintLiturgyBundles";
import {
  getSaintLectionaryForDate,
  hasInlineProperReadings,
  mergeOptionalSaintLectionaryIntoLiturgy,
} from "../src/saintLectionary";
import { resolveOptionalSaintHome } from "../src/optionalSaintHome";
import { calendarCelebrationBannerTitle } from "../src/homeBannerUtils";
import { parseLocalDate, localDateStr } from "../src/dateUtils";
import { fetchCeiHtml, resolveLiturgyFromCeiHtmlForOptionalSaint } from "../src/liturgyScraper";
import { getVigilEveContext } from "../src/vigilCatalog";
import { optionalSaintBannerTitle, otherSaintOnSameDate } from "../src/optionalSaints";
import type { Liturgy } from "../src/localLiturgy";

type Saint = { id: string; date: string; title: string; custom?: boolean };
const SAINTS = (catalog as { saints: Saint[] }).saints;
const YEAR = 2026;

const REQUIRED_READING_TYPES = ["colletta", "prima_lettura", "vangelo"];

function hasLiturgySources(saint: Saint): {
  cei: number;
  lec: boolean;
  bundleGospel: boolean;
  ok: boolean;
} {
  const iso = `${YEAR}-${saint.date}`;
  const d = parseLocalDate(iso);
  const lec = getSaintLectionaryForDate(d, saint.title);
  const lecOk = lec.length > 0 && hasInlineProperReadings(lec[0]);
  const bundle = getOptionalSaintLiturgyBundle(saint.id);
  const bundleGospel = !!bundle?.readings?.some((r) => r.type === "vangelo");
  return { cei: 0, lec: lecOk, bundleGospel, ok: lecOk || bundleGospel };
}

async function ceiReadingCount(saint: Saint): Promise<number> {
  const iso = `${YEAR}-${saint.date}`;
  const d = parseLocalDate(iso);
  const html = await fetchCeiHtml(d);
  if (!html) return 0;
  return resolveLiturgyFromCeiHtmlForOptionalSaint(html, d, saint.title).readings.length;
}

function auditBios(): string[] {
  const issues: string[] = [];
  const bioMap = bios as Record<string, { title: string; biography: string }>;
  for (const s of SAINTS) {
    const b = bioMap[s.id];
    if (!b) {
      issues.push(`BIO missing: ${s.id}`);
      continue;
    }
    const preview = getOptionalSaintBioPreview(s.id, optionalSaintBannerTitle(s));
    if (!preview) {
      issues.push(`BIO align fail: ${s.id} (${b.title} vs ${s.title})`);
    }
    if ((b.biography || "").length < 80) {
      issues.push(`BIO short: ${s.id}`);
    }
    if (
      /Sacrosanctum Concilium|Ordinamento Generale del Romano Missale/i.test(b.biography) ||
      (/Concilio Ecum/i.test(b.biography) &&
        !/Concilio Ecumenico Vaticano II/i.test(b.biography))
    ) {
      issues.push(`BIO wrong OCR chunk: ${s.id}`);
    }
  }
  return issues;
}

function auditCatalogDates(): string[] {
  const issues: string[] = [];
  const byDate = new Map<string, Saint[]>();
  for (const s of SAINTS) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  for (const [md, list] of byDate) {
    if (list.length > 1) {
      issues.push(
        `CATALOG same MM-DD ${md}: ${list.map((x) => x.id).join(" | ")} (solo uno attivabile in impostazioni)`,
      );
    }
  }
  return issues;
}

function auditBundles(): string[] {
  const issues: string[] = [];
  const bmap = bundles as Record<string, { readings: { type: string; text: string }[] }>;
  for (const s of SAINTS) {
    const b = bmap[s.id];
    const base: Liturgy = {
      date: `${YEAR}-${s.date}`,
      date_label: "",
      title: "Feria",
      liturgical_color: "verde",
      readings: [{ type: "colletta", title: "Colletta", reference: "", text: "Feria." }],
      source_url: "",
      saints: [],
    };
    const merged = mergeOptionalSaintLectionaryIntoLiturgy(base, s.title);
    const fromLec = merged?.readings ?? [];
    const fromBundle = b?.readings ?? [];
    const types = new Set([...fromLec, ...fromBundle].map((r) => r.type));
    const hasGospel = types.has("vangelo");
    const hasCollect = types.has("colletta");
    if (!hasGospel) {
      const src = hasLiturgySources(s);
      if (!src.lec && !src.bundleGospel) {
        issues.push(`LITURGY no vangelo path: ${s.id} (needs CEI at runtime)`);
      }
    }
    if (b) {
      for (const r of b.readings) {
        if (!r.text?.trim()) issues.push(`BUNDLE empty text: ${s.id} ${r.type}`);
      }
      const order = b.readings.map((r) => r.type);
      const collectaIdx = order.indexOf("colletta");
      const plIdx = order.indexOf("prima_lettura");
      if (collectaIdx >= 0 && plIdx >= 0 && collectaIdx > plIdx) {
        issues.push(`BUNDLE order: collecta after prima_lettura: ${s.id}`);
      }
    }
    if (!hasCollect && !b?.readings?.some((r) => r.type === "colletta") && !fromLec.length) {
      // CEI-only saints OK
    }
  }
  return issues;
}

function auditYearConflicts(selectedByMonthDay: Record<string, string>): string[] {
  const issues: string[] = [];
  const conflictDays: string[] = [];
  let choiceDays = 0;
  const start = parseLocalDate(`${YEAR}-01-01`);
  const end = parseLocalDate(`${YEAR}-12-31`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const iso = localDateStr(d);
    const vigil = getVigilEveContext(d);
    if (vigil) continue;
    const calTitle = calendarCelebrationBannerTitle(d) || "";
    const res = resolveOptionalSaintHome({
      useSelection: true,
      selectedByMonthDay,
      date: d,
      dateISO: iso,
      calendarCeiTitle: calTitle,
      savedLinePick: null,
    });
    if (res.showLineChoice) {
      choiceDays++;
      const md = iso.slice(5);
      const saint = res.saint?.id ?? "?";
      conflictDays.push(`${iso} ${saint} vs «${calTitle.slice(0, 50)}…»`);
    }
  }
  console.log(`\nGiorni con scelta Calendario/Santo (${YEAR}): ${choiceDays}`);
  for (const line of conflictDays.slice(0, 40)) console.log("  ", line);
  if (conflictDays.length > 40) console.log(`  … +${conflictDays.length - 40} altri`);
  return issues;
}

async function auditCeiCoverage(): Promise<string[]> {
  const issues: string[] = [];
  for (const s of SAINTS) {
    const n = await ceiReadingCount(s);
    const src = hasLiturgySources(s);
    src.cei = n;
    const ok = n > 0 || src.lec || src.bundleGospel;
    if (!ok) issues.push(`LITURGY total gap: ${s.id}`);
  }
  return issues;
}

async function runPass(pass: number) {
  console.log(`\n========== PASS ${pass} ==========\n`);
  const bioIssues = auditBios();
  const catIssues = auditCatalogDates();
  const bundleIssues = auditBundles();

  const allSelected: Record<string, string> = {};
  for (const s of SAINTS) allSelected[s.date] = s.id;

  const conflictIssues = auditYearConflicts(allSelected);
  const ceiIssues = await auditCeiCoverage();

  const all = [...bioIssues, ...catIssues, ...bundleIssues, ...conflictIssues, ...ceiIssues];
  console.log("\n--- Riepilogo issue ---");
  if (all.length === 0) console.log("(nessun issue automatico)");
  else for (const i of all) console.log("!", i);
  console.log(`Totale issue pass ${pass}: ${all.length}`);
  return all;
}

void (async () => {
  const p1 = await runPass(1);
  const p2 = await runPass(2);
  const same = p1.length === p2.length && p1.every((v, i) => v === p2[i]);
  console.log(`\nPass 1 e 2 coerenti: ${same ? "sì" : "NO"}`);
  process.exit(p1.length > 0 ? 1 : 0);
})();
