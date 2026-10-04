/**
 * Audit croci di congiunzione sulle 4 settimane del salterio.
 * Uso: npx tsx scripts/audit-join-cross-4w.ts [YYYY-MM-DD] [giorni]
 */
import { writeFileSync } from "fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { localDateStr, parseLocalDate } from "../src/dateUtils";
import { extractHoursBanner, liturgicalFragment } from "../src/ore/html";
import { hourHeadMeta } from "../src/ore/dayHead";
import { parseHourHtml, splitOraMediaHtml } from "../src/ore/parseHour";
import { hoursUrlForHour } from "../src/ore/scraper";
import { JOIN_CROSS_MARK, hasJoinCross } from "../src/ore/joinCross";
import type { OreBlock, OreHourId, MediaId } from "../src/ore/types";

const START = process.argv[2] || "2026-08-31";
const DAYS = Number(process.argv[3] || 28);

type Hit = {
  date: string;
  psalter: string;
  hour: string;
  raw: number;
  antJoins: number;
  bodyJoins: number;
  markCount: number;
  antLabs: string[];
  antPreview?: string;
  bodyPreview?: string;
  issues: string[];
};

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(dateISO: string, hour: OreHourId): Promise<string> {
  const url = hoursUrlForHour(dateISO, hour);
  const data = dateISO.replace(/-/g, "");
  const slug = url.match(/ora=([^&]+)/)?.[1] ? decodeURIComponent(url.match(/ora=([^&]+)/)![1]) : "";
  const fetchData = url.match(/data-liturgia=([^&]+)/)?.[1] || data;
  for (const tryUrl of [
    `http://localhost:8081/cei-ore?data-liturgia=${fetchData}&ora=${encodeURIComponent(slug)}`,
    `http://localhost:8083/cei-ore?data-liturgia=${fetchData}&ora=${encodeURIComponent(slug)}`,
    url,
  ]) {
    for (let a = 1; a <= 3; a++) {
      try {
        if (tryUrl.startsWith("http://localhost")) {
          const res = await fetch(tryUrl);
          if (res.ok) {
            const t = await res.text();
            if (t.length > 800) return t;
          }
        } else {
          const t = await fetchCeiUrl(tryUrl);
          if (t && t.length > 800) return t;
        }
      } catch {
        /* retry */
      }
      await sleep(400 * a);
    }
  }
  throw new Error(`fetch fail ${dateISO} ${hour}`);
}

function countRawJoinCrosses(html: string): number {
  const frag = liturgicalFragment(html);
  // CEI a volte mette <br>/nbsp prima del † dentro lo_rosso
  const re =
    /<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\s)*(?:&dagger;|†)(?:&nbsp;|\s|<br\s*\/?>)*<\/div>/gi;
  return (frag.match(re) || []).length;
}

function auditBlocks(blocks: OreBlock[]) {
  const antJoins: { lab: string; text: string }[] = [];
  const bodyJoins: { line: string; alone: boolean; okMerged: boolean }[] = [];
  let loneJoinStanzas = 0;
  let markCount = 0;

  for (const b of blocks) {
    if (b.k === "rubric" && /ant/i.test(b.lab) && hasJoinCross(b.text)) {
      markCount += b.text.split(JOIN_CROSS_MARK).length - 1;
      antJoins.push({ lab: b.lab, text: b.text });
    }
    if (b.k === "stanza") {
      if (b.lines.length === 1 && b.lines[0].trim() === JOIN_CROSS_MARK) loneJoinStanzas += 1;
      for (const line of b.lines) {
        if (!hasJoinCross(line)) continue;
        markCount += line.split(JOIN_CROSS_MARK).length - 1;
        const alone = line.trim() === JOIN_CROSS_MARK;
        // Croce all'inizio di riga con testo dopo (come sul CEI)
        const okMerged = new RegExp(`^${JOIN_CROSS_MARK}\\s+\\S`).test(line.trim());
        // Oppure croce in coda all'antifona-riga (accettabile in corpo solo se non sola)
        const okTrailing =
          !alone && line.trim().endsWith(JOIN_CROSS_MARK) && line.trim().length > 1;
        bodyJoins.push({ line, alone, okMerged: okMerged || okTrailing });
      }
    }
    if (b.k === "prose" && hasJoinCross(b.text)) {
      markCount += b.text.split(JOIN_CROSS_MARK).length - 1;
      const alone = b.text.trim() === JOIN_CROSS_MARK;
      const okMerged = new RegExp(`^${JOIN_CROSS_MARK}\\s+\\S`).test(b.text.trim());
      bodyJoins.push({ line: b.text, alone, okMerged: okMerged && !alone });
    }
  }
  return { antJoins, bodyJoins, loneJoinStanzas, markCount };
}

function show(s: string): string {
  return s.replaceAll(JOIN_CROSS_MARK, "†").replace(/\s+/g, " ").trim().slice(0, 110);
}

