from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, date, timezone

from liturgy_data import FIXED_PARTS, MASS_ORDER, EUCHARISTIC_PRAYERS
from prefaces_data import PREFACES
from liturgy_scraper import fetch_liturgy, get_liturgical_season
from saints_calendar import get_saints_for_date, VOTIVE_MASSES, SAINTS_CALENDAR

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
readings_coll = db.daily_readings

app = FastAPI(title="Messale Digitale API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def _parse_date(date_str: str) -> date:
    """Converte YYYY-MM-DD in date."""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato data non valido. Usare YYYY-MM-DD.")


@api_router.get("/")
async def root():
    return {"message": "Messale Digitale API", "status": "ok"}


# ===== LITURGIA GIORNALIERA =====

@api_router.get("/liturgy/today")
async def liturgy_today():
    """Ritorna info liturgiche complete di oggi: stagione, santi, letture."""
    today = date.today()
    return await _full_liturgy(today)


@api_router.get("/liturgy/{date_str}")
async def liturgy_by_date(date_str: str):
    """Info liturgiche per data specifica (YYYY-MM-DD)."""
    target = _parse_date(date_str)
    return await _full_liturgy(target)


async def _full_liturgy(target: date) -> dict:
    season = get_liturgical_season(target)
    saints = get_saints_for_date(target)

    # Prova a caricare da cache (MongoDB)
    cached = await readings_coll.find_one({"date": target.isoformat()}, {"_id": 0})

    readings_data = None
    if cached and cached.get("readings"):
        readings_data = cached
    else:
        # Fetch from chiesacattolica.it
        try:
            readings_data = await fetch_liturgy(target)
            if readings_data.get("readings"):
                # Cache in MongoDB
                await readings_coll.update_one(
                    {"date": target.isoformat()},
                    {"$set": readings_data},
                    upsert=True,
                )
        except Exception as e:
            logger.error(f"Errore fetch liturgia: {e}")
            readings_data = {"date": target.isoformat(), "readings": [], "error": str(e)}

    # Pulisci _id se presente
    if readings_data and "_id" in readings_data:
        del readings_data["_id"]

    return {
        "date": target.isoformat(),
        "date_label": _italian_date_label(target),
        "season": season,
        "saints": saints,
        "readings": readings_data.get("readings", []) if readings_data else [],
        "title": readings_data.get("title", "") if readings_data else "",
        "liturgical_color": readings_data.get("liturgical_color", "") or season.get("color", ""),
        "source": readings_data.get("source", "") if readings_data else "",
        "source_url": readings_data.get("source_url", "") if readings_data else "",
        "cached": bool(cached),
        "error": readings_data.get("error") if readings_data else None,
    }


@api_router.post("/liturgy/refresh/{date_str}")
async def refresh_liturgy(date_str: str):
    """Forza nuovo scraping per la data (aggiorna cache)."""
    target = _parse_date(date_str)
    readings_data = await fetch_liturgy(target)
    if readings_data.get("readings"):
        await readings_coll.update_one(
            {"date": target.isoformat()},
            {"$set": readings_data},
            upsert=True,
        )
    return {"status": "refreshed", "date": target.isoformat(), "readings_count": len(readings_data.get("readings", []))}


def _italian_date_label(d: date) -> str:
    giorni = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]
    mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
            "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
    return f"{giorni[d.weekday()]} {d.day} {mesi[d.month-1]} {d.year}"


# ===== ORDINARIO DELLA MESSA =====

@api_router.get("/mass/order")
async def mass_order():
    """Struttura/indice dell'Ordinario della Messa."""
    return {"order": MASS_ORDER}


@api_router.get("/mass/fixed-parts")
async def fixed_parts():
    """Tutte le parti fisse dell'Ordinario della Messa."""
    return {"parts": FIXED_PARTS}


@api_router.get("/mass/fixed-parts/{part_id}")
async def fixed_part(part_id: str):
    """Una singola parte fissa dell'Ordinario."""
    if part_id not in FIXED_PARTS:
        raise HTTPException(status_code=404, detail=f"Parte '{part_id}' non trovata")
    return FIXED_PARTS[part_id]


# ===== PREFAZI =====

@api_router.get("/prefaces")
async def prefaces(season: str | None = None):
    """Elenco prefazi. Filtra per stagione liturgica se specificato."""
    if season:
        s = season.lower()
        filtered = [p for p in PREFACES if p["season"].lower() == s or p["season"] == "comune"]
        return {"prefaces": filtered}
    return {"prefaces": PREFACES}


@api_router.get("/prefaces/{preface_id}")
async def preface(preface_id: str):
    for p in PREFACES:
        if p["id"] == preface_id:
            return p
    raise HTTPException(status_code=404, detail="Prefazio non trovato")


# ===== PREGHIERE EUCARISTICHE =====

@api_router.get("/eucharistic-prayers")
async def eucharistic_prayers():
    """Elenco preghiere eucaristiche."""
    return {"prayers": EUCHARISTIC_PRAYERS}


@api_router.get("/eucharistic-prayers/{prayer_id}")
async def eucharistic_prayer(prayer_id: str):
    for p in EUCHARISTIC_PRAYERS:
        if p["id"] == prayer_id:
            return p
    raise HTTPException(status_code=404, detail="Preghiera eucaristica non trovata")


# ===== CALENDARIO SANTI E MESSE VOTIVE =====

@api_router.get("/calendar/saints")
async def all_saints():
    """Tutto il calendario dei santi."""
    entries = []
    for key, celebrations in sorted(SAINTS_CALENDAR.items()):
        entries.append({"date": key, "celebrations": celebrations})
    return {"calendar": entries}


@api_router.get("/calendar/saints/{date_str}")
async def saints_for_date(date_str: str):
    """Santi e celebrazioni per una data specifica (YYYY-MM-DD)."""
    target = _parse_date(date_str)
    return {"date": target.isoformat(), "celebrations": get_saints_for_date(target)}


@api_router.get("/votive-masses")
async def votive_masses():
    """Elenco messe votive disponibili."""
    return {"masses": VOTIVE_MASSES}


# ===== DOWNLOAD/CACHE =====

@api_router.get("/cache/readings")
async def cached_readings():
    """Elenco letture in cache (per gestione offline)."""
    cursor = readings_coll.find({}, {"_id": 0, "date": 1, "title": 1, "fetched_at": 1}).sort("date", -1).limit(60)
    items = await cursor.to_list(length=60)
    return {"cached_dates": items, "count": len(items)}


@api_router.delete("/cache/readings/{date_str}")
async def delete_cached(date_str: str):
    target = _parse_date(date_str)
    result = await readings_coll.delete_one({"date": target.isoformat()})
    return {"deleted": result.deleted_count}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
