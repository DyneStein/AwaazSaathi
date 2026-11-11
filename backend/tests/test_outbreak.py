from datetime import timedelta

from app import config, seed
from app.db import SessionLocal
from app.models import DealerAlert, Farmer, InboxItem, Outbreak, Query, now
from app.pipeline import outbreak


def _case(db, farmer, tag="wheat_yellow_rust", days_ago=0):
    q = Query(farmer_id=farmer.id, tehsil=farmer.tehsil, crop="wheat", disease_tag=tag, transcript="t",
              created_at=now() - timedelta(days=days_ago))
    db.add(q)
    db.commit()
    return q


def _fresh():
    seed.run()
    db = SessionLocal()
    db.query(Query).delete()
    db.commit()
    return db


def test_triggers_at_three_distinct_farmers_same_tehsil():
    db = _fresh()
    okara = db.query(Farmer).filter(Farmer.tehsil == "Okara").all()
    assert outbreak.check(db, _case(db, okara[0])) is None
    assert outbreak.check(db, _case(db, okara[1])) is None
    ob = outbreak.check(db, _case(db, okara[2]))
    assert ob is not None and ob.case_count == config.OUTBREAK_MIN_CASES
    # dealers in Okara + neighbours alerted, farmers of Okara get a voice alert
    assert db.query(DealerAlert).filter(DealerAlert.outbreak_id == ob.id).count() >= 3
    assert db.query(InboxItem).filter(InboxItem.kind == "outbreak_alert").count() == len(okara)


def test_same_farmer_repeating_does_not_trigger():
    db = _fresh()
    f = db.query(Farmer).filter(Farmer.tehsil == "Okara").first()
    for _ in range(4):
        assert outbreak.check(db, _case(db, f)) is None


def test_cases_outside_window_or_other_tehsil_do_not_count():
    db = _fresh()
    okara = db.query(Farmer).filter(Farmer.tehsil == "Okara").all()
    multan = db.query(Farmer).filter(Farmer.tehsil == "Multan").all()
    _case(db, okara[0], days_ago=config.OUTBREAK_WINDOW_DAYS + 1)   # too old
    _case(db, multan[0])                                             # other tehsil
    assert outbreak.check(db, _case(db, okara[1])) is None
    assert outbreak.check(db, _case(db, okara[2])) is None           # only 2 in window
    assert db.query(Outbreak).count() == 0


def test_different_disease_does_not_count():
    db = _fresh()
    okara = db.query(Farmer).filter(Farmer.tehsil == "Okara").all()
    _case(db, okara[0], tag="wheat_aphid")
    _case(db, okara[1], tag="wheat_aphid")
    assert outbreak.check(db, _case(db, okara[2])) is None


def test_existing_outbreak_updates_instead_of_duplicating():
    db = _fresh()
    okara = db.query(Farmer).filter(Farmer.tehsil == "Okara").all()
    for f in okara[:3]:
        outbreak.check(db, _case(db, f))
    outbreak.check(db, _case(db, okara[3]))
    assert db.query(Outbreak).count() == 1 and db.query(Outbreak).first().case_count == 4
