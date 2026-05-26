"""Phase A: reclassify preface season/category metadata per approved taxonomy."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
JSON_PATH = ROOT / "frontend" / "src" / "data" / "prefaces.json"

PASQUA_ORDER = [
    "pasquale_i_il_mistero",
    "pasquale_ii_la_vita_nu",
    "pasquale_iii_cristo_viv",
    "pasquale_iv_la_restaur",
    "pasquale_v_cristo_agn",
    "dell_ascensione_del_signore_i_il_mistero",
    "dell_ascensione_del_signore_ii_il_mistero",
    "dopo_l_ascensione_nell_attes",
    "il_signore_manda_lo_spirito_nella_chiesa",
    "il_mistero_della_pentecoste",
]

ORDINARIO_ORDER = [
    "delle_domeniche_del_tempo",
    "delle_domeniche_del_tempo_ii",
    "delle_domeniche_del_tempo_iii",
    "delle_domeniche_del_tempo_iv",
    "delle_domeniche_del_tempo_v",
    "delle_domeniche_del_tempo_vi",
    "delle_domeniche_del_tempo_vii",
    "delle_domeniche_del_tempo_viii",
    "la_missione_dello_spirito_nella_chiesa",
    "delle_domeniche_del_tempo_x",
]

COMUNE_IDS = {
    "comune_i_il_rinnova",
    "comune_ii_la_salvezz",
    "comune_iii_lode_a_dio",
    "comune_iv_la_lode__d",
    "comune_v_proclamazi",
    "comune_vi_cristo_sal",
    "comune_vii_cristo_osp",
    "comune_viii_ges__buon",
    "comune_ix_la_gloria",
}

MISTERI_IDS = {
    "consacrazione_e_missione_di_ges",
    "le_tentazioni_del_signore",
    "la_trasfigurazione_del_signore",
    "la_samaritana",
    "il_cieco_nato",
    "la_risurrezione_di_lazzaro",
    "il_sacerdozio_di_cristo_e_il_ministero_dei_sacerdoti",
    "cristo_re_dell_universo",
    "il_mistero_della_santissima_trinit",
    "l_immenso_amore_di_cristo",
    "la_vittoria_della_croce_gloriosa",
    "il_mistero_della_presentazione_del_signore",
    "il_mistero_dell_incarnazione",
    "la_missione_del_precursore",
    "il_mistero_della_trasfigurazione",
    "la_gloria_della_gerusalemme_del_cielo__nostra_madre",
    "il_mistero_della_chiesa_che___sposa_di_cristo_e_tempio_dello_spirito",
    "l_unit__del_corpo_di_cristo_che___la_chiesa",
}

EUCARISTIA_IDS = {
    "della_santissima_eucaristia_i_l_eucarist",
    "della_santissima_eucaristia_ii_i_frutti_d",
    "della_santissima_eucaristia_iii_l_eucarist",
}

SACRAMENTI_IDS = {
    "della_confermazione_confermati",
    "della_penitenza_il_sacrame",
    "dell_unzione_degli_infermi_la_soffere",
    "dell_ordine_cristo_sor",
    "del_matrimonio_la_dignit",
    "il_grande_sacramento_del_matrimonio",
    "il_matrimonio_segno_dell_amore_di_dio",
    "la_dignit__dell_alleanza_nuziale",
    "cristo_fonte_di_tutti_i_ministeri_della_chiesa",
    "l_altare___cristo",
    "il_mistero_del_tempio_di_dio",
    "il_mistero_del_tempio_di_dio_che___la_chiesa",
}

SAINTS_IDS = {
    "degli_angeli_la_gloria",
    "degli_apostoli_i_gli_aposto",
    "degli_apostoli_ii_la_chiesa",
    "dei_santi_i_la_gloria",
    "dei_santi_ii_l_esempio",
    "dei_santi_martiri_i_il_segno_e",
    "dei_santi_martiri_ii_le_meravig",
    "dei_santi_pastori_i_la_presenz",
    "dei_santi_pastori_ii_i_pastori",
    "dei_santi_pastori_iii_l_annuncio",
    "dei_santi_dottori_della_chiesa_i_i_dottori",
    "dei_santi_dottori_della_chiesa_ii_i_dottori",
    "delle_sante_vergini_e_dei_sant",
    "la_duplice_missione_di_pietro_e_di_paolo_nella_chiesa",
    "apostola_degli_apostoli",
    "la_verginit__per_il_regno_dei_cieli",
    "la_vita_religiosa_come_servizio_a_dio_nell_imitazione_di_cristo",
}

BVM_IDS = {
    "della_beata_vergine_maria_i_la_materni",
    "della_beata_vergine_maria_ii_la_chiesa",
    "della_beata_vergine_maria_iii_maria_mode",
    "della_beata_vergine_maria_iv_maria_segn",
    "della_beata_vergine_maria_v_maria_imma",
    "di_san_giuseppe_sposo_dell",
    "la_gloria_di_maria_assunta_in_cielo",
    "il_mistero_di_maria_e_della_chiesa",
}

PASQUA_IDS = set(PASQUA_ORDER)

SEASON_BY_PREFIX = {
    "dell_avvento_": "avvento",
    "di_natale_": "natale",
    "dell_epifania_": "natale",
    "di_quaresima_": "quaresima",
    "della_passione_": "passione",
    "dei_defunti_": "defunti",
}


def season_for(p: dict) -> str:
    pid = p["id"]
    if pid in PASQUA_IDS:
        return "pasqua"
    if pid in ORDINARIO_ORDER:
        return "ordinario"
    if pid in COMUNE_IDS:
        return "comune"
    if pid in MISTERI_IDS:
        return "misteri"
    if pid in EUCARISTIA_IDS:
        return "eucaristia"
    if pid in SACRAMENTI_IDS:
        return "sacramenti"
    if pid in SAINTS_IDS:
        return "santi"
    if pid in BVM_IDS:
        return "bvm"
    if pid == "la_passione_del_signore":
        return "passione"
    for prefix, season in SEASON_BY_PREFIX.items():
        if pid.startswith(prefix):
            return season
    raise ValueError(f"No season mapping for {pid}")


def sort_order_for(p: dict) -> int | None:
    pid = p["id"]
    if pid in PASQUA_ORDER:
        return PASQUA_ORDER.index(pid) + 1
    if pid in ORDINARIO_ORDER:
        return ORDINARIO_ORDER.index(pid) + 1
    return None


def main():
    with JSON_PATH.open(encoding="utf-8") as f:
        prefaces = json.load(f)

    counts: dict[str, int] = {}
    for p in prefaces:
        season = season_for(p)
        p["season"] = season
        p["category"] = season
        order = sort_order_for(p)
        if order is not None:
            p["sortOrder"] = order
        elif "sortOrder" in p:
            del p["sortOrder"]
        counts[season] = counts.get(season, 0) + 1

        if p["id"] == "il_grande_sacramento_del_matrimonio":
            p["text"] = p["text"].replace("\n8i6 Messe rituali\n", "\n")

    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(prefaces, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print("Reclassified", len(prefaces), "prefaces:")
    for k in sorted(counts):
        print(f"  {k}: {counts[k]}")
    assert len(prefaces) == 108
    assert counts.get("comune") == 9
    assert counts.get("pasqua") == 10
    assert counts.get("eucaristia") == 3
    assert counts.get("ordinario") == 10
    assert counts.get("sacramenti") == 12
    assert counts.get("bvm") == 8
    assert counts.get("santi") == 17
    assert "rituali" not in counts
    assert "pe" not in counts


if __name__ == "__main__":
    main()
