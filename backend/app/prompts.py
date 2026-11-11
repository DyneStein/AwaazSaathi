"""Fixed IVR prompts (Urdu with Punjabi-friendly words). Pre-generated to mp3 by scripts/warm_cache.py."""
PROMPTS = {
    "welcome": "السلام علیکم! آواز ساتھی میں خوش آمدید۔ پنجابی کے لیے ایک دبائیں۔ اردو کے لیے دو دبائیں۔",
    "ai_notice": "آپ ایک کمپیوٹر یعنی اے آئی سے بات کر رہے ہیں، انسان سے نہیں۔ اگر سوال مشکل ہوا تو ہمارا زرعی ماہر آپ کو خود فون کرے گا۔",
    "crop": "آپ کی فصل کون سی ہے؟ گندم کے لیے ایک، کپاس کے لیے دو، مونجی کے لیے تین، کماد کے لیے چار، اور مکئی کے لیے پانچ دبائیں۔",
    "duration": "یہ مسئلہ کب سے ہے؟ تین دن سے کم ہو تو ایک، ایک ہفتے کے قریب ہو تو دو، اس سے زیادہ ہو تو تین دبائیں۔",
    "tehsil_confirm": "ہمارے ریکارڈ میں آپ کی تحصیل اسکرین پر لکھی ہے۔ درست ہے تو ایک دبائیں، ورنہ دو دبائیں۔",
    "tehsil_pick": "اپنی تحصیل کا نمبر دبائیں۔",
    "ask": "اب بیپ کے بعد اپنا مسئلہ آسان الفاظ میں بتائیں۔ پتوں، تنے یا بالیوں پر کیا نظر آ رہا ہے؟ بات ختم ہو تو بٹن دبائیں۔",
    "thinking": "شکریہ۔ آپ کا سوال سمجھ رہے ہیں، تھوڑا انتظار کریں۔",
    "escalated": "یہ سوال ہم نے اپنے زرعی ماہر کو بھیج دیا ہے۔ چند گھنٹوں میں ماہر خود آپ کو فون کر کے جواب بتائے گا۔ تب تک کوئی بھی دوائی ماہر سے پوچھے بغیر نہ ڈالیں۔",
    "answer_outro": "یہ جواب ماہرین کی منظور شدہ معلومات سے دیا گیا ہے۔",
    "more": "کوئی اور سوال پوچھنا ہو تو ایک دبائیں۔ کال ختم کرنے کے لیے دو دبائیں۔",
    "consent": "ایک آخری بات۔ کیا ہم آپ کی اس کال کی ریکارڈنگ اپنے پاس رکھ سکتے ہیں تاکہ اپنی سروس بہتر بنا سکیں؟ اس میں آپ کا فون نمبر محفوظ نہیں ہوتا۔ رکھنے کے لیے ایک دبائیں۔ اگر دو دبائیں گے تو ریکارڈنگ فوراً مٹا دی جائے گی۔",
    "consent_yes": "شکریہ! آپ کی ریکارڈنگ محفوظ کر لی گئی ہے۔ اللہ حافظ۔",
    "consent_no": "ٹھیک ہے، آپ کی ریکارڈنگ مٹا دی گئی ہے۔ آواز ساتھی کو فون کرنے کا شکریہ۔ اللہ حافظ۔",
    "callback_intro": "السلام علیکم، آواز ساتھی سے بات ہو رہی ہے۔ آپ کے سوال کا جواب ہمارے سینئر زرعی ماہر نے منظور کیا ہے۔ غور سے سنیں۔",
    "photo_received": "آپ کی تصویر مل گئی ہے۔ ہم اسے دیکھ رہے ہیں۔",
    "not_heard": "معاف کیجیے، آواز صاف سنائی نہیں دی۔ دوبارہ بتائیں۔",
}

CROPS = {"1": "wheat", "2": "cotton", "3": "rice", "4": "sugarcane", "5": "maize"}
CROP_UR = {"wheat": "گندم", "cotton": "کپاس", "rice": "مونجی (چاول)", "sugarcane": "کماد (گنا)", "maize": "مکئی"}
DURATIONS = {"1": "under_3_days", "2": "about_a_week", "3": "more_than_week"}
DURATION_UR = {"under_3_days": "تین دن سے کم", "about_a_week": "تقریباً ایک ہفتہ", "more_than_week": "ایک ہفتے سے زیادہ"}

# Canned queries: used by /admin buttons and by offline mode. (phone index -> seed.demo_phone)
CANNED = {
    "common_aphid": {"label": "Common: wheat aphid (Faisalabad)", "persona": 25, "crop": "wheat", "duration": "under_3_days",
                     "transcript": "میری گندم کے پتوں اور سٹوں پر چھوٹے چھوٹے سبز کیڑے لگے ہوئے ہیں اور پتے چپچپے ہو گئے ہیں، کیا کروں؟"},
    "hard_redrot": {"label": "Hard: sugarcane red rot (Sahiwal)", "persona": 13, "crop": "sugarcane", "duration": "about_a_week",
                    "transcript": "میرے کماد کے گنے اندر سے لال ہو گئے ہیں، چیرنے پر لال رنگ میں سفید دھبے ہیں اور کھٹی بو آتی ہے"},
    "dose_whitefly": {"label": "Dose question: cotton whitefly (Multan)", "persona": 18, "crop": "cotton", "duration": "about_a_week",
                      "transcript": "کپاس پر سفید مکھی ہے، سپرے کتنی مقدار میں کروں فی ایکڑ؟"},
    "rust_okara_2": {"label": "Outbreak case: yellow rust (Okara farmer 2)", "persona": 2, "crop": "wheat", "duration": "under_3_days",
                     "transcript": "ساڈی کنک دے پتیاں تے پیلیاں پیلیاں دھاریاں بن گئیاں نیں، ہتھ لاؤ تے پیلا پاؤڈر لگ جاندا اے"},
    "rust_okara_3": {"label": "Outbreak case: yellow rust (Okara farmer 3)", "persona": 3, "crop": "wheat", "duration": "under_3_days",
                     "transcript": "گندم کے پتوں پر پیلی دھاریاں اور پیلا سفوف ہے، ہمسایوں کے کھیت میں بھی یہی ہے"},
}
