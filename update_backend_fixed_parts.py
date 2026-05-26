"""Sync FIXED_PARTS in backend/liturgy_data.py from frontend fixedParts.json."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
JSON_PATH = ROOT / "frontend" / "src" / "data" / "fixedParts.json"
PY_PATH = ROOT / "backend" / "liturgy_data.py"
MARKER = "PREFACES = ["


def main():
    fixed = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    text = PY_PATH.read_text(encoding="utf-8")
    start = text.index("FIXED_PARTS = {")
    end = text.index(MARKER)
    before = text[:start]
    after = text[end:]
    body = json.dumps(fixed, indent=4, ensure_ascii=False)
    PY_PATH.write_text(f"{before}FIXED_PARTS = {body}\n\n{after}", encoding="utf-8")
    print("Synced FIXED_PARTS from fixedParts.json -> liturgy_data.py")


if __name__ == "__main__":
    main()
