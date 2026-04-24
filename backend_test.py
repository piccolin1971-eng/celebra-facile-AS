"""Backend tests for /api/liturgy/range/{start_date} and related endpoints."""
import os
import sys
import json
import requests

BASE = os.environ.get("BACKEND_URL", "https://celebra-facile-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

results = []

def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} :: {detail}")
    results.append((name, ok, detail))

def test_happy_path():
    try:
        r = requests.get(f"{API}/liturgy/range/2026-04-25", params={"days": 3}, timeout=120)
    except Exception as e:
        record("happy_path_request", False, f"exception: {e}")
        return
    if r.status_code != 200:
        record("happy_path_status", False, f"HTTP {r.status_code}: {r.text[:300]}")
        return
    data = r.json()
    # Structure
    for k in ("start", "days", "items"):
        if k not in data:
            record("happy_path_keys", False, f"missing key {k}")
            return
    record("happy_path_keys", True, "has start/days/items")

    if data["start"] != "2026-04-25":
        record("happy_path_start", False, f"expected 2026-04-25 got {data['start']}")
    else:
        record("happy_path_start", True)

    if data["days"] != 3:
        record("happy_path_days_field", False, f"days={data['days']}")
    else:
        record("happy_path_days_field", True)

    items = data.get("items", [])
    if not isinstance(items, list) or len(items) != 3:
        record("happy_path_items_count", False, f"got {len(items) if isinstance(items, list) else 'non-list'}")
        return
    record("happy_path_items_count", True, "3 items")

    expected_dates = ["2026-04-25", "2026-04-26", "2026-04-27"]
    actual_dates = [it.get("date") for it in items]
    if actual_dates != expected_dates:
        record("happy_path_consecutive_dates", False, f"got {actual_dates}")
    else:
        record("happy_path_consecutive_dates", True)

    required_fields = ["date", "date_label", "season", "saints", "readings", "title", "liturgical_color"]
    missing_by_day = []
    for it in items:
        miss = [f for f in required_fields if f not in it]
        if miss:
            missing_by_day.append((it.get("date"), miss))
    if missing_by_day:
        record("happy_path_item_fields", False, f"missing: {missing_by_day}")
    else:
        record("happy_path_item_fields", True, f"all {len(required_fields)} fields present")

    # At least one day with non-empty readings
    has_readings = [len(it.get("readings") or []) for it in items]
    if any(c > 0 for c in has_readings):
        record("happy_path_readings_nonempty", True, f"readings counts: {has_readings}")
    else:
        record("happy_path_readings_nonempty", False, f"all days empty readings: {has_readings}")


def test_clamp_low():
    for d in (0, -5):
        try:
            r = requests.get(f"{API}/liturgy/range/2026-04-25", params={"days": d}, timeout=120)
        except Exception as e:
            record(f"clamp_low_{d}", False, f"exception: {e}")
            continue
        if r.status_code != 200:
            record(f"clamp_low_{d}", False, f"HTTP {r.status_code}")
            continue
        data = r.json()
        items = data.get("items", [])
        if data.get("days") == 1 and len(items) == 1:
            record(f"clamp_low_{d}", True, "clamped to 1")
        else:
            record(f"clamp_low_{d}", False, f"days={data.get('days')}, items={len(items)}")


def test_clamp_high():
    try:
        r = requests.get(f"{API}/liturgy/range/2026-04-25", params={"days": 100}, timeout=300)
    except Exception as e:
        record("clamp_high_100", False, f"exception: {e}")
        return
    if r.status_code != 200:
        record("clamp_high_100", False, f"HTTP {r.status_code}")
        return
    data = r.json()
    if data.get("days") == 30 and len(data.get("items", [])) == 30:
        record("clamp_high_100", True, "clamped to 30")
    else:
        record("clamp_high_100", False, f"days={data.get('days')}, items={len(data.get('items', []))}")


def test_default_days():
    try:
        r = requests.get(f"{API}/liturgy/range/2026-04-25", timeout=300)
    except Exception as e:
        record("default_days_7", False, f"exception: {e}")
        return
    if r.status_code != 200:
        record("default_days_7", False, f"HTTP {r.status_code}")
        return
    data = r.json()
    if data.get("days") == 7 and len(data.get("items", [])) == 7:
        record("default_days_7", True)
    else:
        record("default_days_7", False, f"days={data.get('days')}, items={len(data.get('items', []))}")


def test_invalid_dates():
    for bad in ("2026-13-99", "non-una-data", "abcd-ef-gh", "2026/04/25"):
        try:
            r = requests.get(f"{API}/liturgy/range/{bad}", params={"days": 2}, timeout=30)
        except Exception as e:
            record(f"invalid_date_{bad}", False, f"exception: {e}")
            continue
        if r.status_code != 400:
            record(f"invalid_date_{bad}", False, f"expected 400, got {r.status_code}: {r.text[:200]}")
            continue
        try:
            j = r.json()
            detail = j.get("detail", "")
        except Exception:
            detail = r.text
        if "Formato data non valido" in str(detail):
            record(f"invalid_date_{bad}", True, "400 + correct message")
        else:
            record(f"invalid_date_{bad}", False, f"400 but unexpected detail: {detail}")


def test_related_endpoints():
    endpoints = [
        ("liturgy_today", f"{API}/liturgy/today"),
        ("liturgy_by_date", f"{API}/liturgy/2026-04-25"),
        ("mass_order", f"{API}/mass/order"),
        ("prefaces", f"{API}/prefaces"),
    ]
    for name, url in endpoints:
        try:
            r = requests.get(url, timeout=120)
        except Exception as e:
            record(name, False, f"exception: {e}")
            continue
        if r.status_code == 200:
            record(name, True, "200 OK")
        else:
            record(name, False, f"HTTP {r.status_code}: {r.text[:200]}")


def test_scraping_error_resilience():
    """Use a far-future date that might fail; endpoint should still not crash."""
    try:
        r = requests.get(f"{API}/liturgy/range/2099-12-25", params={"days": 2}, timeout=120)
    except Exception as e:
        record("scraping_resilience", False, f"exception: {e}")
        return
    if r.status_code != 200:
        record("scraping_resilience", False, f"HTTP {r.status_code}")
        return
    data = r.json()
    items = data.get("items", [])
    if len(items) != 2:
        record("scraping_resilience", False, f"items count {len(items)}")
        return
    # If error happens, readings must be [] and an error field should exist.
    # If no error, that's also fine (just no crash).
    details = []
    for it in items:
        details.append({
            "date": it.get("date"),
            "readings_count": len(it.get("readings") or []),
            "has_error": bool(it.get("error")),
        })
    # Ensure items with error also have empty readings
    bad = [d for d in details if d["has_error"] and d["readings_count"] != 0]
    if bad:
        record("scraping_resilience", False, f"error + non-empty readings: {bad}")
    else:
        record("scraping_resilience", True, f"no crash; {details}")


def main():
    print(f"Testing against: {API}\n")
    test_happy_path()
    test_default_days()
    test_clamp_low()
    test_clamp_high()
    test_invalid_dates()
    test_scraping_error_resilience()
    test_related_endpoints()

    print("\n===== SUMMARY =====")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"{passed}/{total} tests passed")
    failed = [(n, d) for n, ok, d in results if not ok]
    if failed:
        print("\nFAILED:")
        for n, d in failed:
            print(f"  - {n}: {d}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
