/**
 * Verifica Home (banner, striscia, chip, colori) per tutti i santi facoltativi — anno intero.
 * Uso: npx tsx scripts/audit-optional-saints-home-ui.ts
 */
import catalog from "../src/data/optionalSaintsCatalog.json";
import {
  homeBannerLiturgicalColor,
  homeStripDayMeta,
  calendarCelebrationBannerTitle,
  formatCelebrationTitle,
} from "../src/homeBannerUtils";
import { homeBannerTitleFromResolution } from "../src/optionalSaintHome";
import { parseLocalDate, localDateStr } from "../src/dateUtils";
import { getVigilEveContext } from "../src/vigilCatalog";
import {
  optionalSaintHomeLiturgicalColor,
  optionalSaintStripOverlay,
  resolveOptionalSaintHome,
} from "../src/optionalSaintHome";
import { optionalSaintLiturgicalColor } from "../src/optionalSaintLiturgyBundles";
import { optionalSaintBannerTitle, otherSaintOnSameDate } from "../src/optionalSaints";
import { getOptionalSaintBioPreview } from "../src/optionalSaintBio";

type Saint = { id: string; date: string; title: string; custom?: boolean };
const SAINTS = (catalog as { saints: Saint[] }).saints;
const YEARS = [2026, 2027];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function selectionForSaint(saintId: string): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const s of SAINTS) {
    if (s.id === saintId) selected[s.date] = s.id;
  }
  return selected;
}

function fakeCeiFeriaTitle(date: Date): string {
  const cal = calendarCelebrationBannerTitle(date);
  if (cal.trim()) return cal;
  const season = date.getDay() === 0 ? "Domenica" : "Feria";
  return `${season} del Tempo Ordinario — simulazione CEI feriale`;
}

type Issue = { code: string; detail: string };

function auditSaintFeastDay(saint: Saint, year: number): Issue[] {
  const issues: Issue[] = [];
  const iso = `${year}-${saint.date}`;
  const date = parseLocalDate(iso);
  if (getVigilEveContext(date)) {
    issues.push({ code: "VIGIL", detail: `${saint.id} ${iso} è vigilia — fuori scope Home standard` });
    return issues;
  }

  const calTitle = calendarCelebrationBannerTitle(date) || fakeCeiFeriaTitle(date);
  const selected = selectionForSaint(saint.id);
  const res = resolveOptionalSaintHome({
    useSelection: true,
    selectedByMonthDay: selected,
    date,
    dateISO: iso,
    calendarCeiTitle: calTitle,
    savedLinePick: null,
  });

  if (!res.saint || res.saint.id !== saint.id) {
    issues.push({ code: "RESOLVE", detail: `${saint.id} ${iso}: santo non risolto` });
    return issues;
  }

  const optTitle = optionalSaintBannerTitle(saint);
  if (res.optionalBannerTitle !== optTitle) {
    issues.push({
      code: "OPT_TITLE",
      detail: `${saint.id}: optionalBannerTitle mismatch «${res.optionalBannerTitle}» vs «${optTitle}»`,
    });
  }

  if (!/\bmemoria\s+facoltativa\b/i.test(res.optionalBannerTitle)) {
    issues.push({
      code: "OPT_TITLE_SUFFIX",
      detail: `${saint.id}: manca suffisso MEMORIA FACOLTATIVA nel banner`,
    });
  }

  if (saint.id === SAINTS.find((x) => x.date === saint.date)?.id) {
    const other = otherSaintOnSameDate(saint.id, saint.date);
    if (other) {
      issues.push({
        code: "CATALOG_DUP_DATE",
        detail: `${saint.date}: ${saint.id} | ${other.id} (un solo toggle in impostazioni)`,
      });
    }
  }

  const preview = getOptionalSaintBioPreview(saint.id, res.optionalBannerTitle);
  if (!preview) {
    issues.push({ code: "BIO_PREVIEW", detail: `${saint.id}: bio preview assente` });
  }

  if (res.showLineChoice) {
    if (!res.calendarBannerTitle.trim()) {
      issues.push({ code: "CHIP", detail: `${saint.id} ${iso}: calendarBannerTitle vuoto con chip` });
    }
    if (res.activeLine !== "calendar") {
      issues.push({ code: "CHIP_DEFAULT", detail: `${saint.id} ${iso}: atteso activeLine calendar senza pick salvato` });
    }
    const resOpt = resolveOptionalSaintHome({
      useSelection: true,
      selectedByMonthDay: selected,
      date,
      dateISO: iso,
      calendarCeiTitle: calTitle,
      savedLinePick: "optional",
    });
    if (resOpt.activeLine !== "optional") {
      issues.push({ code: "CHIP_OPT", detail: `${saint.id} ${iso}: pick optional non applicato` });
    }
    auditOptionalLine(saint, iso, date, calTitle, resOpt, issues, "conflict+optional");
    return issues;
  }

  if (res.activeLine !== "optional") {
    issues.push({
      code: "ACTIVE_LINE",
      detail: `${saint.id} ${iso}: atteso optional senza conflitto, got ${res.activeLine}`,
    });
  }

  auditOptionalLine(saint, iso, date, calTitle, res, issues, "auto-optional");
  return issues;
}