function analyze(date: string, psalter: string, hour: string, html: string): Hit | null {
  const raw = countRawJoinCrosses(html);
  const parsed = parseHourHtml(
    html,
    hour === "terza" || hour === "sesta" || hour === "nona" ? (hour as MediaId) : (hour as OreHourId),
    date,
  );
  const a = auditBlocks(parsed.blocks);
  if (raw === 0 && a.markCount === 0) return null;

  const issues: string[] = [];
  if (a.loneJoinStanzas > 0) issues.push(`strofa-sola-†×${a.loneJoinStanzas}`);
  for (const bj of a.bodyJoins) {
    if (bj.alone) issues.push("†-corpo-riga-vuota");
    else if (!bj.okMerged) issues.push(`†-corpo-posizione-strana: ${show(bj.line)}`);
  }
  if (raw > 0 && a.markCount === 0) issues.push(`raw=${raw} ma parse=0`);
  // Antifona con croce senza croce nel corpo dello stesso ora (sospetto)
  if (a.antJoins.length > 0 && a.bodyJoins.length === 0) issues.push("ant-con-†-senza-†-nel-corpo");
  // Croce solo nel corpo senza antifona marcata (possibile chiusura-only: OK, solo info)
  // non segnalare come errore

  return {
    date,
    psalter,
    hour,
    raw,
    antJoins: a.antJoins.length,
    bodyJoins: a.bodyJoins.length,
    markCount: a.markCount,
    antLabs: a.antJoins.map((x) => x.lab),
    antPreview: a.antJoins[0] ? show(a.antJoins[0].text) : undefined,
    bodyPreview: a.bodyJoins[0] ? show(a.bodyJoins[0].line) : undefined,
    issues,
  };
}

async function main() {
  const hits: Hit[] = [];
  const failures: { date: string; hour: string; err: string }[] = [];
  let daysPsalter = 0;
  let rawTotal = 0;
  let markTotal = 0;
  let antTotal = 0;

  for (let d = 0; d < DAYS; d++) {
    const dateISO = isoAdd(START, d);
    const date = parseLocalDate(dateISO);
    let psalter = "";

    // Lodi / Vespri / Ufficio
    for (const hour of ["lodi", "vespri", "ufficio"] as OreHourId[]) {
      try {
        const html = await fetchHtml(dateISO, hour);
        if (!psalter) {
          const banner = extractHoursBanner(html);
          psalter = hourHeadMeta(dateISO, "", banner).psalterLine || "";
        }
        const hit = analyze(dateISO, psalter, hour, html);
        if (hit) {
          hits.push(hit);
          rawTotal += hit.raw;
          markTotal += hit.markCount;
          antTotal += hit.antJoins;
        }
        await sleep(160);
      } catch (e: any) {
        failures.push({ date: dateISO, hour, err: String(e?.message || e) });
      }
    }

    // Ora media (terza/sesta/nona)
    try {
      const html = await fetchHtml(dateISO, "ora-media");
      if (!psalter) {
        const banner = extractHoursBanner(html);
        psalter = hourHeadMeta(dateISO, "", banner).psalterLine || "";
      }
      const parts = splitOraMediaHtml(html);
      for (const mid of ["terza", "sesta", "nona"] as MediaId[]) {
        const hit = analyze(dateISO, psalter, mid, parts[mid]);
        if (hit) {
          hits.push(hit);
          rawTotal += hit.raw;
          markTotal += hit.markCount;
          antTotal += hit.antJoins;
        }
      }
      await sleep(160);
    } catch (e: any) {
      failures.push({ date: dateISO, hour: "ora-media", err: String(e?.message || e) });
    }

    if (/salterio/i.test(psalter)) daysPsalter += 1;
    const dayHits = hits.filter((h) => h.date === dateISO);
    const dayIssues = dayHits.filter((h) => h.issues.length).length;
    console.log(
      `${dateISO} | ${psalter || "?"} | croci-ore=${dayHits.length} problemi=${dayIssues} fail-oggi=${failures.filter((f) => f.date === dateISO).length}`,
    );
  }

  const withIssues = hits.filter((h) => h.issues.length);
  const byWeek: Record<string, number> = {};
  for (const h of hits) {
    const w = (h.psalter.match(/([IVX]+)\s+Settimana/i) || [, "?"])[1];
    byWeek[w] = (byWeek[w] || 0) + h.antJoins;
  }

  const summary = {
    start: START,
    days: DAYS,
    daysWithPsalterLabel: daysPsalter,
    rawJoinCrossDivs: rawTotal,
    parsedJoinMarks: markTotal,
    antiphonsWithJoinCross: antTotal,
    hourSectionsWithJoin: hits.length,
    hourSectionsWithIssues: withIssues.length,
    antJoinsByPsalterWeek: byWeek,
    failures,
    issueKinds: withIssues.reduce(
      (acc, h) => {
        for (const i of h.issues) {
          const k = i.split(":")[0];
          acc[k] = (acc[k] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    ),
    hits,
  };

  writeFileSync("scripts/_join-cross-4w.json", JSON.stringify(summary, null, 2), "utf8");

  console.log("\n========== RIEPILOGO ==========");
  console.log(`Periodo: ${START} → ${isoAdd(START, DAYS - 1)} (${DAYS} giorni)`);
  console.log(`Giorni con label «… Settimana del Salterio»: ${daysPsalter}`);
  console.log(`Croci raw CEI (div lo_rosso †): ${rawTotal}`);
  console.log(`Croci parsate (marker in app): ${markTotal}`);
  console.log(`Antifone con croce: ${antTotal}`);
  console.log(`Sezioni ora con almeno una croce: ${hits.length}`);
  console.log(`Sezioni con problemi regola: ${withIssues.length}`);
  console.log(`Fetch falliti: ${failures.length}`);
  console.log("Antifone-con-croce per settimana salterio:", byWeek);
  if (Object.keys(summary.issueKinds).length) console.log("Tipi problema:", summary.issueKinds);
  if (withIssues.length) {
    console.log("\n--- PROBLEMI (max 50) ---");
    for (const h of withIssues.slice(0, 50)) {
      console.log(`${h.date} ${h.hour} | ${h.psalter} | ${h.issues.join("; ")}`);
      if (h.antPreview) console.log(`  ant: ${h.antPreview}`);
      if (h.bodyPreview) console.log(`  body: ${h.bodyPreview}`);
    }
  } else {
    console.log("\nNessun problema di regola rilevato.");
  }
  console.log("\nDettaglio: scripts/_join-cross-4w.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
