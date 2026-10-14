/**
 * Croce di congiunzione CEI (`lo_rosso` con solo †), distinta dalla flessa † nel versetto.
 *
 * Regola (come sul CEI, tutte le Ore):
 * - antifona con † oro in coda ⇒ il salmo riparte con lo stesso testo (eco tenuta);
 * - la seconda † sta subito dopo quell’eco, all’inizio di riga del resto
 *   (es. «Dal profondo…; *» / «† Signore, ascolta…»), non a metà riga dopo *.
 */
import type { OreBlock } from "./types";

export const JOIN_CROSS_MARK = "\uFFF0";

export function hasJoinCross(s: string): boolean {
  return s.includes(JOIN_CROSS_MARK);
}

export function stripJoinCross(s: string): string {
  return s.split(JOIN_CROSS_MARK).join("").replace(/\s+/g, " ").trim();
}

/** † a inizio riga con testo dopo (forma corretta sul resto del versetto). */
export function joinCrossAtLineStart(line: string): boolean {
  return new RegExp(`^${JOIN_CROSS_MARK}\\s+\\S`).test(line.trim());
}

/** † subito dopo * sulla stessa riga: da spezzare. */
export function joinCrossAfterAsterisk(line: string): boolean {
  return new RegExp(`\\*[\\s\u00a0]*${JOIN_CROSS_MARK}`).test(line);
}

function normEcho(s: string): string {
  return s
    .replace(new RegExp(JOIN_CROSS_MARK, "g"), "")
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[\s.!?;:,*]+$/g, "")
    .trim()
    .toLowerCase();
}

function antiphonCore(ant: string): string {
  return stripJoinCross(ant).replace(/\s+/g, " ").trim().replace(/[.!?;:,]+$/g, "").trim();
}

function isAntiphonEcho(text: string, antCore: string): boolean {
  const a = normEcho(antCore);
  const b = normEcho(text);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(b) || b.endsWith(a)) return true;
  return false;
}

/** Riga eco nel salmo (testo antifona; spesso con «; *» come sul CEI). */
function echoLineFromAntiphon(antText: string): string {
  const core = antiphonCore(antText);
  const raw = stripJoinCross(antText).replace(/\s+/g, " ").trim();
  if (/[.!]$/.test(raw)) return `${core}; *`;
  if (/\*$/.test(raw)) return raw;
  return raw || core;
}

function mergeHangAt(hang: number[] | undefined, at: number, removeCount: number, insert: number[]): number[] | undefined {
  if (!hang) return undefined;
  const next = [...hang];
  next.splice(at, removeCount, ...insert);
  return next;
}

/**
 * Tiene l’eco dell’antifona e mette † all’inizio della riga successiva.
 */