function auditOptionalLine(
  saint: Saint,
  iso: string,
  date: Date,
  calTitle: string,
  res: ReturnType<typeof resolveOptionalSaintHome>,
  issues: Issue[],
  ctx: string,
) {
  const bannerTitle = homeBannerTitleFromResolution(res);
  const saintNorm = norm(formatCelebrationTitle(saint.title));
  const bannerNorm = norm(bannerTitle);
  const key = saintNorm.split(" ").slice(0, 2).join(" ");
  if (key.length > 3 && !bannerNorm.includes(key)) {
    issues.push({
      code: "BANNER_NAME",
      detail: `${saint.id} ${iso} (${ctx}): banner «${bannerTitle}» non contiene «${key}»`,
    });
  }

  const optColor = optionalSaintHomeLiturgicalColor(res);
  const bundleColor = optionalSaintLiturgicalColor(saint.id);
  if (res.activeLine === "optional") {
    if (!optColor) {
      issues.push({ code: "BANNER_COLOR", detail: `${saint.id} ${iso}: colore optional null (${saint.id})` });
    } else if (bundleColor && optColor !== bundleColor) {
      issues.push({
        code: "BANNER_COLOR",
        detail: `${saint.id} ${iso}: colore ${optColor} ≠ bundle ${bundleColor}`,
      });
    }
    const calColor = homeBannerLiturgicalColor(date, "calendar_day", null, calTitle);
    const merged = optColor ?? calColor;
    if (merged === "verde" && bundleColor && bundleColor !== "verde") {
      issues.push({
        code: "BANNER_COLOR_GREEN",
        detail: `${saint.id} ${iso}: resta verde ma bundle è ${bundleColor}`,
      });
    }
  }

  const selected = selectionForSaint(saint.id);
  const stripOverlay = optionalSaintStripOverlay({
    useSelection: true,
    selectedByMonthDay: selected,
    date,
    calendarCeiTitle: fakeCeiFeriaTitle(date),
    savedLinePick: res.activeLine === "optional" ? "optional" : null,
    isSelectedDate: true,
  });

  if (res.activeLine === "optional") {
    if (!stripOverlay) {
      issues.push({ code: "STRIP_OVERLAY", detail: `${saint.id} ${iso}: strip overlay mancante` });
    } else {
      const stripMeta = homeStripDayMeta(date, fakeCeiFeriaTitle(date), stripOverlay);
      if (stripMeta.liturgicalColor !== stripOverlay.liturgicalColor) {
        issues.push({ code: "STRIP_COLOR", detail: `${saint.id} ${iso}: strip color mismatch` });
      }
      const subNorm = norm(stripMeta.subtitle || "");
      const nameKey = norm(saint.title.split(",")[0] || saint.title);
      if (nameKey.length > 3 && !subNorm.includes(nameKey) && !nameKey.includes(subNorm)) {
        issues.push({
          code: "STRIP_SUBTITLE",
          detail: `${saint.id} ${iso}: strip «${stripMeta.subtitle}» non corrisponde a «${saint.title}»`,
        });
      }
      if (/settimana del tempo ordinario/i.test(subNorm)) {
        issues.push({
          code: "STRIP_FERIA",
          detail: `${saint.id} ${iso}: strip ancora feria ordinario`,
        });
      }
    }
  } else if (stripOverlay) {
    issues.push({
      code: "STRIP_UNEXPECTED",
      detail: `${saint.id} ${iso}: overlay strip con linea calendario`,
    });
  }
}

