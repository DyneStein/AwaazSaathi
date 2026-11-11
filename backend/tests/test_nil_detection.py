from app.pipeline.nil_detection import decide, grounding_score

OK = dict(retrieval_score=0.6, grounding=0.9, top_senior_only=False, retrieval_min=0.3, grounding_min=0.6)


def test_confident_grounded_answer_goes_to_ai():
    d = decide(transcript="گندم کے پتوں پر سبز کیڑے ہیں", **OK)
    assert not d.escalate and d.route == "ai"


def test_low_retrieval_escalates_to_junior():
    d = decide(transcript="کماد اندر سے لال ہے", **{**OK, "retrieval_score": 0.2})
    assert d.escalate and d.route == "junior" and d.reasons[0].startswith("low_retrieval")


def test_not_grounded_escalates():
    d = decide(transcript="سوال", **{**OK, "grounding": 0.3})
    assert d.escalate and any(r.startswith("not_grounded") for r in d.reasons)


def test_dose_question_is_senior_only():
    d = decide(transcript="سفید مکھی کے لیے سپرے کتنی مقدار میں کروں؟", **OK)
    assert d.escalate and d.route == "senior_only"


def test_weak_dose_word_needs_chemical_context():
    # "since how many days" must NOT be treated as a dose question
    assert not decide(transcript="کتنے دن سے پتے پیلے ہیں", **OK).escalate
    assert decide(transcript="یوریا کتنی ڈالوں", **OK).route == "senior_only"
    assert decide(transcript="spray kitna karun", **OK).route == "senior_only"


def test_llm_dose_flag_also_counts():
    assert decide(transcript="x", llm_asks_dose=True, **OK).route == "senior_only"


def test_banned_chemical_is_senior_only():
    d = decide(transcript="کیا میں endosulfan ڈال سکتا ہوں", **OK)
    assert d.escalate and d.route == "senior_only" and any("banned" in r for r in d.reasons)


def test_suspected_outbreak_from_prior_cases_or_spread_words():
    assert decide(transcript="پیلی دھاریاں", prior_similar_cases=2, **OK).route == "senior_only"
    assert not decide(transcript="پیلی دھاریاں", prior_similar_cases=1, **OK).escalate
    assert decide(transcript="یہ بیماری پورے علاقے میں پھیل رہی ہے", **OK).route == "senior_only"


def test_senior_only_kb_topic():
    assert decide(transcript="x", **{**OK, "top_senior_only": True}).route == "senior_only"


def test_threshold_is_tunable():
    assert decide(transcript="x", **{**OK, "retrieval_score": 0.4, "retrieval_min": 0.5}).escalate
    assert not decide(transcript="x", **{**OK, "retrieval_score": 0.4, "retrieval_min": 0.3}).escalate


def test_grounding_score():
    src = ["متاثرہ کھیت کو روزانہ دیکھیں اور زیادہ پانی نہ دیں۔"]
    assert grounding_score("متاثرہ کھیت کو روزانہ دیکھیں۔", src) > 0.9
    assert grounding_score("فلاں کمپنی کی دوا دو سو گرام ڈالیں", src) < 0.5
    assert grounding_score("", src) == 0.0
