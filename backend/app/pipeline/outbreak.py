"""Outbreak engine. Runs on every classified query (event-based).

Rule: >= OUTBREAK_MIN_CASES distinct farmers, same tehsil, same disease tag, within OUTBREAK_WINDOW_DAYS
-> create an outbreak, alert farmers in that tehsil (voice inbox) and dealers in and around it (stock these products)."""
import json
import time
from datetime import timedelta

import httpx

from .. import config, state
from ..models import Dealer, DealerAlert, EventLog, Farmer, InboxItem, KBEntry, Outbreak, Query, now
from ..ws import hub
from . import cache, tts

TEHSILS: dict = json.loads((config.BACKEND / "data" / "tehsils.json").read_text("utf-8"))

# Generic input categories per problem. NO brand names, NO doses: a real agronomist must confirm before use.
STOCK_MAP: dict[str, list[dict]] = {
    "wheat_yellow_rust": [
        {"item": "Rust fungicide (category approved by Agriculture Dept.)", "ur": "کنگی کی پھپھوند کش دوا (محکمہ زراعت کی منظور شدہ قسم)"},
        {"item": "Knapsack sprayers & spare nozzles", "ur": "سپرے مشینیں اور نوزل"},
        {"item": "Gloves, masks (spray safety kit)", "ur": "دستانے اور ماسک"},
    ],
    "wheat_aphid": [
        {"item": "Aphid insecticide (approved category)", "ur": "تیلے کی دوا (منظور شدہ قسم)"},
        {"item": "Spray safety kit", "ur": "دستانے اور ماسک"},
    ],
    "cotton_whitefly": [
        {"item": "Whitefly insecticide (approved category)", "ur": "سفید مکھی کی دوا (منظور شدہ قسم)"},
        {"item": "Yellow sticky traps", "ur": "پیلے چپکنے والے کارڈ"},
        {"item": "Spray safety kit", "ur": "دستانے اور ماسک"},
    ],
    "cotton_pink_bollworm": [
        {"item": "Pheromone traps (PB rope / traps)", "ur": "فیرومون ٹریپ"},
        {"item": "Bollworm insecticide (approved category)", "ur": "سنڈی کی دوا (منظور شدہ قسم)"},
    ],
    "maize_fall_armyworm": [
        {"item": "Armyworm insecticide (approved category)", "ur": "لشکری سنڈی کی دوا (منظور شدہ قسم)"},
        {"item": "Pheromone traps", "ur": "فیرومون ٹریپ"},
    ],
}
DEFAULT_STOCK = [{"item": "Inputs to be specified by agronomist", "ur": "ماہر کی ہدایت کے مطابق سامان"},
                 {"item": "Spray safety kit", "ur": "دستانے اور ماسک"}]


def window_start():
    return now() - timedelta(days=config.OUTBREAK_WINDOW_DAYS)


def count_cases(db, tehsil: str, tag: str, exclude_farmer: int | None = None) -> int:
    q = db.query(Query.farmer_id).filter(Query.tehsil == tehsil, Query.disease_tag == tag,
                                         Query.created_at >= window_start())
    if exclude_farmer is not None:
        q = q.filter(Query.farmer_id != exclude_farmer)
    return q.distinct().count()


def weather(tehsil: str) -> dict:
    t = TEHSILS.get(tehsil)
    if not t:
        return {}
    k = cache.key("weather", tehsil, now().strftime("%Y-%m-%d"))
    hit = cache.get(k)
    if hit:
        return hit
    if state.is_offline():
        return {}
    t0 = time.time()
    try:
        r = httpx.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": t["lat"], "longitude": t["lon"],
            "current": "temperature_2m,relative_humidity_2m,precipitation",
            "daily": "precipitation_probability_max", "forecast_days": 2, "timezone": "Asia/Karachi"}, timeout=5)
        r.raise_for_status()
        c = r.json()["current"]
        rain = r.json().get("daily", {}).get("precipitation_probability_max") or [0]
        w = {"temp_c": c["temperature_2m"], "humidity": c["relative_humidity_2m"], "rain_mm": c["precipitation"],
             "rain_chance": max(x or 0 for x in rain)}
        cache.put(k, w)
        state.mark("weather", True, "open-meteo", int((time.time() - t0) * 1000))
        return w
    except Exception as e:  # noqa: BLE001
        state.mark("weather", False, str(e))
        return {}