function auditAllConflictDays(year: number): { issues: Issue[]; choiceDays: string[] } {
  const issues: Issue[] = [];
  const choiceDays: string[] = [];
  const allSelected: Record<string, string> = {};
  for (const s of SAINTS) allSelected[s.date] = s.id;

  const start = parseLocalDate(`${year}-01-01`);
  const end = parseLocalDate(`${year}-12-31`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const iso = localDateStr(d);
    if (getVigilEveContext(d)) continue;
    const calTitle = calendarCelebrationBannerTitle(d) || fakeCeiFeriaTitle(d);
    const res = resolveOptionalSaintHome({
      useSelection: true,
      selectedByMonthDay: allSelected,
      date: d,
      dateISO: iso,
      calendarCeiTitle: calTitle,
      savedLinePick: null,
    });
    if (!res.showLineChoice) continue;
    choiceDays.push(`${iso} ${res.saint?.id ?? "?"}`);
    if (!res.optionalBannerTitle.trim() || !res.calendarBannerTitle.trim()) {
      issues.push({ code: "CHIP_EMPTY", detail: `${iso}: titoli chip incompleti` });
    }
  }
  return { issues, choiceDays };
}

function run(): Issue[] {
  const issues: Issue[] = [];
  for (const year of YEARS) {
    console.log(`\n=== Anno ${year} — giorno festivo per santo (${SAINTS.length}) ===`);
    for (const s of SAINTS) {
      const dayIssues = auditSaintFeastDay(s, year);
      const mark = dayIssues.length ? `ISSUES×${dayIssues.length}` : "OK";
      const res = resolveOptionalSaintHome({
        useSelection: true,
        selectedByMonthDay: selectionForSaint(s.id),
        date: parseLocalDate(`${year}-${s.date}`),
        dateISO: `${year}-${s.date}`,
        calendarCeiTitle:
          calendarCelebrationBannerTitle(parseLocalDate(`${year}-${s.date}`)) || "",
        savedLinePick: null,
      });
      const mode = res.showLineChoice ? "chip" : "auto-opt";
      console.log(`  ${s.id.padEnd(24)} ${s.date}  ${mode.padEnd(8)} ${mark}`);
      issues.push(...dayIssues);
    }

    const { issues: cIssues, choiceDays } = auditAllConflictDays(year);
    issues.push(...cIssues);
    console.log(`\n=== ${year}: giorni con chip Calendario/Santo: ${choiceDays.length} ===`);
    for (const line of choiceDays) console.log(`    ${line}`);
  }

  const dupDates = new Map<string, string[]>();
  for (const s of SAINTS) {
    const list = dupDates.get(s.date) ?? [];
    list.push(s.id);
    dupDates.set(s.date, list);
  }
  console.log("\n=== Date catalogo con più santi ===");
  for (const [md, ids] of dupDates) {
    if (ids.length > 1) console.log(`    ${md}: ${ids.join(" | ")}`);
  }

  console.log("\n=== Riepilogo issue ===");
  if (issues.length === 0) {
    console.log("(nessun issue)");
  } else {
    const byCode = new Map<string, number>();
    for (const i of issues) {
      byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
      console.log(`! [${i.code}] ${i.detail}`);
    }
    console.log("\nConteggio per codice:");
    for (const [c, n] of [...byCode.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  ${c}: ${n}`);
    }
  }
  console.log(`\nTotale issue: ${issues.length}`);
  return issues;
}

const issues = run();
const hard = issues.filter((i) => i.code !== "CATALOG_DUP_DATE" && i.code !== "VIGIL");
process.exit(hard.length > 0 ? 1 : 0);
