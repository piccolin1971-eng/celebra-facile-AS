/**
 * Simulazione 15 giorni: tutte le Ore — maiuscole, ZWSP, layout, Madonna Compieta.
 * Uso: npx tsx scripts/audit-ore-15d.ts [YYYY-MM-DD] [giorni]
 */
import { writeFileSync } from "fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { addDays, localDateStr, parseLocalDate } from "../src/dateUtils";
import { computeEasterSunday, firstAdventSunday } from "../src/liturgicalDates";
import { marianAntiphonsForDate } from "../src/ore/bundled";
import { getBundledCompline } from "../src/ore/complineBundled";
import { parseHourHtml, splitOraMediaHtml } from "../src/ore/parseHour";
import { hoursUrl, hoursUrlForHour } from "../src/ore/scraper";
import type { OreBlock, OreHourId, MediaId } from "../src/ore/types";

const START = process.argv[2] || localDateStr(new Date());
const DAYS = Number(process.argv[3] || 15);
const HOURS: OreHourId[] = ["ufficio", "lodi", "ora-media", "vespri", "compieta"];

type Issue = { date: string; hour: string; kind: string; detail: string };

const LOWER_START = /^[a-zàáâäèéêëìíîïòóôöùúûüçœæ]/;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function expectedSeasonalMarian(date: Date): string {
  return marianAntiphonsForDate(date)[0]?.[0] || "";
}

function issuesFor(dateISO: string, hour: string, blocks: OreBlock[]): Issue[] {
  const out: Issue[] = [];
  const date = parseLocalDate(dateISO);

  if (!blocks.length) {
    out.push({ date: dateISO, hour, kind: "empty-hour", detail: "nessun blocco" });
    return out;
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k === "rubric" && /ant/i.test(b.lab)) {
      if (!b.text.trim()) out.push({ date: dateISO, hour, kind: "empty-ant", detail: `${b.lab} @${i}` });
      else if (LOWER_START.test(b.text.trim())) {
        out.push({ date: dateISO, hour, kind: "ant-lowercase", detail: `${b.lab} ${b.text.slice(0, 50)}` });
      }
    }
    if (b.k === "psalmHead") {
      if (/Inno di|Lode alla|Preghiera/i.test(b.num) && !b.name) {
        out.push({ date: dateISO, hour, kind: "mashed-title", detail: b.num.slice(0, 80) });
      }
      if (/\bCfr\.\b/i.test(b.num) && /Inno /i.test(b.num)) {
        out.push({ date: dateISO, hour, kind: "mashed-canticle", detail: b.num.slice(0, 80) });
      }
      // primo verso dopo titolo
      const next = blocks[i + 1];
      if (next?.k === "stanza" && next.lines[0] && LOWER_START.test(next.lines[0].trim())) {
        out.push({
          date: dateISO,
          hour,
          kind: "psalm-open-lowercase",
          detail: `${b.num}: ${next.lines[0].slice(0, 50)}`,
        });
      }
    }
    if (b.k === "stanza") {
      for (const l of b.lines) {
        if (/[\u200B\uFEFF\u200C\u200D]/.test(l)) {
          out.push({ date: dateISO, hour, kind: "zwsp", detail: JSON.stringify(l.slice(0, 40)) });
          break;
        }
        if (l.trim() === "(" || l.trim() === ")") {
          out.push({ date: dateISO, hour, kind: "lone-paren", detail: `stanza@${i}` });
        }
      }
    }
    if (b.k === "hymn" && (!b.hymns?.length || b.hymns.every((h) => !h.stanzas?.length))) {
      out.push({ date: dateISO, hour, kind: "empty-hymn", detail: `@${i}` });
    }
  }

  // Compieta: Madonna
  if (hour === "compieta") {
    const marian = blocks.find((b) => b.k === "marian");
    const ceiTail = blocks.some(
      (b) =>
        (b.k === "omit" && /antifona della Beata/i.test(b.text)) ||
        (b.k === "stanza" && /^(Ave,? o Maria|O santa Madre|Salve,? Regina)/i.test(b.lines[0] || "")),
    );
    if (ceiTail && marian) {
      out.push({ date: dateISO, hour, kind: "marian-dup-tail", detail: "coda CEI + blocco marian" });
    }
    if (!marian) {
      out.push({ date: dateISO, hour, kind: "marian-missing", detail: "nessun blocco marian" });
    } else if (marian.k === "marian") {
      const firsts = marian.antiphons.map((a) => a[0] || "");
      const expect = expectedSeasonalMarian(date);
      if (firsts[0] !== expect) {
        out.push({
          date: dateISO,
          hour,
          kind: "marian-season-wrong",
          detail: `got «${firsts[0]}» expect «${expect}»`,
        });
      }
      if (marian.antiphons.length < 2) {
        out.push({ date: dateISO, hour, kind: "marian-too-few", detail: `n=${marian.antiphons.length}` });
      }
      // testo Sub tuum
      const sub = marian.antiphons.find((a) => /Sotto la tua protezione/i.test(a[0] || ""));
      if (sub && /troviamo/i.test(sub.join(" "))) {
        out.push({ date: dateISO, hour, kind: "marian-sub-tuum-text", detail: "troviamo invece di cerchiamo" });
      }
      // Regina fuori stagione
      const easter = computeEasterSunday(date.getFullYear());
      const pentecost = addDays(easter, 49);
      const t = date.getTime();
      const inEaster = t >= easter.getTime() && t <= pentecost.getTime();
      if (!inEaster && firsts.some((f) => /Regina dei cieli/i.test(f))) {
        out.push({ date: dateISO, hour, kind: "regina-out-of-season", detail: firsts.join(" | ") });
      }
      // Alma fuori stagione (dopo Candlemas, prima di Avvento)
      const candlemas = new Date(date.getFullYear(), 1, 2).getTime();
      const advent = firstAdventSunday(date.getFullYear()).getTime();
      if (t >= candlemas && t < advent && firsts.some((f) => /O santa Madre del Redentore/i.test(f))) {
        out.push({ date: dateISO, hour, kind: "alma-out-of-season", detail: firsts.join(" | ") });
      }
      // Ave Maria duplicata (stanza + marian)
      const aveStanza = blocks.filter(
        (b) => b.k === "stanza" && /Ave,? o Maria/i.test(b.lines[0] || ""),
      ).length;
      const aveMarian = marian.antiphons.filter((a) => /Ave,? o Maria/i.test(a[0] || "")).length;
      if (aveStanza + aveMarian > 1) {
        out.push({
          date: dateISO,
          hour,
          kind: "dup-ave-maria",
          detail: `stanza=${aveStanza} marian=${aveMarian}`,
        });
      }
      // righe marian vuote / minuscole inizio strofa
      for (const ant of marian.antiphons) {
        if (!ant.length || !ant[0]?.trim()) {
          out.push({ date: dateISO, hour, kind: "marian-empty-line", detail: "antifona vuota" });
        } else if (LOWER_START.test(ant[0].trim())) {
          out.push({ date: dateISO, hour, kind: "marian-lowercase", detail: ant[0].slice(0, 50) });
        }
      }
    }

    // pezzi obbligatori Compieta
    const need = ["hymn", "psalmHead", "title"];
    if (!blocks.some((b) => b.k === "hymn")) out.push({ date: dateISO, hour, kind: "no-hymn", detail: "" });
    if (!blocks.some((b) => b.k === "psalmHead" && /SIMEONE|Simeone/i.test(b.num))) {
      out.push({ date: dateISO, hour, kind: "no-simeone", detail: "" });
    }
    if (!blocks.some((b) => b.k === "title" && /ORAZIONE/i.test(b.text))) {
      out.push({ date: dateISO, hour, kind: "no-orazione", detail: "" });
    }
  }

  // Lodi/Vespri: Benedictus/Magnificat
  if (hour === "lodi" || hour === "vespri") {
    const cant = blocks.find(
      (b) =>
        b.k === "psalmHead" &&
        (/ZACCARIA|BENEDICTUS|MAGNIFICAT|BEATA VERGINE/i.test(b.num) ||
          /ZACCARIA|MAGNIFICAT/i.test(b.name)),
    );
    if (!cant) out.push({ date: dateISO, hour, kind: "no-gospel-canticle", detail: "" });
    const inv = blocks.findIndex((b) => b.k === "title" && /INVOCAZIONI|INTERCESSIONI/i.test(b.text));
    if (inv >= 0 && !blocks.slice(inv, inv + 4).some((b) => b.k === "tone")) {
      out.push({ date: dateISO, hour, kind: "preces-no-tone", detail: "" });
    }
  }

  return out;
}

