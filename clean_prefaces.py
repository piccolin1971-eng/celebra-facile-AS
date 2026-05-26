"""
Pulisce i prefazi nell'app tagliando il testo oltre il confine liturgico corretto.
Il prefazio termina all'invito al Santo (prima di «Santo, Santo, Santo…»),
coerente con messa.tsx / celebra.tsx che aggiungono il Santo separatamente.
"""
import json
import re


# Intestazioni OCR da saltare (non interrompono il prefazio)
JUNK_LINE_RES = [
    re.compile(r"^i?\d{1,3}$"),
    re.compile(r"^i\d+i$"),  # es. i4i → pagina 141
    re.compile(r"^(?:XXXIV|IV|III|II|I)\s+domenica", re.I),
    re.compile(r"^Prima domenica dopo", re.I),
    re.compile(r"^Santissima Trinità$", re.I),
    re.compile(r"^Solennità$", re.I),
    re.compile(r"^Festa$", re.I),
    re.compile(r"^Nostro Signore Gesù Cristo$", re.I),
    re.compile(r"^Re dell['']universo$", re.I),
    re.compile(r"^Veglia Pasquale$", re.I),
    re.compile(r"^Giovedì Santo$", re.I),
    re.compile(r"^Giovedì della Settimana Santa$", re.I),
    re.compile(r"^Messa del Crisma$", re.I),
    re.compile(r"^i\d+\.\s", re.I),
    re.compile(r"^\d+\s+[A-Za-z].*(?:domenica|settimana|Battesimo|Quaresima|Ceneri|Signore|Crism)", re.I),
    re.compile(r"^III settimana di Quaresima", re.I),
    re.compile(r"^i0?\d\s+IV settimana", re.I),
    re.compile(r"^Comune della dedicazione$", re.I),
    re.compile(r"^Cena del Signore$", re.I),
    re.compile(r"^Reposizione del Santissimo", re.I),
    re.compile(r"^\d+\s+Rito della Messa", re.I),
    re.compile(r"^Preghiera Eucaristica\s+\d", re.I),
]

# Solo confini certi: ciò che segue non è più prefazio
STOP_LINE_RES = [
    re.compile(r"^Santo,\s*Santo,\s*Santo", re.I),
    re.compile(r"^Ant\.\s*alla comunione", re.I),
    re.compile(r"^\d+\.\s*Ant\.\s*alla comunione", re.I),
    re.compile(r"^Dopo la comunione", re.I),
    re.compile(r"^Orazione sul popolo", re.I),
    re.compile(r"^Ant\.\s*d['']ingresso", re.I),
    re.compile(r"^Canone Romano", re.I),
    re.compile(r"^Liturgia Eucaristica$", re.I),
    re.compile(r"^Sulle offerte$", re.I),
    re.compile(r"^Colletta$", re.I),
    re.compile(r"^Lunedì$", re.I),
    re.compile(r"^★"),
    re.compile(r"^(?:CP|CC|o)$"),
    re.compile(r"^Benedizione e imposizione", re.I),
    re.compile(r"^Terminata la comunione", re.I),
    re.compile(r"^Riti iniziali", re.I),
    re.compile(r"^Preghiera universale$", re.I),
    re.compile(r"^(?:Prima|Seconda|Terza|Quarta) parte:", re.I),
    re.compile(r"^Venerdì Santo\s*$", re.I),
    re.compile(r"^Sabato Santo$", re.I),
    re.compile(r"^Domenica di Pasqua", re.I),
]


def is_junk_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    return any(r.match(stripped) for r in JUNK_LINE_RES)


def clean_last_line(line: str) -> str:
    """Rimuove residui OCR attaccati alla riga finale (es. «gloria: i4i»)."""
    return re.sub(r":\s*i\d+i\s*$", ":", line.rstrip())


def clean_preface_text(text: str) -> str:
    lines = text.split("\n")
    result = []
    for line in lines:
        stripped = line.strip()
        if any(r.match(stripped) for r in STOP_LINE_RES):
            break
        if is_junk_line(stripped):
            continue
        result.append(line)
    if result:
        result[-1] = clean_last_line(result[-1])
    return "\n".join(result).strip()


def verify(prefaces: list) -> list[tuple[str, str]]:
    dirty = []
    markers = [
        "Ant. alla comunione",
        "Dopo la comunione",
        "Canone Romano",
        "Santo, Santo, Santo",
        "Colletta\n",
        "Orazione sul popolo",
        "Liturgia Eucaristica\n",
    ]
    for p in prefaces:
        for m in markers:
            if m in p["text"]:
                dirty.append((p["id"], m))
                break
        if p["text"].count("\n") < 5 and len(p["text"]) < 200:
            dirty.append((p["id"], "troppo_corto"))
    return dirty


def main():
    with open("frontend/src/data/prefaces.json", "r", encoding="utf-8") as f:
        prefaces = json.load(f)

    changed = 0
    for p in prefaces:
        cleaned = clean_preface_text(p["text"])
        if cleaned != p["text"]:
            p["text"] = cleaned
            changed += 1

    dirty = verify(prefaces)
    print(f"Prefazi totali: {len(prefaces)}")
    print(f"Modificati: {changed}")
    if dirty:
        print(f"Problemi residui ({len(dirty)}):")
        for d in dirty:
            print(f"  {d}")
    else:
        print("Verifica OK.")

    with open("frontend/src/data/prefaces.json", "w", encoding="utf-8") as f:
        json.dump(prefaces, f, indent=2, ensure_ascii=False)

    header = (
        '"""\nCorpus completo dei Prefazi del Messale Romano in lingua italiana '
        '(III edizione).\nEstratti direttamente dal Messale 2020.\n"""\n\nPREFACES = '
    )
    with open("backend/prefaces_data.py", "w", encoding="utf-8") as f:
        f.write(header)
        json.dump(prefaces, f, indent=4, ensure_ascii=False)

    print("Aggiornati prefaces.json e prefaces_data.py")


if __name__ == "__main__":
    main()