export function placeJoinCrossAfterAntiphonEcho(
  antText: string,
  lines: string[],
  hang?: number[],
): { lines: string[]; hang?: number[] } {
  const core = antiphonCore(antText);
  if (!core || !lines.length) return { lines, hang };

  let next = [...lines];
  let nextHang = hang ? [...hang] : undefined;

  // 1) Mid-line «eco * † resto» o «eco † resto» → spezza, tieni eco
  for (let li = 0; li < next.length; li++) {
    const line = next[li];
    if (!hasJoinCross(line) || joinCrossAtLineStart(line)) continue;
    const crossIdx = line.indexOf(JOIN_CROSS_MARK);
    const before = line.slice(0, crossIdx).replace(/\s+$/, "");
    const after = line.slice(crossIdx + JOIN_CROSS_MARK.length).trim();
    if (!before.trim()) continue;
    const endsWithAsterisk = /\*\s*$/.test(before.trim());
    if (!isAntiphonEcho(before, core) && !endsWithAsterisk) continue;
    const echo = before.trim();
    const rest = after ? `${JOIN_CROSS_MARK} ${after}` : JOIN_CROSS_MARK;
    next.splice(li, 1, echo, rest);
    nextHang = mergeHangAt(nextHang, li, 1, [nextHang?.[li] ?? 0, 0]);
    return { lines: next, hang: nextHang };
  }

  // 2) «† eco …» a inizio riga (marker prima dell’eco) → eco prima, † sul resto
  if (joinCrossAtLineStart(next[0])) {
    const rest = next[0].replace(new RegExp(`^\\s*${JOIN_CROSS_MARK}\\s*`), "").trim();
    if (isAntiphonEcho(rest, core)) {
      const esc = core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = rest.match(new RegExp(`^${esc}[.!?;:,]*\\s*\\*?\\s*(.*)$`, "i"));
      const leftover = (m?.[1] || "").trim();
      const echo = leftover ? rest.slice(0, rest.length - leftover.length).trim() : rest;
      if (leftover) {
        next[0] = echo;
        next.splice(1, 0, `${JOIN_CROSS_MARK} ${leftover}`);
        nextHang = mergeHangAt(nextHang, 0, 1, [nextHang?.[0] ?? 0, 0]);
        return { lines: next, hang: nextHang };
      }
      // Tutta la riga è eco dopo †: eco + † sulla riga successiva
      if (next.length >= 2) {
        next[0] = echo.replace(new RegExp(`^\\s*${JOIN_CROSS_MARK}\\s*`), "").trim() || echoLineFromAntiphon(antText);
        if (!next[1].includes(JOIN_CROSS_MARK)) {
          next[1] = `${JOIN_CROSS_MARK} ${next[1].trim()}`;
        }
        return { lines: next, hang: nextHang };
      }
      next = [echoLineFromAntiphon(antText), JOIN_CROSS_MARK];
      return { lines: next, hang: nextHang ? [0, 0] : undefined };
    }

    // 3) «† resto» senza eco → reinserisci eco dell’antifona
    if (!isAntiphonEcho(rest, core)) {
      next = [echoLineFromAntiphon(antText), next[0], ...next.slice(1)];
      nextHang = nextHang ? [0, ...nextHang] : undefined;
      return { lines: next, hang: nextHang };
    }
  }

  // 4) Prima riga = eco senza †, seconda senza † → inserisci † sulla seconda
  if (!hasJoinCross(next[0]) && isAntiphonEcho(next[0], core)) {
    if (next.length >= 2 && !hasJoinCross(next[1])) {
      next[1] = `${JOIN_CROSS_MARK} ${next[1].trim()}`;
      return { lines: next, hang: nextHang };
    }
    // Eco + † sola su riga successiva
    if (next.length >= 2 && next[1].trim() === JOIN_CROSS_MARK && next.length >= 3) {
      next.splice(1, 2, `${JOIN_CROSS_MARK} ${next[2].trim()}`);
      nextHang = mergeHangAt(nextHang, 1, 2, [0]);
      return { lines: next, hang: nextHang };
    }
  }

  // 5) † sola come prima riga
  if (next[0].trim() === JOIN_CROSS_MARK) {
    if (next.length >= 2 && isAntiphonEcho(next[1], core)) {
      // †, eco, resto → eco, † resto
      const echo = next[1];
      if (next.length >= 3) {
        next = [echo, `${JOIN_CROSS_MARK} ${next[2].trim()}`, ...next.slice(3)];
      } else {
        next = [echo, JOIN_CROSS_MARK];
      }
      return { lines: next, hang: nextHang };
    }
    if (next.length >= 2 && !isAntiphonEcho(next[1], core)) {
      next = [echoLineFromAntiphon(antText), `${JOIN_CROSS_MARK} ${next[1].trim()}`, ...next.slice(2)];
      nextHang = nextHang ? [0, ...nextHang.slice(1)] : undefined;
      return { lines: next, hang: nextHang };
    }
  }

  // 6) Nessuna † nel corpo: ripristina eco + † a inizio riga del resto
  if (!next.some((l) => hasJoinCross(l))) {
    if (isAntiphonEcho(next[0], core)) {
      if (next.length >= 2) {
        next[1] = `${JOIN_CROSS_MARK} ${next[1].trim()}`;
      } else {
        next.push(JOIN_CROSS_MARK);
        nextHang = nextHang ? [...nextHang, 0] : undefined;
      }
      return { lines: next, hang: nextHang };
    }
    next = [echoLineFromAntiphon(antText), `${JOIN_CROSS_MARK} ${next[0].trim()}`, ...next.slice(1)];
    nextHang = nextHang ? [0, ...nextHang] : undefined;
    return { lines: next, hang: nextHang };
  }

  return { lines: next, hang: nextHang };
}

