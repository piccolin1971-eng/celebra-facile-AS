/**
 * Domenica: orazionale/prefazio devono ignorare santi soppressi in liturgy.saints.
 * Esegui: npx tsx scripts/test-orazionale-sunday.ts
 */
import { suggestPrayerForLiturgy } from "../src/orazionale";
import { getSuggestedPrefacesForLiturgy } from "../src/prefaceUtils";
import prefacesData from "../src/data/prefaces.json";
import type { Preface } from "../src/api";

const prefaces = prefacesData as Preface[];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const sunday = suggestPrayerForLiturgy({
  date: "2026-09-20",
  title: "XXV DOMENICA DEL TEMPO ORDINARIO",
  saints: [
    {
      title: "Santi Andrea Kim Taegon, sacerdote, Paolo Chong Hasang e compagni, martiri",
      rank: "memoria_obbligatoria",
    },
  ],
  season: { season: "Tempo Ordinario" },
});
assert(sunday === "pt_80", `20 set 2026: atteso pt_80 (TO XXV), ottenuto ${sunday}`);

const memorial = suggestPrayerForLiturgy({
  date: "2026-09-16",
  title: "Santi Cornelio, papa, e Cipriano, vescovo, martiri",
  saints: [
    {
      title: "Santi Cornelio, papa, e Cipriano, vescovo, martiri",
      rank: "memoria_obbligatoria",
    },
  ],
  season: { season: "Tempo Ordinario" },
});
assert(
  !!memorial && memorial !== "pt_80",
  `16 set 2026: attesa preghiera del santo/comune, ottenuto ${memorial}`,
);

const sundayPrefs = getSuggestedPrefacesForLiturgy(prefaces, {
  date: "2026-09-20",
  title: "XXV DOMENICA DEL TEMPO ORDINARIO",
  saints: [
    {
      title: "Santi Andrea Kim Taegon, sacerdote, Paolo Chong Hasang e compagni, martiri",
      rank: "memoria_obbligatoria",
    },
  ],
  season: { season: "Tempo Ordinario" },
});
const sundayPrefIds = sundayPrefs.map((p) => p.id).join(",");
assert(
  sundayPrefs.length > 0 && !/martir/i.test(sundayPrefIds),
  `20 set 2026: prefazio domenicale atteso, ottenuto ${sundayPrefIds || "(vuoto)"}`,
);

console.log("OK test-orazionale-sunday");
console.log("  2026-09-20 orazionale", sunday);
console.log("  2026-09-16 orazionale", memorial);
console.log("  2026-09-20 prefazi", sundayPrefIds);
