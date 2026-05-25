import re
import json

def extract():
    with open('messale 2020.txt', 'r', encoding='utf-8') as f:
        content = f.read()

    # Normalizzazione preventiva massiva per facilitare l'estrazione
    content = content.replace('ı', 'i').replace('Π', 'T').replace('π', 't').replace('±', 'N').replace('Ω', 'ff').replace('^', '✠')

    # Rimuoviamo intestazioni di pagina comuni
    content = re.sub(r'\d+\s+Rito della Messa con il popolo', '', content)
    content = re.sub(r'Preghiera Eucaristica\s+\d+', '', content)

    # Split basato su Prefazio
    parts = re.split(r'(?:★\s*)?Prefazio\s+', content)

    prefaces = []

    for part in parts[1:]:
        lines = [l.strip() for l in part.strip().split('\n') if l.strip()]
        if not lines: continue

        # Titolo (prima riga)
        title_line = lines[0]

        # Sottotitolo (opzionale)
        subtitle = ""
        if len(lines) > 1 and not any(x in lines[1] for x in ['V/', 'R/', 'Il seguente', 'È veramente', 'Veramente è']):
            subtitle = lines[1]

        full_title = f"Prefazio {title_line}"
        if subtitle:
            full_title += f" - {subtitle}"

        # Cerchiamo il corpo (da "È veramente" o "Veramente è")
        text_start = -1
        for i, line in enumerate(lines):
            if line.startswith("È veramente") or line.startswith("Veramente è") or "È veramente" in line[:15]:
                text_start = i
                break

        if text_start == -1: continue

        # Raccogliamo il testo
        text_lines = []
        for line in lines[text_start:]:
            clean_line = line.replace('+', '').replace('*', '').replace('**', '').strip()
            if not clean_line: continue
            text_lines.append(clean_line)
            if "inno" in clean_line.lower() and ":" in clean_line:
                break

        text = "\n".join(text_lines)

        # Categoria basata sul titolo normalizzato
        category = "comune"
        t = full_title.lower()
        if "avvento" in t: category = "avvento"
        elif any(x in t for x in ["natale", "epifania", "battesimo"]): category = "natale"
        elif "quaresima" in t: category = "quaresima"
        elif any(x in t for x in ["passione", "palme"]): category = "passione"
        elif any(x in t for x in ["pasqua", "ascensione", "pentecoste"]): category = "pasqua"
        elif "domeniche" in t: category = "ordinario"
        elif "maria" in t or "b.v.m." in t: category = "bvm"
        elif any(x in t for x in ["santi", "apostoli", "martiri", "angeli", "giuseppe", "giovanni"]): category = "santi"
        elif any(x in t for x in ["matrimonio", "ordine", "dedicazione"]): category = "rituali"
        elif "eucaristica" in t: category = "pe"
        elif "defunti" in t: category = "defunti"
        elif any(x in t for x in ["trinità", "cuore", "croce", "eucaristia"]): category = "misteri"

        # Pulizia OCR residua "que" -> "che"
        text = re.sub(r'\bque\b', 'che', text, flags=re.IGNORECASE)

        prefaces.append({
            "id": re.sub(r'[^a-z0-9]', '_', title_line.lower() + "_" + subtitle[:10].lower()).strip('_'),
            "title": full_title,
            "category": category,
            "season": category,
            "text": text
        })

    seen = set()
    unique_prefaces = []
    for p in prefaces:
        if p["id"] not in seen:
            unique_prefaces.append(p)
            seen.add(p["id"])

    with open('frontend/src/data/prefaces.json', 'w', encoding='utf-8') as f:
        json.dump(unique_prefaces, f, indent=2, ensure_ascii=False)

    print(f"Estratti {len(unique_prefaces)} prefazi unici.")

if __name__ == "__main__":
    extract()