function isPsalmPartMarker(t: string): boolean {
  const s = t.trim();
  return (
    /^(I|II|III|IV|V|VI)\s*$/i.test(s) ||
    /^Parte\b/i.test(s) ||
    /^(I|II|III|IV|V|VI)\s*\([^)]*\)/i.test(s)
  );
}

/** Spezza «eco * † resto» o «eco. † resto» sulla stessa riga (anche senza eco dell’antifona). */
export function fixMidLineJoinCrossLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!hasJoinCross(line) || joinCrossAtLineStart(line.trim())) {
      out.push(line);
      continue;
    }
    const crossIdx = line.indexOf(JOIN_CROSS_MARK);
    const before = line.slice(0, crossIdx).replace(/\s+$/, "");
    const after = line.slice(crossIdx + JOIN_CROSS_MARK.length).trim();
    if (!before.trim() || !after) {
      out.push(line);
      continue;
    }
    const splitAfterStar = joinCrossAfterAsterisk(line);
    const splitAfterPeriod = /[.;]\s*$/.test(before.trim());
    if (splitAfterStar || splitAfterPeriod) {
      out.push(before.trim());
      out.push(`${JOIN_CROSS_MARK} ${after}`);
      continue;
    }
    out.push(line);
  }
  return out;
}

function stanzaNeedsJoinCrossFix(lines: string[]): boolean {
  return lines.some(
    (l) => hasJoinCross(l) && (joinCrossAfterAsterisk(l) || !joinCrossAtLineStart(l.trim())),
  );
}

/** Applica la regola su tutte le antifone con † → prima strofa del salmo. */
export function normalizeJoinCrossBlocks(blocks: OreBlock[]): OreBlock[] {
  const out = blocks.map((b) =>
    b.k === "stanza" ? { ...b, lines: [...b.lines], hang: b.hang ? [...b.hang] : undefined } : b,
  );

  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b.k !== "rubric" || !/ant/i.test(b.lab)) continue;
    const antRaw = b.text.replace(/\s+/g, " ").trim();
    if (!hasJoinCross(antRaw) && !antRaw) continue;

    let stanzaIdx = -1;
    for (let j = i + 1; j < out.length; j++) {
      const n = out[j];
      if (n.k === "stanza") {
        stanzaIdx = j;
        break;
      }
      if (n.k === "rubric" && /ant/i.test(n.lab)) break;
      if (n.k === "psalmHead") continue;
      if (n.k === "title") {
        if (isPsalmPartMarker(n.text)) continue;
        break;
      }
    }
    if (stanzaIdx < 0) continue;

    const st = out[stanzaIdx] as Extract<OreBlock, { k: "stanza" }>;
    if (!hasJoinCross(antRaw) && !stanzaNeedsJoinCrossFix(st.lines)) continue;
    const antText = hasJoinCross(antRaw) ? b.text : `${antRaw} ${JOIN_CROSS_MARK}`;
    const fixed = placeJoinCrossAfterAntiphonEcho(antText, st.lines, st.hang);
    out[stanzaIdx] = { k: "stanza", lines: fixed.lines, hang: fixed.hang };
  }

  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b.k !== "stanza") continue;
    const newLines: string[] = [];
    const newHang: number[] = [];
    let changed = false;
    for (let li = 0; li < b.lines.length; li++) {
      const h = b.hang?.[li] ?? 0;
      const split = fixMidLineJoinCrossLines([b.lines[li]]);
      if (split.length === 1 && split[0] === b.lines[li]) {
        newLines.push(b.lines[li]);
        newHang.push(h);
        continue;
      }
      changed = true;
      split.forEach((l, j) => {
        newLines.push(l);
        newHang.push(j === 0 ? h : 0);
      });
    }
    if (changed) {
      out[i] = { k: "stanza", lines: newLines, hang: b.hang ? newHang : undefined };
    }
  }

  return out;
}
