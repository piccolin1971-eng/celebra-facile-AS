/**
 * Audit strutturale completo Ore — 4 settimane salterio.
 * Unisce marker (* / croci), struttura sezioni, salmodia, igiene testo vs CEI.
 * Non certifica colori/spaziatura UI (serve occhio umano).
 *
 * Uso: npx tsx scripts/audit-ore-full-4w.ts [YYYY-MM-DD] [giorni]
 */
import { writeFileSync } from "fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { localDateStr, parseLocalDate } from "../src/dateUtils";
import { extractHoursBanner, liturgicalFragment, stripTags } from "../src/ore/html";
import { hourHeadMeta } from "../src/ore/dayHead";
import { parseHourHtml, splitOraMediaHtml } from "../src/ore/parseHour";
import { getBundledCompline } from "../src/ore/complineBundled";
import { hoursUrl, hoursUrlForHour } from "../src/ore/scraper";
import { ceiHourSlug } from "../src/ore/titles";
import { JOIN_CROSS_MARK, hasJoinCross } from "../src/ore/joinCross";
import type { OreBlock, OreHourId, MediaId } from "../src/ore/types";

const START = process.argv[2] || "2026-08-31";
const DAYS = Number(process.argv[3] || 28);

type Issue = { date: string; psalter: string; hour: string; kind: string; detail: string; sev: "hard" | "soft" };

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

async function fetchHtml(dateISO: string, hour: OreHourId): Promise<string> {
  const url = hoursUrlForHour(dateISO, hour);
  const data = url.match(/data-liturgia=([^&]+)/)?.[1] || dateISO.replace(/-/g, "");
  const slug = decodeURIComponent(url.match(/ora=([^&]+)/)?.[1] || "");
  for (const tryUrl of [
    `http://localhost:8081/cei-ore?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`,
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
        /* */
      }
      await new Promise((r) => setTimeout(r, 300 * a));
    }
  }
  throw new Error(`fetch fail ${dateISO} ${hour}`);
}

const ROSSO_STAR =
  /<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\s)*(?:\*)(?:&nbsp;|\s|<br\s*\/?>)*<\/div>/gi;
const ROSSO_DAGGER =
  /<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\s)*(?:&dagger;|\u2020)(?:&nbsp;|\s|<br\s*\/?>)*<\/div>/gi;

function show(s: string): string {
  return s.replaceAll(JOIN_CROSS_MARK, "\u2020").replace(/\s+/g, " ").trim().slice(0, 110);
}

function blob(blocks: OreBlock[]): string {
  return blocks
    .map((b) => {
      if (b.k === "stanza") return b.lines.join("\n");
      if (b.k === "hymn")
        return b.hymns
          .map((h) => (h.stanzas || []).map((s) => (s || []).join("\n")).join("\n\n"))
          .join("\n");
      if (b.k === "rubric") return `${b.lab} ${b.text}`;
      if (b.k === "psalmHead") return `${b.num} ${b.name} ${b.sub} ${b.cite}`;
      if (b.k === "tone") return `${b.intro}\n${b.refrain}`;
      if (b.k === "title" || b.k === "sub" || b.k === "omit" || b.k === "prose") return b.text;
      if (b.k === "marian") return b.antiphons.map((a) => a.lines.join("\n")).join("\n");
      return "";
    })
    .join("\n");
}

