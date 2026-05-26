"""
Scraper per chiesacattolica.it per ottenere letture del giorno e info liturgiche.
"""
import httpx
from bs4 import BeautifulSoup
from datetime import datetime, date
import logging
import re

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "it-IT,it;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Mapping dei titoli delle sezioni -> tipo normalizzato
SECTION_TYPE_MAP = [
    (re.compile(r"^antifona\s+d?['’ ]?ingresso|^antifona$", re.I), "antifona_ingresso"),
    (re.compile(r"^colletta", re.I), "colletta"),
    (re.compile(r"^prima lettura", re.I), "prima_lettura"),
    (re.compile(r"^salmo", re.I), "salmo"),
    (re.compile(r"^seconda lettura", re.I), "seconda_lettura"),
    (re.compile(r"^sequenza", re.I), "sequenza"),
    (re.compile(r"^acclamazione|^canto al vangelo", re.I), "acclamazione"),
    (re.compile(r"^vangelo", re.I), "vangelo"),
    (re.compile(r"^sulle offerte|^preghiera sulle offerte", re.I), "sulle_offerte"),
    (re.compile(r"^antifona alla comunione|^antifona di comunione", re.I), "antifona_comunione"),
    (re.compile(r"^dopo la comunione|^preghiera dopo la comunione", re.I), "dopo_comunione"),
]

# Etichette leggibili per l'app
TYPE_LABELS = {
    "antifona_ingresso": "Antifona d'ingresso",
    "colletta": "Colletta",
    "prima_lettura": "Prima Lettura",
    "salmo": "Salmo Responsoriale",
    "seconda_lettura": "Seconda Lettura",
    "sequenza": "Sequenza",
    "acclamazione": "Acclamazione al Vangelo",
    "vangelo": "Vangelo",
    "sulle_offerte": "Sulle offerte",
    "antifona_comunione": "Antifona alla Comunione",
    "dopo_comunione": "Dopo la Comunione",
}


def _clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Ricompone parentesi spezzate su più righe: "...(\nRef\n)" -> "...(Ref)"
    # Esempi: "Alleluia. (\nAp 5,12\n)" oppure "(\nGv 6,52-59\n)"
    text = re.sub(r"\(\s*\n\s*([^()\n]+?)\s*\n\s*\)", r"(\1)", text)
    # Caso: apertura a fine riga, chiusura a inizio riga successiva
    text = re.sub(r"\(\s*\n+\s*", "(", text)
    text = re.sub(r"\s*\n+\s*\)", ")", text)
    return text.strip()


def _classify(title: str) -> str | None:
    t = title.strip()
    for pattern, key in SECTION_TYPE_MAP:
        if pattern.search(t):
            return key
    return None


def _extract_reference(full_text: str, rtype: str) -> tuple[str, str]:
    """Estrae il riferimento biblico dall'inizio del testo (es: 'Dagli Atti degli Apostoli At 9,1-20 ...')."""
    if rtype not in ("prima_lettura", "seconda_lettura", "vangelo"):
        return "", full_text

    # Pattern tipici: "Dal/Dagli/Dalla ... <Ref Biblico> <Testo...>"
    # L'abbreviazione biblica (es "At 9,1-20" o "Gv 6,52-59") segna l'inizio del testo.
    m = re.match(r"(Dal(?:la|l')?|Dagli?|Dall['’]?)\s+[^.]{2,80}?\s+([1-3]?\s?[A-ZÈÉ][a-zèéì]{0,4}\.?\s*\d+[,.:]\s?[\d\-\.\,aA–\s]+)\s+(.+)", full_text, re.DOTALL)
    if m:
        intro = m.group(1) + " " + re.sub(r"\s+", " ", full_text[len(m.group(1))+1: full_text.find(m.group(2))]).strip()
        ref_body = m.group(2).strip()
        body = m.group(3).strip()
        reference = f"{intro} ({ref_body})"
        return reference, body

    # Fallback: prima riga se breve
    lines = full_text.split("\n", 1)
    if len(lines) == 2 and len(lines[0]) < 100:
        return lines[0].strip(), lines[1].strip()
    return "", full_text


def _build_url(target_date: date) -> str:
    return f"https://www.chiesacattolica.it/liturgia-del-giorno/?data-liturgia={target_date.strftime('%Y%m%d')}"


