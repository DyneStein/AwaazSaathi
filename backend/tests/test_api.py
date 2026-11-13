"""End-to-end API tests: every door of the system, driven the way the apps drive it. Runs offline, rules only."""
import io

from app import config, prompts, seed

APHID = prompts.CANNED["common_aphid"]["transcript"]
RED_ROT = prompts.CANNED["hard_redrot"]["transcript"]
DOSE = prompts.CANNED["dose_whitefly"]["transcript"]
JUNIOR, SENIOR, VERIFIED, UNVERIFIED = 5, 1, 3, 7   # Hamza Tariq, Dr. Ayesha Malik, Sana Javed, Usman Ali


def start(c, persona=25, lang="pa"):
    r = c.post("/api/call/start", json={"phone": seed.demo_phone(persona), "language": lang})
    assert r.status_code == 200
    return r.json()


def ask(c, call_id, text, crop="wheat", **extra):
    r = c.post(f"/api/call/{call_id}/ask", data={"crop": crop, "duration": "under_3_days", "transcript": text, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def escalate_red_rot(c):
    call = start(c, 13)
    return ask(c, call["call_id"], RED_ROT, crop="sugarcane")["query"]["id"]


# ---------- basics ----------
def test_health_and_spa(client):
    assert client.get("/api/health").json() == {"ok": True, "app": "awaazsaathi"}
    assert client.get("/api/status").json() == {"offline": True}


def test_prompts_both_languages_have_the_same_keys(client):
    ur, pa = client.get("/api/prompts?lang=ur").json(), client.get("/api/prompts?lang=pa").json()
    assert set(ur) == set(pa)
    for key in ("welcome", "ai_notice", "crop", "duration", "ask", "escalated", "emergency", "more", "consent"):
        assert ur[key]["text"] and pa[key]["text"]
    assert ur["welcome"]["text"] != pa["welcome"]["text"]


def test_personas_and_canned_questions(client):
    m = client.get("/api/demo/personas").json()
    assert len(m["personas"]) == len(seed.FARMER_TEHSILS) == 54 and m["crops"]["1"] == "wheat" and "common_aphid" in m["canned"]


# ---------- farmer call ----------
def test_known_caller_gets_their_tehsil_and_only_a_hash_is_stored(client):
    call = start(client, 25)
    assert call["known"] is True and call["tehsil"] == "Faisalabad"
    from app.db import SessionLocal
    from app.models import Farmer
    db = SessionLocal()
    f = db.get(Farmer, call["farmer_id"])
    assert len(f.phone_hash) == 64 and seed.demo_phone(25) not in f.phone_hash
    assert not any("phone" in col.name and col.name != "phone_hash" for col in Farmer.__table__.columns)
    db.close()


def test_unknown_caller_is_registered_and_can_set_tehsil_and_language(client):
    call = start(client, 999)
    assert call["known"] is False
    assert client.post(f"/api/call/{call['call_id']}/tehsil", json={"tehsil": "Multan"}).status_code == 200
    assert client.post(f"/api/call/{call['call_id']}/tehsil", json={"tehsil": "Nowhere"}).status_code == 404
    assert client.post(f"/api/call/{call['call_id']}/language", json={"language": "ur"}).status_code == 200
    assert client.get(f"/api/farmer/lookup?phone={seed.demo_phone(999)}").json()["tehsil"] == "Multan"


def test_common_question_is_answered_from_the_knowledge_base_word_for_word(client):
    call = start(client)
    r = ask(client, call["call_id"], APHID)
    q = r["query"]
    assert r["escalated"] is False and q["status"] == "answered_ai" and q["reasons"] == []
    assert q["disease_tag"] == "wheat_aphid" and q["retrieval_score"] >= config.RETRIEVAL_MIN
    assert q["grounding"] == 1.0
    ev = q["understanding"]["evidence"]
    assert ev["verbatim"] is True and len(ev["terms"]) >= 3
    top = q["retrieved"][0]
    assert q["ai_answer"] == top["answer_ur"] and r["answer_text"].startswith(top["answer_ur"])
    parts = q["understanding"]["answer_parts"]
    assert parts[0]["from"] == "knowledge" and parts[0]["kb_id"] == top["kb_id"]
    assert all(p["from"] in ("knowledge", "weather_rule") for p in parts)


def test_question_outside_the_knowledge_base_goes_to_a_human(client):
    call = start(client, 13)
    r = ask(client, call["call_id"], RED_ROT, crop="sugarcane")
    assert r["escalated"] is True and r["query"]["status"] == "queued" and r["query"]["route"] == "junior"
    assert r["query"]["reasons"][0].startswith("low_retrieval")
    assert r["answer_text"] == prompts.prompts_for("pa")["escalated"]
    assert not r["query"]["final_answer"]


def test_dose_question_is_senior_only(client):
    call = start(client, 18)
    q = ask(client, call["call_id"], DOSE, crop="cotton")["query"]
    assert q["route"] == "senior_only" and q["priority"] == 2
    assert any(x.startswith("dose_question") for x in q["reasons"])


def test_banned_chemical_is_senior_only(client):
    q = ask(client, start(client)["call_id"], "گندم کے تیلے پر اینڈوسلفان سپرے کر دوں؟")["query"]
    assert q["route"] == "senior_only" and any(x.startswith("banned_chemical") for x in q["reasons"])


def test_health_emergency_gets_the_hospital_message_and_top_priority(client):
    call = start(client, 18, "ur")
    r = ask(client, call["call_id"], "سپرے کرنے کے بعد میرے بیٹے کو چکر آ رہے ہیں اور الٹی ہو رہی ہے", crop="cotton")
    assert r["escalated"] and r["query"]["priority"] == 3 and r["query"]["route"] == "senior_only"
    assert r["answer_text"] == prompts.PROMPTS["emergency"]


def test_symptoms_of_another_crop_are_not_answered(client):
    q = ask(client, start(client)["call_id"], "ٹینڈوں کے اندر گلابی سنڈی ہے اور روئی داغدار ہو گئی ہے", crop="maize")["query"]
    assert q["status"] == "queued" and any(x.startswith("crop_mismatch") for x in q["reasons"])


def test_vague_question_is_not_answered(client):
    q = ask(client, start(client)["call_id"], "گندم کے پتے پیلے ہو رہے ہیں")["query"]
    assert q["status"] == "queued"


def test_bad_requests(client):
    call = start(client)
    assert client.post(f"/api/call/{call['call_id']}/ask", data={"crop": "wheat", "transcript": "  "}).status_code == 400
    assert client.post("/api/call/99999/ask", data={"transcript": APHID}).status_code == 404
    assert client.post("/api/call/99999/consent", json={"keep": True}).status_code == 404
    assert client.post("/api/query/99999/to-expert").status_code == 404


def test_recording_is_deleted_unless_the_farmer_agrees(client):
    for keep in (False, True):
        call = start(client)
        r = client.post(f"/api/call/{call['call_id']}/ask", data={"crop": "wheat", "transcript": APHID},
                        files={"audio": ("q.webm", io.BytesIO(b"x" * 4000), "audio/webm")}).json()
        held = list(config.UPLOAD_DIR.glob(f"call{call['call_id']}_*"))
        assert len(held) == 1 and r["query"]["audio_url"].startswith("/uploads/")
        out = client.post(f"/api/call/{call['call_id']}/consent", json={"keep": keep}).json()
        assert not list(config.UPLOAD_DIR.glob(f"call{call['call_id']}_*"))
        kept = list(config.RECORDING_DIR.glob(f"call{call['call_id']}_*"))
        url = client.get(f"/api/expert/query/{r['query']['id']}").json()["audio_url"]
        if keep:
            assert out["kept"] == 1 and len(kept) == 1 and url.startswith("/recordings/")
        else:
            assert out["deleted"] == 1 and not kept and url is None


def test_unreadable_recording_asks_for_text_instead_of_guessing(client):
    call = start(client)
    r = client.post(f"/api/call/{call['call_id']}/ask", data={"crop": "wheat"},
                    files={"audio": ("q.webm", io.BytesIO(b"x" * 4000), "audio/webm")}).json()
    assert r["needs_text"] is True


def test_photo_door_with_a_typed_question(client):
    call = start(client)
    r = client.post(f"/api/call/{call['call_id']}/photo", data={"crop": "wheat", "category": "pest", "transcript": APHID},
                    files={"image": ("leaf.jpg", io.BytesIO(b"\xff\xd8\xff" + b"0" * 500), "image/jpeg")}).json()
    assert r["query"]["channel"] == "photo" and r["query"]["photo_url"].startswith("/uploads/photo")
    assert r["query"]["status"] == "answered_ai"
    no_text = client.post(f"/api/call/{call['call_id']}/photo", data={"crop": "wheat"},
                          files={"image": ("leaf.jpg", io.BytesIO(b"\xff\xd8\xff"), "image/jpeg")}).json()
    assert no_text["needs_text"] is True


def test_farmer_can_always_ask_for_a_human(client):
    call = start(client)
    qid = ask(client, call["call_id"], APHID)["query"]["id"]
    assert client.post(f"/api/query/{qid}/to-expert").json()["status"] == "queued"
    q = client.get(f"/api/expert/query/{qid}").json()
    assert "farmer_requested_expert" in q["reasons"] and q["understanding"]["previous_answer"]


def test_language_model_cannot_set_the_problem_tag_alone(client):
    from app.pipeline import router
    tags = ["wheat_aphid", "wheat_brown_rust", "cotton_whitefly"]
    confident = router.assess(transcript=APHID, crop="wheat", tags=tags, und={"disease_tag": "wheat_brown_rust"})
    assert confident.tag == "wheat_aphid"                      # the source of the answer wins over the model's guess
    unsupported = router.assess(transcript="میری فصل خراب ہو رہی ہے", crop="wheat", tags=tags, und={"disease_tag": "cotton_whitefly"})
    assert unsupported.tag is None and unsupported.decision.escalate


# ---------- experts ----------
def test_junior_drafts_senior_edits_and_the_farmer_is_called_back(client):
    qid = escalate_red_rot(client)
    queue = client.get(f"/api/expert/queue?expert_id={JUNIOR}").json()
    mine = next(x for x in queue if x["id"] == qid)
    assert mine["can_draft"] is True and mine["can_finalize"] is False

    d = client.post(f"/api/expert/query/{qid}/draft", json={"expert_id": JUNIOR, "text": "یہ کماد کا رتا روگ لگتا ہے۔ متاثرہ گنے نکال کر تلف کریں۔"}).json()
    assert d["status"] == "drafted"
    # only a senior may review
    assert client.post(f"/api/expert/query/{qid}/review", json={"reviewer_id": VERIFIED, "action": "approve"}).status_code == 403
    # a rejection needs a reason
    assert client.post(f"/api/expert/query/{qid}/review", json={"reviewer_id": SENIOR, "action": "reject"}).status_code == 400

    final = "یہ کماد کا رتا روگ (ریڈ راٹ) لگتا ہے۔ متاثرہ گنے نکال کر تلف کریں۔"
    rv = client.post(f"/api/expert/query/{qid}/review", json={"reviewer_id": SENIOR, "action": "edit_approve", "final_text": final}).json()
    assert rv["status"] == "approved" and rv["outcome"] == "clean"
    q = client.get(f"/api/expert/query/{qid}").json()
    assert q["final_answer"] == final and q["answered_by"] == "Dr. Ayesha Malik"
    assert q["reviews"][-1]["action"] == "edit_approve" and 0 < q["reviews"][-1]["edit_ratio"] < config.MAJOR_EDIT_RATIO
    inbox = client.get(f"/api/farmer/{q['farmer_id']}/inbox").json()
    assert inbox[0]["kind"] == "callback" and inbox[0]["text_ur"] == final and inbox[0]["channel"] == "voice"
    assert client.post(f"/api/inbox/{inbox[0]['id']}/heard").json()["ok"]
    assert client.get(f"/api/farmer/{q['farmer_id']}/inbox").json()[0]["heard"] is True
    # cannot be reviewed twice
    assert client.post(f"/api/expert/query/{qid}/review", json={"reviewer_id": SENIOR, "action": "approve"}).status_code == 409


def test_clean_approval_promotes_the_junior(client):
    before = client.get(f"/api/expert/{JUNIOR}/profile").json()
    assert before["level"] == "junior" and before["reviewed_count"] == 19
    qid = escalate_red_rot(client)
    client.post(f"/api/expert/query/{qid}/draft", json={"expert_id": JUNIOR, "text": "متاثرہ گنے نکال کر تلف کریں۔"})
    rv = client.post(f"/api/expert/query/{qid}/review", json={"reviewer_id": SENIOR, "action": "approve"}).json()
    assert rv["promoted_to"] == "verified"
    after = client.get(f"/api/expert/{JUNIOR}/profile").json()
    assert after["level"] == "verified" and after["reviewed_count"] == 20 and after["earnings_pkr"] > before["earnings_pkr"]


def test_rejection_returns_the_question_to_the_queue_and_lowers_the_score(client):
    qid = escalate_red_rot(client)
    before = client.get(f"/api/expert/{JUNIOR}/profile").json()
    client.post(f"/api/expert/query/{qid}/draft", json={"expert_id": JUNIOR, "text": "کچھ نہ کریں"})
    rv = client.post(f"/api/expert/query/{qid}/review", json={"reviewer_id": SENIOR, "action": "reject", "reason": "Too vague"}).json()
    assert rv["status"] == "queued" and rv["outcome"] == "rejected"
    after = client.get(f"/api/expert/{JUNIOR}/profile").json()
    assert after["score"] < before["score"] and after["rejected_count"] == before["rejected_count"] + 1


def test_who_may_answer_what(client):
    dose_q = ask(client, start(client, 18)["call_id"], DOSE, crop="cotton")["query"]["id"]
    body = {"text": "ماہر سے پوچھیں"}
    assert client.post(f"/api/expert/query/{dose_q}/draft", json={**body, "expert_id": JUNIOR}).status_code == 403
    assert client.post(f"/api/expert/query/{dose_q}/draft", json={**body, "expert_id": VERIFIED}).status_code == 403
    assert client.post(f"/api/expert/query/{dose_q}/draft", json={**body, "expert_id": UNVERIFIED}).status_code == 403
    assert client.post(f"/api/expert/query/{dose_q}/draft", json={"text": " ", "expert_id": SENIOR}).status_code == 400
    assert client.post(f"/api/expert/query/{dose_q}/draft", json={**body, "expert_id": SENIOR}).json()["status"] == "approved"
    assert client.post(f"/api/expert/query/{dose_q}/draft", json={**body, "expert_id": SENIOR}).status_code == 409


def test_promoted_answer_teaches_the_ai(client):
    qid = escalate_red_rot(client)
    final = "یہ کماد کا رتا روگ لگتا ہے۔ متاثرہ گنے جڑ سمیت نکال کر کھیت سے باہر تلف کریں۔"
    client.post(f"/api/expert/query/{qid}/draft", json={"expert_id": SENIOR, "text": final})
    assert client.post(f"/api/expert/query/{qid}/promote", json={"reviewer_id": VERIFIED}).status_code == 403
    kb_before = len(client.get("/api/expert/kb").json())
    kb_id = client.post(f"/api/expert/query/{qid}/promote", json={"reviewer_id": SENIOR}).json()["kb_id"]
    assert client.post(f"/api/expert/query/{qid}/promote", json={"reviewer_id": SENIOR}).json()["kb_id"] == kb_id
    kb = client.get("/api/expert/kb").json()
    assert len(kb) == kb_before + 1 and kb[0]["source"] == "promoted" and kb[0]["reviewed_by"] == "Dr. Ayesha Malik"
    # the next farmer with the same problem gets the expert's words from the AI, instantly
    r = ask(client, start(client, 14)["call_id"], RED_ROT, crop="sugarcane")
    assert r["escalated"] is False and r["query"]["ai_answer"] == final
    assert r["query"]["understanding"]["evidence"]["source"] == "promoted"


def test_only_approved_answers_can_be_promoted(client):
    qid = escalate_red_rot(client)
    assert client.post(f"/api/expert/query/{qid}/promote", json={"reviewer_id": SENIOR}).status_code == 409


def test_knowledge_base_browse_search_and_sign_off(client):
    kb = client.get("/api/expert/kb").json()
    assert len(kb) == 18 and all(k["needs_expert_review"] for k in kb)
    assert {k["crop"] for k in client.get("/api/expert/kb?crop=rice").json()} == {"rice"}
    hits = client.get("/api/expert/kb", params={"q": "سفید مکھی"}).json()
    assert hits[0]["disease_tag"] == "cotton_whitefly" and len(hits) < 18          # best match first
    assert client.get("/api/expert/kb", params={"q": "safed makhi"}).json()[0]["disease_tag"] == "cotton_whitefly"
    one = kb[0]["id"]
    assert client.post(f"/api/expert/kb/{one}/sign-off", json={"reviewer_id": JUNIOR}).status_code == 403
    assert client.post(f"/api/expert/kb/{one}/sign-off", json={"reviewer_id": SENIOR}).json()["reviewed_by"] == "Dr. Ayesha Malik"
    signed = next(k for k in client.get("/api/expert/kb").json() if k["id"] == one)
    assert signed["needs_expert_review"] is False and signed["reviewed_at"]


def test_degree_upload_and_admin_verification(client):
    up = client.post(f"/api/expert/{UNVERIFIED}/degree", files={"file": ("degree.pdf", io.BytesIO(b"%PDF"), "application/pdf")}).json()
    assert up["verification_status"] == "pending"
    assert client.post(f"/api/admin/experts/{UNVERIFIED}/verify?approve=true").json()["status"] == "verified"
    qid = escalate_red_rot(client)
    assert client.post(f"/api/expert/query/{qid}/draft", json={"expert_id": UNVERIFIED, "text": "جواب"}).json()["status"] == "drafted"


def test_sla_breach_reassigns_to_another_senior(client):
    qid = escalate_red_rot(client)
    for _ in range(3):
        n = client.post("/api/admin/sla-fast-forward").json()["escalated"]
    q = client.get(f"/api/expert/query/{qid}").json()
    assert n >= 1 and q["escalation_count"] >= 1 and q["assigned_expert_id"] in (1, 2) and q["priority"] >= 2


# ---------- outbreak and dealers ----------
def fire_outbreak(c):
    for key in ("rust_okara_2", "rust_okara_3"):
        assert c.post(f"/api/admin/canned/{key}").status_code == 200


def test_third_case_in_a_tehsil_triggers_the_outbreak(client):
    counters = lambda: {(x["tehsil"], x["disease_tag"]): x for x in client.get("/api/admin/outbreak-counters").json()}  # noqa: E731
    assert counters()[("Okara", "wheat_yellow_rust")]["count"] == 1
    client.post("/api/admin/canned/rust_okara_2")
    two = counters()[("Okara", "wheat_yellow_rust")]
    assert two["count"] == 2 and two["active"] is False
    third = client.post("/api/admin/canned/rust_okara_3").json()
    assert any(x.startswith("suspected_outbreak") for x in third["reasons"])
    three = counters()[("Okara", "wheat_yellow_rust")]
    assert three["count"] == 3 and three["active"] is True
    # the same farmer asking twice must not count twice
    client.post("/api/admin/canned/rust_okara_3")
    assert counters()[("Okara", "wheat_yellow_rust")]["count"] == 3


def test_outbreak_alerts_farmers_and_nearby_dealers_only(client):
    fire_outbreak(client)
    okara, depalpur, multan = (client.get(f"/api/dealer/{i}/alerts").json() for i in (1, 3, 5))
    assert len(okara) == 1 and okara[0]["distance_note"] == "same tehsil" and okara[0]["count"] == 3
    assert len(depalpur) == 1 and depalpur[0]["distance_note"] == "near Okara"
    assert multan == []
    for p in okara[0]["products"]:   # categories only: never a dose
        assert not any(w in p["item"].lower() for w in (" ml", "gram", "per acre", "litre"))
    okara_farmer = client.get(f"/api/farmer/lookup?phone={seed.demo_phone(4)}").json()["farmer_id"]
    multan_farmer = client.get(f"/api/farmer/lookup?phone={seed.demo_phone(18)}").json()["farmer_id"]
    assert client.get(f"/api/farmer/{okara_farmer}/inbox").json()[0]["kind"] == "outbreak_alert"
    assert not any(i["kind"] == "outbreak_alert" for i in client.get(f"/api/farmer/{multan_farmer}/inbox").json())


def test_dealer_login_checklist_and_confirm(client):
    assert client.post("/api/dealer/login", json={"dealer_id": 1, "pin": "0000"}).status_code == 401
    me = client.post("/api/dealer/login", json={"dealer_id": 1, "pin": "1111"}).json()
    assert me["shop"] == "Aslam Zarai Markaz" and me["tehsil"] == "Okara"
    assert "pin" not in me
    fire_outbreak(client)
    a = client.get("/api/dealer/1/alerts").json()[0]
    assert a["confirmed_at"] is None
    ticked = client.post(f"/api/dealer/alerts/{a['id']}/item", json={"index": 0, "ready": True}).json()["products"]
    assert ticked[0]["ready"] is True and not ticked[1].get("ready")
    assert client.post(f"/api/dealer/alerts/{a['id']}/item", json={"index": 99, "ready": True}).status_code == 404
    assert client.post(f"/api/dealer/alerts/{a['id']}/confirm").json()["confirmed_at"]
    again = client.get("/api/dealer/1/alerts").json()[0]
    assert again["confirmed_at"] and again["products"][0]["ready"] is True
    assert client.post("/api/dealer/alerts/999/confirm").status_code == 404


def test_dealer_overview_and_demand(client):
    o = client.get("/api/dealer/1/overview").json()
    assert o["tehsil"] == "Okara" and "Depalpur" in o["area"] and o["farmers_in_area"] >= 6 and o["active_outbreaks"] == 0
    fire_outbreak(client)
    assert client.get("/api/dealer/1/overview").json()["active_outbreaks"] == 1
    top = client.get("/api/dealer/demand").json()[0]
    assert top["tehsil"] == "Okara" and top["disease_tag"] == "wheat_yellow_rust" and top["count"] == 3
    assert client.get("/api/dealer/99/overview").status_code == 404


# ---------- follow-up ----------
def test_three_day_follow_up_reopens_the_question(client):
    call = start(client)
    qid = ask(client, call["call_id"], APHID)["query"]["id"]
    n = client.post("/api/admin/followups").json()["count"]
    assert n >= 1
    item = client.get(f"/api/farmer/{call['farmer_id']}/inbox").json()[0]
    assert item["kind"] == "followup" and item["query_id"] == qid
    assert client.post(f"/api/query/{qid}/to-expert?source=followup").json()["status"] == "queued"
    q = client.get(f"/api/expert/query/{qid}").json()
    assert "followup_still_a_problem" in q["reasons"] and q["priority"] >= 2 and q["understanding"]["previous_answer"]
    assert any(x["id"] == qid for x in client.get(f"/api/expert/queue?expert_id={SENIOR}").json())


# ---------- operator ----------
def test_reset_restores_the_seed(client):
    escalate_red_rot(client)
    fire_outbreak(client)
    assert client.post("/api/admin/reset").json()["ok"]
    h = client.get("/api/admin/health").json()
    assert h["counts"]["outbreaks"] == 0 and h["counts"]["queued"] == 2 and h["counts"]["kb"] == 18
    assert client.get("/api/dealer/1/alerts").json() == []


def test_thresholds_change_the_decision_live(client):
    call = start(client)
    assert ask(client, call["call_id"], APHID)["escalated"] is False
    client.post("/api/admin/thresholds", json={"retrieval_min": 0.8})
    assert ask(client, call["call_id"], APHID)["escalated"] is True


def test_offline_switch_and_event_log(client):
    assert client.post("/api/admin/offline", json={"on": False}).json() == {"offline": False}
    assert client.post("/api/admin/offline", json={"on": True}).json() == {"offline": True}
    escalate_red_rot(client)
    assert any("ESCALATED" in e["message"] for e in client.get("/api/admin/events").json())
    assert client.post("/api/admin/canned/nope").status_code == 404


def test_safety_evaluation_has_no_unsafe_answers(client):
    r = client.get("/api/admin/evaluation").json()
    bad = [x for x in r["rows"] if x["verdict"] in ("unsafe_answer", "wrong_source")]
    assert r["total"] >= 50 and not bad, bad
    assert r["unsafe"] == 0 and r["accuracy"] >= 0.9
    assert r["answered_correctly"] / r["answer_cases"] >= 0.85


# ---------- live updates ----------
def test_websocket_relays_video_call_signalling_only(client):
    with client.websocket_connect("/ws?topics=farmer:1") as farmer, client.websocket_connect("/ws?topics=rtc:expert:1") as expert:
        expert.send_json({"to": "farmer:1", "event": "chat", "data": {"x": 1}})          # not rtc_*: dropped
        expert.send_json({"to": "farmer:1", "event": "rtc_offer", "data": {"sdp": "abc"}})
        got = farmer.receive_json()
        assert got["event"] == "rtc_offer" and got["data"] == {"sdp": "abc"} and got["topic"] == "farmer:1"


def test_websocket_pushes_new_questions_to_experts(client):
    with client.websocket_connect("/ws?topics=expert") as ws:
        qid = escalate_red_rot(client)
        got = ws.receive_json()
        assert got["event"] == "new_query" and got["data"]["id"] == qid


def test_reset_never_leaves_the_database_without_tables(client):
    """Pages poll the server every few seconds; a reset in the middle must not make those requests fail."""
    import threading
    errors, stop = [], threading.Event()

    def poll():
        while not stop.is_set():
            for path in ("/api/admin/health", "/api/expert/list", "/api/dealer/demand"):
                r = client.get(path)
                if r.status_code != 200:
                    errors.append((path, r.status_code))

    t = threading.Thread(target=poll)
    t.start()
    try:
        for _ in range(5):
            assert client.post("/api/admin/reset").status_code == 200
    finally:
        stop.set()
        t.join()
    assert not errors, errors[:3]
    assert client.get("/api/admin/health").json()["counts"]["farmers"] == 54


def test_operations_map_counts_and_privacy(client):
    m = client.get("/api/admin/map").json()
    assert m["totals"]["farmers"] == 54 and len(m["tehsils"]) == 20
    assert sum(t["farmers"] for t in m["tehsils"]) == 54
    assert m["totals"]["questions"] == m["totals"]["ai"] + m["totals"]["expert"] + m["totals"]["waiting"]
    # Only tehsil centres are sent: no question or farmer carries its own coordinates.
    assert all("lat" not in q and "lon" not in q for q in m["questions"])
    week = client.get("/api/admin/map?days=7").json()
    assert week["totals"]["questions"] < m["totals"]["questions"]


def test_older_history_never_changes_outbreaks_or_dealer_demand(client):
    # A month of seeded history, but inside the 7-day window only the original demo cases count.
    counters = client.get("/api/admin/outbreak-counters").json()
    assert all(c["count"] < 3 and not c["active"] for c in counters)
    okara = [c for c in counters if c["tehsil"] == "Okara" and c["disease_tag"] == "wheat_yellow_rust"]
    assert okara and okara[0]["count"] == 1
    assert client.get("/api/admin/health").json()["counts"]["outbreaks"] == 0


def test_outbreak_shows_on_the_map(client):
    for k in ("rust_okara_2", "rust_okara_3"):
        client.post(f"/api/admin/canned/{k}")
    m = client.get("/api/admin/map").json()
    okara = next(t for t in m["tehsils"] if t["name"] == "Okara")
    assert okara["outbreak"]["disease_tag"] == "wheat_yellow_rust" and m["totals"]["outbreaks"] == 1
    assert {d["shop"] for d in m["dealers"] if d["alerted"]} >= {"Aslam Zarai Markaz"}


def test_internet_link_status_and_lan_info(client, monkeypatch):
    from app import tunnel
    monkeypatch.setattr(tunnel, "binary", lambda: None)
    assert client.get("/api/tunnel").json() == {"available": False, "running": False, "url": None, "error": None}
    r = client.post("/api/tunnel/start").json()
    assert r["running"] is False and "cloudflared" in r["error"]
    lan = client.get("/api/lan").json()
    assert lan["base"].startswith("http://") and lan["public"] is None
    (config.VAR / "public_url.txt").write_text("https://example.trycloudflare.com")
    assert client.get("/api/lan").json()["public"] == "https://example.trycloudflare.com"
    client.post("/api/tunnel/stop")
    assert client.get("/api/lan").json()["public"] is None


def test_spoken_crop_beats_a_keypad_slip(client):
    # Pressed 2 (cotton) but said "meri kanak..." (wheat): the farmer's words decide the crop.
    q = ask(client, start(client)["call_id"], "میری کنک دے پتیاں تے پیلیاں دھاریاں نیں تے ہتھ لاؤ تے پیلا پوڈر لگدا اے", crop="cotton")["query"]
    assert q["crop"] == "wheat" and q["understanding"]["crop_from_speech"] == {"keyed": "cotton", "spoken": "wheat"}
    from app.pipeline.router import spoken_crop
    assert spoken_crop("kapas par safed makhi") == "cotton" and spoken_crop("گندم اور کپاس دونوں") is None and spoken_crop("پتے پیلے ہیں") is None


def test_speech_cleanup_rules():
    from app.pipeline import stt
    assert stt.dedupe("تیلا لگ گیا ہے پتے چپے ہیں پتے چپے ہیں پتے چپے ہیں") == "تیلا لگ گیا ہے پتے چپے ہیں"
    assert stt.dedupe("چھوٹے چھوٹے سبز کیڑے") == "چھوٹے چھوٹے سبز کیڑے"        # doubled words are real Urdu
    assert stt.garbled("Mary, kanakðu pate píleni?") and not stt.garbled("meri kanak de pattay") and not stt.garbled("میری کنک")
    assert set(stt.PROMPT) == {"pa", "ur"}
