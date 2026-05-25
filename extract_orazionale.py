import re
import json

def extract():
    with open('orazionale 2020.txt', 'r', encoding='utf-8') as f:
        content = f.read()

    # Normalizzazione preventiva massiva
    content = content.replace('ı', 'i').replace('Π', 'T').replace('π', 't').replace('±', 'N').replace('Ω', 'ff').replace('^', '✠').replace('╬®', 'ff').replace('┬½', '«').replace('┬╗', '»').replace('ÔÇÖ', "'").replace('╬á', 'T').replace('┬▒', 'N').replace('╬á', 'T').replace('╬áu', 'Tu')

    # Rimuoviamo intestazioni di pagina comuni
    content = re.sub(r'\d+\s+Orazionale per la Preghiera universale', '', content)
    content = re.sub(r'Orazionale per la Preghiera universale\s+\d+', '', content)

    # Identifichiamo le sezioni principali (basate sull'indice trovato nel file)
    sections_map = {
        "proprio_tempo": [],
        "santi": [],
        "quattro_tempora": [],
        "varie": [],
        "defunti": [],
        "forma_breve": []
    }

    # Cerchiamo blocchi di preghiere. Solitamente hanno un titolo in MAIUSCOLO o ben definito
    # Seguiti da un'introduzione e poi da intenzioni che finiscono con "R/."

    # Split basato sui titoli conosciuti dall'indice
    # Nota: Questo è un approccio semplificato per estrarre il più possibile

    # Titoli di sezione nel testo
    content = content.replace('Per il Proprio del Tempo', '###SECTION:proprio_tempo###')
    content = content.replace('Per le Celebrazioni dei Santi', '###SECTION:santi###')
    content = content.replace('Per varie necessità', '###SECTION:varie###')
    content = content.replace('Per i defunti', '###SECTION:defunti###')
    content = content.replace('Preghiera universale in forma breve', '###SECTION:forma_breve###')

    current_section = "proprio_tempo"
    parts = re.split(r'###SECTION:(\w+)###', content)

    for i in range(1, len(parts), 2):
        sec_name = parts[i]
        sec_content = parts[i+1]

        # In ogni sezione, cerchiamo le singole preghiere
        # Spesso iniziano con un titolo specifico
        # Esempio: "Tempo di Avvento I", "25 gennaio - Conversione di san Paolo"

        # Troviamo i titoli cercando righe che non contengono "Preghiamo" o "R/." e sono seguite da introduzione
        # Heuristica: split basato su righe che sembrano titoli

        # Per semplicità, cerchiamo i blocchi che finiscono con "Amen." o "Per Cristo nostro Signore."
        prayers_raw = re.findall(r'([A-Z0-9].*?\n(?:.*?\n){5,40}?Amen\.)', sec_content, re.DOTALL)

        for p_raw in prayers_raw:
            lines = [l.strip() for l in p_raw.split('\n') if l.strip()]
            if len(lines) < 5: continue

            title = lines[0]
            body = "\n".join(lines)

            # Pulizia OCR "que" -> "che" (già fatta massivamente nel file ma per sicurezza)
            body = re.sub(r'\bque\b', 'che', body, flags=re.IGNORECASE)

            p_id = re.sub(r'[^a-z0-9]', '_', title.lower()[:20])

            sections_map[sec_name].append({
                "id": p_id,
                "title": title,
                "body": body
            })

    # Integriamo con i dati esistenti per non perdere nulla (le ID potrebbero differire)
    with open('frontend/src/data/orazionale.json', 'w', encoding='utf-8') as f:
        json.dump(sections_map, f, indent=2, ensure_ascii=False)

    total = sum(len(v) for v in sections_map.values())
    print(f"Estratte {total} preghiere dell'Orazionale.")

if __name__ == "__main__":
    extract()