async def fetch_liturgy(target_date: date) -> dict:
    url = _build_url(target_date)
    result = {
        "date": target_date.isoformat(),
        "title": "",
        "liturgical_color": "",
        "readings": [],
        "source": "chiesacattolica.it",
        "source_url": url,
        "fetched_at": datetime.utcnow().isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True, headers=HEADERS) as client:
            response = await client.get(url)
            response.raise_for_status()
            html = response.text
    except Exception as e:
        logger.error(f"Errore nel recupero URL {url}: {e}")
        result["error"] = f"Impossibile connettersi a chiesacattolica.it: {str(e)}"
        return result

    soup = BeautifulSoup(html, "lxml")

    # Titolo: cerca nel title della pagina o in og:title
    meta_title = soup.find("meta", attrs={"property": "og:title"})
    if meta_title:
        content = meta_title.get("content", "").strip()
        # Rimuovi prefissi e date raw
        content = re.sub(r"^[Ll]iturgi[ae]\s+(del|di|dei)\s+", "", content).strip()
        content = re.sub(r"\s*[-–—]\s*\d{6,8}\s*$", "", content).strip()
        # Se rimane solo una data raw (es "20260424"), scarta
        if re.fullmatch(r"\d{6,8}", content):
            content = ""
        result["title"] = content

    # Estrai le sezioni (h2 + div.section-content).
    # Il sito ripete molte sezioni per Messe alternative (es. memoria facoltativa del santo):
    # teniamo solo la prima occorrenza di ogni tipo (= Messa del giorno primaria).
    titles = soup.find_all("h2", class_="cci-liturgia-giorno-section-title")
    seen_types = set()
    readings = []

    for h in titles:
        title_text = _clean_text(h.get_text())
        content_div = h.find_next("div", class_="cci-liturgia-giorno-section-content")
        if not content_div:
            continue

        body_text = _clean_text(content_div.get_text("\n", strip=True))
        if not body_text:
            continue

        rtype = _classify(title_text)
        if not rtype or rtype in seen_types:
            continue
        seen_types.add(rtype)

        reference, clean_body = _extract_reference(body_text, rtype)

        readings.append({
            "type": rtype,
            "title": TYPE_LABELS.get(rtype, title_text),
            "reference": reference,
            "text": clean_body,
        })

    # Ordinamento logico
    order = ["antifona_ingresso", "colletta", "prima_lettura", "salmo", "seconda_lettura",
             "sequenza", "acclamazione", "vangelo", "sulle_offerte",
             "antifona_comunione", "dopo_comunione"]
    readings.sort(key=lambda r: order.index(r["type"]) if r["type"] in order else 99)

    result["readings"] = readings

    if not readings:
        result["error"] = "Impossibile estrarre le letture dalla pagina."

    return result


COLOR_MAP = {
    "verde": "#1B5E20",
    "viola": "#4A148C",
    "bianco": "#D4AF37",
    "rosso": "#B71C1C",
    "rosa": "#AD1457",
}


def get_liturgical_season(target_date: date) -> dict:
    """Calcolo approssimativo del tempo liturgico."""
    month = target_date.month
    day = target_date.day

    if (month == 12 and day <= 24) or (month == 11 and day >= 27):
        return {"season": "Avvento", "color": "viola", "color_hex": COLOR_MAP["viola"]}
    if (month == 12 and day >= 25) or (month == 1 and day <= 13):
        return {"season": "Natale", "color": "bianco", "color_hex": COLOR_MAP["bianco"]}
    if (month == 2 and day >= 14) or (month == 3 and day <= 31):
        return {"season": "Quaresima", "color": "viola", "color_hex": COLOR_MAP["viola"]}
    if (month == 4) or (month == 5 and day <= 25):
        return {"season": "Pasqua", "color": "bianco", "color_hex": COLOR_MAP["bianco"]}
    return {"season": "Tempo Ordinario", "color": "verde", "color_hex": COLOR_MAP["verde"]}


def calculate_liturgical_color(season: dict, saints: list) -> dict:
    """Calcola il colore effettivo considerando i gradi delle celebrazioni."""
    rank_priority = {
        "solennita": 1,
        "festa": 2,
        "memoria_obbligatoria": 3,
        "memoria_facoltativa": 4,
    }

    best = None
    for s in saints:
        if not best or rank_priority.get(s["rank"], 99) < rank_priority.get(best["rank"], 99):
            best = s

    is_lent_or_advent = season["season"] in ("Avvento", "Quaresima")

    if best:
        if best["rank"] in ("solennita", "festa"):
            return {"color": best["color"], "color_hex": COLOR_MAP.get(best["color"], season["color_hex"])}
        if best["rank"] == "memoria_obbligatoria" and not is_lent_or_advent:
            return {"color": best["color"], "color_hex": COLOR_MAP.get(best["color"], season["color_hex"])}

    return {"color": season["color"], "color_hex": season["color_hex"]}

