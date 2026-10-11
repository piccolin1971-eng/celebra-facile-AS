import catalog from "../src/data/optionalSaintsCatalog.json";
import { getOptionalSaintLiturgyBundle } from "../src/optionalSaintLiturgyBundles";
import { getSaintLectionaryForDate, hasInlineProperReadings } from "../src/saintLectionary";
import { parseLocalDate } from "../src/dateUtils";
import { fetchCeiHtml, resolveLiturgyFromCeiHtmlForOptionalSaint } from "../src/liturgyScraper";

async function main() {
  for (const s of (catalog as { saints: { id: string; date: string; title: string }[] }).saints) {
    const iso = `2026-${s.date}`;
    const d = parseLocalDate(iso);
    const html = await fetchCeiHtml(d);
    const cei = html
      ? resolveLiturgyFromCeiHtmlForOptionalSaint(html, d, s.title).readings.length
      : 0;
    const lec = getSaintLectionaryForDate(d, s.title);
    const lecOk = lec.length > 0 && hasInlineProperReadings(lec[0]);
    const bundle = getOptionalSaintLiturgyBundle(s.id);
    const bOk = !!bundle?.readings?.some((r) => r.type === "vangelo");
    const ok = cei > 0 || lecOk || bOk;
    console.log(s.id.padEnd(24), ok ? "OK" : "GAP", `cei=${cei}`, `lec=${lecOk}`, `bundle=${bOk}`);
  }
}

void main();
