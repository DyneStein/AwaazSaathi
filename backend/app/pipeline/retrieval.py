"""Local retrieval over the knowledge base: character n-gram TF-IDF + cosine similarity.
Works on Urdu script without a tokenizer, is instant for a small KB, deterministic, and needs no internet or quota.
The cosine score is the retrieval confidence used by nil detection."""
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


class Index:
    def __init__(self) -> None:
        self.docs: list[Doc] = []
        self.vec = None
        self.mat = None

    def build(self, docs: list[Doc]) -> None:
        self.docs = docs
        if not docs:
            self.vec = self.mat = None
            return
        self.vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True)
        self.mat = self.vec.fit_transform([d.text for d in docs])

    def search(self, query: str, crop: str | None = None, k: int = 3) -> list[tuple[Doc, float]]:
        if self.vec is None or not query.strip():
            return []
        sims = cosine_similarity(self.vec.transform([query]), self.mat)[0]
        scored = []
        for d, s in zip(self.docs, sims):
            # crop chosen on the keypad: gently prefer matching crop, penalise others
            if crop and crop != "unknown" and d.crop != crop:
                s *= 0.6
            scored.append((d, float(s)))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]


index = Index()


def kb_doc(e) -> Doc:
    return Doc(id=e.id, crop=e.crop, disease_tag=e.disease_tag, title_ur=e.title_ur,
               text=" ".join([e.title_ur, e.symptoms_ur, e.symptoms_ur, e.keywords, e.title_en]),
               answer_ur=e.answer_ur, senior_only=e.senior_only)


def rebuild(db) -> None:
    from ..models import KBEntry
    index.build([kb_doc(e) for e in db.query(KBEntry).all()])
