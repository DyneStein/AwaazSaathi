"""Dealer door: outbreak alerts, 'stock these products' cards, demand by tehsil, confirm stock."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func

from ..db import get_db
from ..models import Dealer, DealerAlert, EventLog, KBEntry, Outbreak, Query, now
from ..pipeline import outbreak
from ..ws import hub
from .common import iso

r = APIRouter(prefix="/api/dealer")


@r.get("/list")
def dealers(db=Depends(get_db)):
    return [{"id": d.id, "name": d.name, "shop": d.shop, "tehsil": d.tehsil} for d in db.query(Dealer).order_by(Dealer.id)]


class LoginIn(BaseModel):
    dealer_id: int
    pin: str


@r.post("/login")
def login(body: LoginIn, db=Depends(get_db)):
    d = db.get(Dealer, body.dealer_id)
    if not d or d.pin != body.pin.strip():
        raise HTTPException(401, "Wrong PIN")
    return {"id": d.id, "name": d.name, "shop": d.shop, "tehsil": d.tehsil,
            "tehsil_ur": outbreak.TEHSILS.get(d.tehsil, {}).get("ur", d.tehsil)}


@r.get("/{dealer_id}/alerts")
def alerts(dealer_id: int, db=Depends(get_db)):
    out = []
    for a in db.query(DealerAlert).filter(DealerAlert.dealer_id == dealer_id).order_by(DealerAlert.id.desc()):
        ob = db.get(Outbreak, a.outbreak_id)
        kb = db.query(KBEntry).filter(KBEntry.disease_tag == ob.disease_tag).first()
        out.append({"id": a.id, "outbreak_id": ob.id, "tehsil": ob.tehsil,
                    "tehsil_ur": outbreak.TEHSILS.get(ob.tehsil, {}).get("ur", ob.tehsil),
                    "disease_tag": ob.disease_tag, "name_ur": kb.title_ur if kb else ob.disease_tag,
                    "name_en": kb.title_en if kb else ob.disease_tag, "crop": ob.crop,
                    "count": ob.case_count, "products": a.products, "distance_note": a.distance_note,
                    "weather": ob.weather, "confirmed_at": iso(a.confirmed_at), "created_at": iso(a.created_at)})
    return out


@r.post("/alerts/{alert_id}/confirm")
def confirm(alert_id: int, db=Depends(get_db)):
    a = db.get(DealerAlert, alert_id)
    if not a:
        raise HTTPException(404)
    a.confirmed_at = now()
    d = db.get(Dealer, a.dealer_id)
    db.add(EventLog(kind="stock", message=f"{d.shop} ({d.tehsil}) confirmed stock for outbreak #{a.outbreak_id}"))
    db.commit()
    hub.publish("admin", "stock_confirmed", {"dealer": d.shop, "outbreak_id": a.outbreak_id})
    hub.publish("dealer", "stock_confirmed", {"dealer_id": d.id, "outbreak_id": a.outbreak_id})
    return {"ok": True, "confirmed_at": iso(a.confirmed_at)}


@r.get("/demand")
def demand(db=Depends(get_db)):
    """Farmer reports per tehsil x problem in the last 7 days (what dealers should expect)."""
    since = now() - timedelta(days=7)
    rows = (db.query(Query.tehsil, Query.disease_tag, func.count(func.distinct(Query.farmer_id)))
            .filter(Query.created_at >= since, Query.disease_tag.isnot(None))
            .group_by(Query.tehsil, Query.disease_tag).all())
    names = {k.disease_tag: (k.title_ur, k.title_en) for k in db.query(KBEntry)}
    out = [{"tehsil": t, "tehsil_ur": outbreak.TEHSILS.get(t, {}).get("ur", t), "disease_tag": tag,
            "name_ur": names.get(tag, (tag, tag))[0], "name_en": names.get(tag, (tag, tag))[1], "count": n}
           for t, tag, n in rows]
    return sorted(out, key=lambda x: -x["count"])