def weather_advice(w: dict) -> str:
    """One spoken Urdu sentence that makes the advice weather-aware (rules, not the LLM)."""
    if not w:
        return ""
    if w.get("rain_chance", 0) >= 50 or w.get("rain_mm", 0) > 0.5:
        return f"موسم: اگلے ایک دو دن آپ کے علاقے میں بارش کا امکان {w.get('rain_chance', 0)} فیصد ہے، اس لیے ابھی سپرے نہ کریں، بارش کے بعد کریں۔"
    if w.get("humidity", 0) >= 75:
        return f"موسم: آپ کے علاقے میں نمی {w['humidity']} فیصد ہے، ایسے موسم میں بیماریاں تیزی سے پھیلتی ہیں، کھیت روزانہ دیکھیں۔"
    if w.get("temp_c", 0) >= 36:
        return f"موسم: گرمی {round(w['temp_c'])} ڈگری ہے، سپرے صرف صبح سویرے یا شام کو کریں۔"
    return f"موسم: آج آپ کے علاقے میں موسم صاف ہے، درجہ حرارت {round(w.get('temp_c', 0))} ڈگری ہے۔ سپرے کرنا ہو تو ہوا کم ہونے پر صبح یا شام کریں۔"


def disease_name_ur(db, tag: str) -> str:
    e = db.query(KBEntry).filter(KBEntry.disease_tag == tag).first()
    return e.title_ur if e else tag


def check(db, query: Query) -> Outbreak | None:
    """Call after a query with a disease_tag is saved. Returns the (new or updated) outbreak, if any."""
    tag, tehsil = query.disease_tag, query.tehsil
    if not tag or tag == "unknown":
        return None
    n = count_cases(db, tehsil, tag)
    hub.publish("outbreak", "case_count", {"tehsil": tehsil, "disease_tag": tag, "count": n,
                                           "threshold": config.OUTBREAK_MIN_CASES})
    if n < config.OUTBREAK_MIN_CASES:
        return None

    ob = db.query(Outbreak).filter(Outbreak.tehsil == tehsil, Outbreak.disease_tag == tag,
                                   Outbreak.status == "active").first()
    if ob:  # already active: just update demand
        ob.case_count = n
        for a in db.query(DealerAlert).filter(DealerAlert.outbreak_id == ob.id):
            a.demand_count = n
        db.commit()
        hub.publish("dealer", "outbreak_update", {"outbreak_id": ob.id, "count": n})
        return ob

    ob = Outbreak(tehsil=tehsil, crop=query.crop, disease_tag=tag, case_count=n, weather=weather(tehsil))
    db.add(ob)
    db.flush()
    name_ur = disease_name_ur(db, tag)
    t_ur = TEHSILS.get(tehsil, {}).get("ur", tehsil)
    products = STOCK_MAP.get(tag, DEFAULT_STOCK)

    # Dealers in the tehsil and its neighbours
    area = [tehsil] + TEHSILS.get(tehsil, {}).get("neighbors", [])
    for d in db.query(Dealer).filter(Dealer.tehsil.in_(area)):
        db.add(DealerAlert(dealer_id=d.id, outbreak_id=ob.id, products=products, demand_count=n,
                           distance_note="same tehsil" if d.tehsil == tehsil else f"near {tehsil}"))

    # Farmers in the tehsil: voice alert in their inbox (+ MOCK SMS log)
    alert_text = (f"خبردار! آپ کی تحصیل {t_ur} میں {name_ur} کے کئی کیس سامنے آئے ہیں۔ "
                  f"اپنے کھیت کو روزانہ دیکھیں۔ نشانیاں نظر آئیں تو آواز ساتھی پر فون کریں۔ "
                  f"کوئی بھی سپرے ماہر یا محکمہ زراعت کے مشورے کے بغیر نہ کریں۔")
    audio = tts.speak(alert_text)
    farmers = db.query(Farmer).filter(Farmer.tehsil == tehsil).all()
    for f in farmers:
        db.add(InboxItem(farmer_id=f.id, kind="outbreak_alert", title_ur=f"وبا کی اطلاع: {name_ur}",
                         text_ur=alert_text, audio_url=audio))
    db.add(EventLog(kind="outbreak", message=f"OUTBREAK {tag} in {tehsil}: {n} farmers in {config.OUTBREAK_WINDOW_DAYS} days. "
                                               f"Alerted {len(farmers)} farmers, dealers in {', '.join(area)}"))
    db.add(EventLog(kind="sms_mock", message=f"[MOCK SMS] outbreak alert queued to {len(farmers)} farmers in {tehsil}"))
    db.commit()

    payload = {"outbreak_id": ob.id, "tehsil": tehsil, "tehsil_ur": t_ur, "disease_tag": tag, "name_ur": name_ur,
               "count": n, "products": products, "area": area, "weather": ob.weather}
    hub.publish("dealer", "outbreak", payload)
    hub.publish("outbreak", "outbreak", payload)
    hub.publish("admin", "outbreak", payload)
    for f in farmers:
        hub.publish(f"farmer:{f.id}", "inbox", {"kind": "outbreak_alert"})
    return ob
