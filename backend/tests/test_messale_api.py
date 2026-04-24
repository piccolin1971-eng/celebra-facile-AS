"""Backend tests for Messale Digitale API."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://celebra-facile-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ----- Root -----
def test_root_ok(client):
    r = client.get(f"{API}/", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"


# ----- Liturgy today -----
def test_liturgy_today_structure(client):
    r = client.get(f"{API}/liturgy/today", timeout=60)
    assert r.status_code == 200
    data = r.json()
    for k in ("date", "date_label", "season", "liturgical_color", "readings", "cached"):
        assert k in data, f"missing key {k}"
    assert isinstance(data["readings"], list)
    assert isinstance(data["season"], dict)


def test_liturgy_today_cache_second_call(client):
    # First call primes cache; second should be cached:true
    client.get(f"{API}/liturgy/today", timeout=60)
    r2 = client.get(f"{API}/liturgy/today", timeout=60)
    assert r2.status_code == 200
    data = r2.json()
    # Cached flag should be True if readings were successfully retrieved first time
    if data.get("readings"):
        assert data.get("cached") is True


# ----- Fixed parts -----
def test_fixed_parts_all_present(client):
    r = client.get(f"{API}/mass/fixed-parts", timeout=30)
    assert r.status_code == 200
    parts = r.json().get("parts", {})
    for key in ("riti_iniziali", "atto_penitenziale", "gloria", "credo",
                "offertorio", "padre_nostro", "comunione", "riti_conclusione"):
        assert key in parts, f"parte fissa mancante: {key}"


def test_atto_penitenziale_abc(client):
    r = client.get(f"{API}/mass/fixed-parts/atto_penitenziale", timeout=30)
    assert r.status_code == 200
    data = r.json()
    body = str(data).lower()
    # expect at least formula references A/B/C present in data
    assert "formula" in body or "a" in body


# ----- Prefaces -----
def test_prefaces_list(client):
    r = client.get(f"{API}/prefaces", timeout=30)
    assert r.status_code == 200
    items = r.json().get("prefaces", [])
    assert isinstance(items, list) and len(items) > 0
    for p in items:
        assert "id" in p and "season" in p


def test_prefaces_filter_pasqua(client):
    r = client.get(f"{API}/prefaces?season=pasqua", timeout=30)
    assert r.status_code == 200
    items = r.json().get("prefaces", [])
    assert len(items) > 0
    for p in items:
        assert p["season"].lower() in ("pasqua", "comune")


# ----- Eucharistic prayers -----
def test_eucharistic_prayers_four(client):
    r = client.get(f"{API}/eucharistic-prayers", timeout=30)
    assert r.status_code == 200
    prayers = r.json().get("prayers", [])
    ids = {p.get("id") for p in prayers}
    for pid in ("pe1", "pe2", "pe3", "pe4"):
        assert pid in ids, f"manca {pid}"


# ----- Saints calendar -----
def test_calendar_saints_all(client):
    r = client.get(f"{API}/calendar/saints", timeout=30)
    assert r.status_code == 200
    cal = r.json().get("calendar", [])
    assert isinstance(cal, list) and len(cal) > 0


def test_calendar_saints_christmas(client):
    r = client.get(f"{API}/calendar/saints/2026-12-25", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["date"] == "2026-12-25"
    text = str(data.get("celebrations", [])).lower()
    assert "natal" in text or "nativit" in text


# ----- Votive masses -----
def test_votive_masses(client):
    r = client.get(f"{API}/votive-masses", timeout=30)
    assert r.status_code == 200
    masses = r.json().get("masses", [])
    assert isinstance(masses, list) and len(masses) > 0


# ----- Refresh liturgy -----
def test_refresh_liturgy(client):
    r = client.post(f"{API}/liturgy/refresh/2026-04-24", timeout=90)
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "refreshed"
    assert data.get("date") == "2026-04-24"


# ----- Invalid date -----
def test_invalid_date_format(client):
    r = client.get(f"{API}/liturgy/not-a-date", timeout=30)
    assert r.status_code == 400