async function loadHour(dateISO: string, hour: OreHourId): Promise<{ label: string; blocks: OreBlock[] }[]> {
  const date = parseLocalDate(dateISO);
  if (hour === "compieta") {
    const bundled = getBundledCompline(dateISO);
    if (bundled?.blocks?.length) return [{ label: "compieta", blocks: bundled.blocks }];
  }
  const html = await fetchCeiUrl(hoursUrlForHour(dateISO, hour));
  if (hour === "ora-media") {
    const parts = splitOraMediaHtml(html || "");
    return (["terza", "sesta", "nona"] as MediaId[]).map((id) => ({
      label: id,
      blocks: parseHourHtml(parts[id] || "", id, dateISO).blocks,
    }));
  }
  return [{ label: hour, blocks: parseHourHtml(html || "", hour, dateISO).blocks }];
}

async function main() {
  const all: Issue[] = [];
  const marianLog: string[] = [];
  let d = parseLocalDate(START);
  console.log(`Audit Ore ${START} + ${DAYS} giorni\n`);

  for (let i = 0; i < DAYS; i++) {
    const iso = localDateStr(d);
    for (const hour of HOURS) {
      try {
        const parts = await loadHour(iso, hour);
        for (const p of parts) {
          const found = issuesFor(iso, p.label, p.blocks);
          all.push(...found);
          if (p.label === "compieta") {
            const m = p.blocks.find((b) => b.k === "marian");
            const firsts =
              m && m.k === "marian" ? m.antiphons.map((a) => a[0]?.slice(0, 36)).join(" · ") : "(nessuna)";
            marianLog.push(`${iso} ${firsts}`);
          }
          const mark = found.length ? `FAIL ${found.map((x) => x.kind).join(",")}` : "ok";
          console.log(iso, p.label, "blocks", p.blocks.length, mark);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        all.push({ date: iso, hour, kind: "fetch-error", detail: msg.slice(0, 120) });
        console.log(iso, hour, "FAIL fetch-error");
      }
      await sleep(120);
    }
    d = addDays(d, 1);
  }

  console.log("\n=== MADONNA COMPIETA (prima di ogni giorno) ===");
  for (const line of marianLog) console.log(line);

  console.log("\nTOTAL ISSUES", all.length);
  const byKind: Record<string, number> = {};
  for (const x of all) {
    byKind[x.kind] = (byKind[x.kind] || 0) + 1;
    console.log("-", x.date, x.hour, x.kind, x.detail);
  }
  console.log("\nBy kind:", JSON.stringify(byKind, null, 2));
  writeFileSync(
    "scripts/_ore-15d-audit.json",
    JSON.stringify({ start: START, days: DAYS, issues: all, marianLog, byKind }, null, 2),
    "utf8",
  );
  if (all.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
