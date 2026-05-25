import json

with open('frontend/src/data/prefaces.json', 'r', encoding='utf-8') as f:
    prefaces = json.load(f)

header = '"""\nCorpus completo dei Prefazi del Messale Romano in lingua italiana (III edizione).\nEstratti direttamente dal Messale 2020.\n"""\n\nPREFACES = '
with open('backend/prefaces_data.py', 'w', encoding='utf-8') as f:
    f.write(header)
    json.dump(prefaces, f, indent=4, ensure_ascii=False)
