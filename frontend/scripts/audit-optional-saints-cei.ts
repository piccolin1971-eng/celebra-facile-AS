import { fetchCeiHtml, resolveLiturgyFromCeiHtmlForOptionalSaint } from "../src/liturgyScraper";
import { parseLocalDate } from "../src/dateUtils";
import catalog from "../src/data/optionalSaintsCatalog.json";
import lectionary from "../src/data/saintLectionary.json";
import { getSaintLectionaryForDate } from "../src/saintLectionary";
import { hasInlineProperReadings } from "../src/saintLectionary";

type CalSaint = { id: string; date: string; title: string; custom?: boolean };

function h3Titles(html: string): string[] {
  return [...html.matchAll(/<h3[^>]*class="[^"]*single_title[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t && !/visually-hidden/i.test(t));
}

async function main() {
  const saints = (catalog as { saints: CalSaint[] }).saints;
  for (const s of saints) {
    const [mm, dd] = s.date.split("-");
    const iso = `2026-${mm}-${dd}`;
    const d = parseLocalDate(iso);
    const html = await fetchCeiHtml(d);
    const resolved = html
      ? resolveLiturgyFromCeiHtmlForOptionalSaint(html, d, s.title)
      : { readings: [] as unknown[] };
    const lec = getSaintLectionaryForDate(d, s.title);
    const lecOk = lec.length > 0 && hasInlineProperReadings(lec[0]);
    const h3 = html ? h3Titles(html) : [];
    const fac = html ? /\bfacoltativ/i.test(html) : false;
    console.log(
      [
        s.id.padEnd(22),
        `cei=${resolved.readings.length}`.padEnd(8),
        `lec=${lecOk ? "yes" : "no "}`.padEnd(8),
        `fac=${fac ? "Y" : "n"}`.padEnd(6),
        s.custom ? "LOCAL" : "",
        h3.length > 1 ? `h3:${h3.length}` : "",
      ].join(" "),
    );
  }
}

void main();
