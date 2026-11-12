"""Local retrieval over the knowledge base: character n-gram TF-IDF + cosine similarity.
Works on Urdu script without a tokenizer, is instant for a small KB, deterministic, and needs no internet or quota.
The cosine score is the retrieval confidence used by nil detection."""
import re
from dataclasses import dataclass

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class Doc:
    id: int
    crop: str
    disease_tag: str
    title_ur: str
    text: str          # indexed text (title + symptoms + keywords)
    answer_ur: str
    senior_only: bool
    keywords: str = ""     # Roman Urdu / English spellings, indexed as a second field
    title_en: str = ""
    source: str = "seed"   # seed | promoted
    reviewed_by: str | None = None


class Index:
    def __init__(self) -> None:
        self.docs: list[Doc] = []
        self.vec = None
        self.mat = None
        self.kw_mat = None

    def build(self, docs: list[Doc]) -> None:
        self.docs = docs
        if not docs:
            self.vec = self.mat = self.kw_mat = None
            return
        self.vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True)
        self.mat = self.vec.fit_transform([d.text for d in docs])
        # Second field: Roman / English spellings only, so a Roman Urdu question is not diluted by the Urdu-script text.
        self.kw_mat = self.vec.transform([f"{d.keywords} {d.title_en}".strip() or d.text for d in docs])

    def search(self, query: str, crop: str | None = None, k: int = 3, category: str | None = None) -> list[tuple[Doc, float]]:
        if self.vec is None or not query.strip():
            return []
        qv = self.vec.transform([query])
        sims = cosine_similarity(qv, self.mat)[0]
        if is_roman(query):
            sims = [max(a, b) for a, b in zip(sims, cosine_similarity(qv, self.kw_mat)[0])]
        scored = []
        for d, s in zip(self.docs, sims):
            # crop chosen on the keypad: gently prefer matching crop, penalise others
            if crop and crop != "unknown" and d.crop != crop:
                s *= 0.6
            dc = category_of(d.disease_tag)
            if category and dc:
                s *= 1.15 if dc == category else 0.85
            scored.append((d, float(s)))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]


def is_roman(text: str) -> bool:
    """True when the question is mostly Latin letters (Roman Urdu / English typed or transcribed)."""
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and sum(c.isascii() for c in letters) / len(letters) > 0.6


# Words that carry no symptom information: grammar words and the crop names (the crop comes from the keypad).
STOPWORDS = set("""کے کی کا کو پر اور ہیں ہے میں سے نے تو بھی یہ وہ ہو ہوئے ہوئی گئے گئی گیا رہے رہی رہا کیا کروں کریں کر تھا تھی
میری میرے میرا ہمارے ہماری ساڈی ساڈے دے دی دا تے نیں اے نوں وچ توں کی کراں لگ لگے لگی لگا لگتا لگتی بہت کچھ اس ان جو جب تک ہی
گندم کنک کپاس نرما نرمے مونجی چاول کماد گنا گنے مکئی فصل کھیت ہوں آ آتے آتی جاتا جاتی جاتے بن بعد لیے پھر جن جیسے جیسا
ke ki ka ko par aur hain hai mein se ne to bhi ye wo ho gaya gayi gaye raha rahi rahe kya karun karoon lag the on in of and is my
gandum kanak kapas narma monji chawal kamaad ganna makai makki fasal khet""".split())


def evidence_terms(query: str, doc: "Doc") -> list[str]:
    """The farmer's own words that also appear in the knowledge entry: shown as the reason this source was chosen."""
    hay = f"{doc.text} {doc.keywords}".lower()
    hay_words = set(re.findall(r"[^\W\d_]+", hay))
    out: list[str] = []
    for w in re.findall(r"[^\W\d_]+", (query or "").lower()):
        if len(w) < 3 or w in STOPWORDS or w in out:
            continue
        if w in hay_words:
            out.append(w)
    return out


index = Index()

# Problem category per KB tag. The farmer can tap a category; it steers retrieval when the transcript is noisy.
CATEGORY = {
    "disease": {"wheat_yellow_rust", "wheat_brown_rust", "cotton_leaf_curl", "rice_bacterial_blight", "rice_blast", "maize_leaf_blight"},
    "pest": {"wheat_aphid", "wheat_termite", "cotton_whitefly", "cotton_pink_bollworm", "cotton_jassid", "cotton_mealybug",
             "rice_stem_borer", "sugarcane_top_borer", "sugarcane_pyrilla", "maize_fall_armyworm"},
    "nutrient": {"rice_zinc_khaira"},
    "weed": {"wheat_weeds"},
}
CATEGORY_WORDS = {"disease": "بیماری دھبے پھپھوند", "pest": "کیڑا سنڈی کیڑے", "nutrient": "کھاد کمی غذائی", "weed": "جڑی بوٹی گھاس"}


def category_of(tag: str) -> str | None:
    return next((c for c, tags in CATEGORY.items() if tag in tags), None)


def kb_doc(e) -> Doc:
    return Doc(id=e.id, crop=e.crop, disease_tag=e.disease_tag, title_ur=e.title_ur,
               text=" ".join([e.title_ur, e.symptoms_ur, e.symptoms_ur, e.keywords, e.title_en]),
               answer_ur=e.answer_ur, senior_only=e.senior_only, keywords=e.keywords or "", title_en=e.title_en or "",
               source=getattr(e, "source", "seed") or "seed", reviewed_by=getattr(e, "reviewed_by", None))


def rebuild(db) -> None:
    from ..models import KBEntry
    index.build([kb_doc(e) for e in db.query(KBEntry).all()])