function norm(s: string): string {
  return s
    .replaceAll(JOIN_CROSS_MARK, "\u2020")
    .replace(/['’ʻʼ]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function ceiPlain(html: string): string {
  return norm(
    stripTags(liturgicalFragment(html))
      .replace(/&dagger;/gi, "\u2020")
      .replace(/&#x2020;/gi, "\u2020"),
  );
}

function texts(blocks: OreBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.k === "rubric") out.push(`${b.lab} ${b.text}`);
    if (b.k === "stanza") out.push(...b.lines);
    if (b.k === "prose" || b.k === "title" || b.k === "sub") out.push(b.text);
  }
  return out;
}

function respBlocks(blocks: OreBlock[]): OreBlock[] {
  const i = blocks.findIndex((b) => b.k === "title" && /RESPONSORIO/i.test(b.text));
  if (i < 0) return [];
  const out: OreBlock[] = [];
  for (let j = i + 1; j < blocks.length; j++) {
    const b = blocks[j];
    if (b.k === "title") break;
    if (b.k === "rubric" && /ant/i.test(b.lab)) break;
    out.push(b);
  }
  return out;
}

function respZoneHtml(html: string): string {
  const frag = liturgicalFragment(html);
  const m = frag.match(/RESPONSORIO[\s\S]{0,2500}?(?=SECONDA\s+LETTURA|Ant\.\s*al|LETTURA\s+BREVE|INVOCAZIONI|INTERCESSIONI|ORAZIONE|PADRE\s+NOSTRO|$)/i);
  return m ? m[0] : "";
}

function hasTitle(blocks: OreBlock[], re: RegExp): boolean {
  return blocks.some((b) => b.k === "title" && re.test(b.text));
}

function hasInno(blocks: OreBlock[]): boolean {
  return blocks.some((b) => b.k === "hymn" || (b.k === "title" && /INNO\b/i.test(b.text)));
}

function audit(
  date: string,
  psalter: string,
  hour: string,
  html: string,
  blocks: OreBlock[],
  issues: Issue[],
): void {
  const hard = (kind: string, detail: string) =>
    issues.push({ date, psalter, hour, kind, detail, sev: "hard" });
  const soft = (kind: string, detail: string) =>
    issues.push({ date, psalter, hour, kind, detail, sev: "soft" });

  if (!blocks.length) {
    hard("EMPTY", "nessun blocco");
    return;
  }

  const appBlob = blob(blocks);
  const cei = ceiPlain(html);
  const frag = liturgicalFragment(html);

  // --- sezioni attese (se presenti sul CEI) ---
  const sectionChecks: [RegExp, RegExp, string][] = [
    [/INNO\b/i, /INNO\b/i, "MISSING_INNO"],
    [/LETTURA(?:\s+BREVE)?\b/i, /LETTURA/i, "MISSING_LETTURA"],
    [/RESPONSORIO/i, /RESPONSORIO/i, "MISSING_RESPONSORIO"],
    [/ORAZIONE\b/i, /ORAZIONE\b/i, "MISSING_ORAZIONE"],
  ];
  for (const [ceiRe, appRe, kind] of sectionChecks) {
    if (ceiRe.test(frag) && !appRe.test(appBlob) && !hasTitle(blocks, appRe) && !(kind === "MISSING_INNO" && hasInno(blocks))) {
      // Compieta/ora-media possono variare
      if (hour === "compieta" && kind === "MISSING_INNO") continue;
      hard(kind, "presente sul CEI, assente in app");
    }
  }

  if (/lodi|vespri/i.test(hour)) {
    if (!blocks.some((b) => b.k === "psalmHead")) hard("NO_PSALM_HEAD", "nessun titolo salmo/cantico");
    const ants = blocks.filter((b) => b.k === "rubric" && /^\d+\s*ant/i.test(b.lab));
    if (ants.length < 2) soft("FEW_ANTS", `ant numerate=${ants.length}`);
    for (const a of ants) {
      if (!a.text.trim()) hard("ANT_EMPTY", a.lab);
    }
    if (hour === "lodi" && /Ant\.\s*al\s+Ben/i.test(frag)) {
      const ben = blocks.find((b) => b.k === "rubric" && /Ant\.\s*al\s+Ben/i.test(b.lab));
      if (!ben?.text.trim()) hard("BEN_ANT_EMPTY", "Ant. al Ben. senza testo");
    }
    if (hour === "vespri" && /Ant\.\s*al\s+Mag/i.test(frag)) {
      const mag = blocks.find((b) => b.k === "rubric" && /Ant\.\s*al\s+Mag/i.test(b.lab));
      if (!mag?.text.trim()) hard("MAG_ANT_EMPTY", "Ant. al Magn. senza testo");
    }
  }

  // --- responsorio: lo_rosso * deve restare ---
  const rz = respZoneHtml(html);
  const rawRespStars = (rz.match(ROSSO_STAR) || []).length;
  if (rawRespStars > 0) {
    const rb = respBlocks(blocks);
    const respText = texts(rb).join("\n");
    const appStars = (respText.match(/\*/g) || []).length;
    if (appStars < 1) {
      hard("RESP_STAR_GONE", `CEI lo_rosso *=${rawRespStars} app *=0 | ${show(respText)}`);
    }
    // almeno una riga R. o V. deve portare * (coda o vicina)
    const cue = texts(rb).find((l) => /^[RV]\./i.test(l.trim()) && /\*/.test(l));
    const nextHas =
      texts(rb).findIndex((l) => /^[RV]\./i.test(l.trim())) >= 0 &&
      texts(rb).some((l, i, arr) => {
        if (!/^[RV]\./i.test(l.trim())) return false;
        return /\*/.test(l) || (arr[i + 1] && /^\*/.test(arr[i + 1].trim()));
      });
    if (!cue && !nextHas) {
      hard("RESP_STAR_NOT_ON_VR", show(respText));
    }
  }

  // --- croci di congiunzione ---
  const rawJoin = (frag.match(ROSSO_DAGGER) || []).length;
  let appJoin = 0;
  let loneJoin = 0;
  for (const b of blocks) {
    const lines = b.k === "stanza" ? b.lines : b.k === "rubric" || b.k === "prose" ? [b.text] : [];
    for (const l of lines) {
      if (!l) continue;
      if (hasJoinCross(l)) {
        appJoin += l.split(JOIN_CROSS_MARK).length - 1;
        if (l.trim() === JOIN_CROSS_MARK) loneJoin += 1;
      }
    }
  }
  if (rawJoin > 0 && appJoin === 0) hard("JOIN_GONE", `CEI \u2020=${rawJoin} app=0`);
  if (loneJoin > 0) hard("JOIN_LONE_LINE", `×${loneJoin}`);

  // --- igiene ---
  if (/[\u200b\u200c\u200d\ufeff]/.test(appBlob)) soft("ZWSP", "caratteri zero-width nel testo");
  if (/&\w+;/.test(appBlob) && !/&amp;|&lt;|&gt;/.test("")) {
    const ents = appBlob.match(/&\w+;/g) || [];
    if (ents.length) soft("HTML_ENTITY", ents.slice(0, 3).join(" "));
  }
  if (/facebook|twitter|condividi|chiesacattolica\.it/i.test(appBlob)) {
    hard("CHROME_LEAK", "testo UI CEI rimasto nei blocchi");
  }

  // --- copertura frasi chiave CEI (sample) ---
  // Prendi 5 snips di 40+ char da versetti CEI e verifica ⊆ app
  const verseBits = [
    ...frag.matchAll(/<div[^>]*class="[^"]*lo_versetto[^"]*"[^>]*>([\s\S]*?)<\/div>/gi),
  ]
    .map((m) =>
      norm(stripTags(m[1]).replace(/&dagger;/gi, "\u2020"))
        .replace(/\*/g, "")
        .replace(/\u2020/g, "")
        .trim(),
    )
    .filter((t) => t.length >= 45 && t.length <= 160 && !/^(r\.|v\.|ant)/i.test(t))
    .slice(0, 8);

  const appN = norm(appBlob).replace(/\*/g, "").replace(/\u2020/g, "");
  let miss = 0;
  const missSamples: string[] = [];
  for (const bit of verseBits) {
    // tollera piccole differenze: confronta i primi 40 char “parole”
    const core = bit.slice(0, 50);
    if (core.length >= 30 && !appN.includes(core.slice(0, 35))) {
      miss += 1;
      if (missSamples.length < 2) missSamples.push(core.slice(0, 60));
    }
  }
  if (verseBits.length >= 4 && miss >= Math.ceil(verseBits.length * 0.5)) {
    hard("TEXT_COVERAGE_LOW", `mancano ~${miss}/${verseBits.length} snip CEI | es: ${missSamples.join(" || ")}`);
  } else if (miss >= 2) {
    soft("TEXT_SNIP_MISS", `${miss}/${verseBits.length} | ${missSamples.join(" || ")}`);
  }

  // --- Gloria dopo salmodia (lodi/vespri) ---
  if (/lodi|vespri/i.test(hour)) {
    const gIdx = blocks.findIndex(
      (b) => b.k === "stanza" && b.lines.some((l) => /^Gloria al Padre/i.test(l)),
    );
    if (gIdx < 0 && /Gloria al Padre/i.test(frag)) soft("GLORIA_NOT_FOUND", "Gloria sul CEI non in strofa");
  }

  // --- psalmHead malformato ---
  for (const b of blocks) {
    if (b.k === "psalmHead" && /Inno di|Lode alla/i.test(b.num) && !b.name) {
      soft("PSALM_HEAD_MASHED", show(b.num));
    }
  }

  // --- hang sospetto: riga dopo *\u2020 senza hang (solo soft: render usa anche euristica) ---
  for (const b of blocks) {
    if (b.k !== "stanza" || !b.hang) continue;
    for (let i = 1; i < b.lines.length; i++) {
      const prev = b.lines[i - 1];
      if (/[*\u2020]\s*$/.test(prev.replaceAll(JOIN_CROSS_MARK, "")) && (b.hang[i] ?? 0) === 0) {
        // spesso ok perché OreBlocks ricalcola; soft only
        soft("HANG_ZERO_AFTER_MARK", show(prev) + " → " + show(b.lines[i]));
        break;
      }
    }
  }
}

async function main() {
  const issues: Issue[] = [];
  const failures: { date: string; hour: string; err: string }[] = [];
  let hoursOk = 0;

  for (let d = 0; d < DAYS; d++) {
    const dateISO = isoAdd(START, d);
    const date = parseLocalDate(dateISO);
    let psalter = "";
    let dayHard = 0;

    const hours: OreHourId[] = ["lodi", "vespri", "ufficio", "compieta"];
    for (const hour of hours) {
      try {
        if (hour === "compieta") {
          const bundled = getBundledCompline(dateISO);
          if (bundled?.blocks?.length) {
            const before = issues.length;
            audit(dateISO, psalter, hour, "", bundled.blocks, issues);
            dayHard += issues.slice(before).filter((i) => i.sev === "hard").length;
            hoursOk += 1;
            continue;
          }
        }
        const html = await fetchHtml(dateISO, hour);
        if (!psalter) {
          psalter = hourHeadMeta(dateISO, "", extractHoursBanner(html)).psalterLine || "";
        }
        const parsed = parseHourHtml(html, hour, dateISO);
        const before = issues.length;
        audit(dateISO, psalter, hour, html, parsed.blocks, issues);
        dayHard += issues.slice(before).filter((i) => i.sev === "hard").length;
        hoursOk += 1;
        await new Promise((r) => setTimeout(r, 100));
      } catch (e: any) {
        failures.push({ date: dateISO, hour, err: String(e?.message || e) });
      }
    }

    try {
      const html = await fetchHtml(dateISO, "ora-media");
      if (!psalter) {
        psalter = hourHeadMeta(dateISO, "", extractHoursBanner(html)).psalterLine || "";
      }
      const parts = splitOraMediaHtml(html);
      for (const mid of ["terza", "sesta", "nona"] as MediaId[]) {
        const parsed = parseHourHtml(parts[mid], mid, dateISO);
        const before = issues.length;
        audit(dateISO, psalter, mid, parts[mid], parsed.blocks, issues);
        dayHard += issues.slice(before).filter((i) => i.sev === "hard").length;
        hoursOk += 1;
      }
      await new Promise((r) => setTimeout(r, 100));
    } catch (e: any) {
      failures.push({ date: dateISO, hour: "ora-media", err: String(e?.message || e) });
    }

    console.log(
      `${dateISO} | ${psalter || "?"} | hard=${dayHard} soft=${issues.filter((i) => i.date === dateISO && i.sev === "soft").length} fail=${failures.filter((f) => f.date === dateISO).length}`,
    );
  }

  const hard = issues.filter((i) => i.sev === "hard");
  const soft = issues.filter((i) => i.sev === "soft");
  const byHard: Record<string, number> = {};
  const bySoft: Record<string, number> = {};
  for (const i of hard) byHard[i.kind] = (byHard[i.kind] || 0) + 1;
  for (const i of soft) bySoft[i.kind] = (bySoft[i.kind] || 0) + 1;

  const summary = {
    start: START,
    days: DAYS,
    hoursOk,
    failures: failures.length,
    hard: hard.length,
    soft: soft.length,
    byHard,
    bySoft,
    failuresDetail: failures,
    hardIssues: hard,
    softIssues: soft.slice(0, 80),
  };
  writeFileSync("scripts/_ore-full-4w.json", JSON.stringify(summary, null, 2), "utf8");

  console.log("\n========== AUDIT COMPLETO STRUTTURALE ==========");
  console.log(`Periodo: ${START} → ${isoAdd(START, DAYS - 1)}`);
  console.log(`Ore parsate: ${hoursOk} | fetch fail: ${failures.length}`);
  console.log(`HARD (da correggere): ${hard.length}`);
  console.log(byHard);
  console.log(`SOFT (da rivedere / euristici): ${soft.length}`);
  console.log(bySoft);
  if (hard.length) {
    console.log("\n--- HARD (tutti) ---");
    for (const i of hard) console.log(`${i.date} ${i.hour} | ${i.kind} | ${i.detail}`);
  }
  if (soft.length) {
    console.log("\n--- SOFT (max 40) ---");
    for (const i of soft.slice(0, 40)) console.log(`${i.date} ${i.hour} | ${i.kind} | ${i.detail}`);
  }
  console.log("\nDettaglio: scripts/_ore-full-4w.json");
  console.log(
    "\nNota: questo audit NON certifica colori, spaziature, tipografia o resa visiva OreBlocks.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
