"""Text classification support: synthetic text datasets, tokenizer, TF-IDF + sequence preprocessing.

Torch-free (sklearn/numpy only). Classic models consume TF-IDF vectors; torch text models consume padded token-id
sequences (stored as float32 matrices so the generic training loop can carry them).
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

TOKEN_RE = re.compile(r"[a-z0-9']+")
TEXT_SETS = {
    "reviews": {"label": "Product reviews", "task": "classification", "emoji": "⭐",
                "blurb": "Short reviews labelled positive or negative — including tricky ones like 'not good' and 'not bad at all'.",
                "params": {"n": 3000, "negation_rate": 0.35}},
    "tickets": {"label": "Support tickets", "task": "classification", "emoji": "🎫",
                "blurb": "Customer messages routed to billing, technical, shipping or account teams.", "params": {"n": 3000}},
    "spam": {"label": "SMS spam", "task": "classification", "emoji": "📵",
             "blurb": "Text messages: spam or legitimate (about 15% spam).", "params": {"n": 3000}},
}


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(str(text).lower())


# ----------------------------------------------------------------------------- synthetic text
_POS = ["great", "excellent", "amazing", "good", "fantastic", "lovely", "perfect", "solid", "wonderful", "reliable", "comfortable", "fast"]
_NEG = ["terrible", "awful", "bad", "poor", "horrible", "broken", "useless", "slow", "flimsy", "disappointing", "cheap", "noisy"]
_ITEMS = ["phone", "headphones", "blender", "jacket", "laptop", "lamp", "backpack", "kettle", "camera", "chair", "keyboard", "watch"]
_ASPECTS = ["battery", "sound", "quality", "price", "design", "screen", "fit", "delivery", "material", "size", "build", "colour"]
_FILLER = ["honestly", "overall", "to be fair", "i think", "after a week", "for the price", "so far", "in my opinion", "", "", ""]


def gen_reviews(n=3000, negation_rate=0.35, seed=42):
    """Sentiment hinges on adjectives; a share of reviews negate them ('not good' → negative), so word order matters."""
    rng = np.random.default_rng(seed)
    rows = []
    for _ in range(int(n)):
        positive = rng.random() < 0.5
        negate = rng.random() < negation_rate
        word_pos = not positive if negate else positive
        adj = rng.choice(_POS if word_pos else _NEG)
        item, aspect = rng.choice(_ITEMS), rng.choice(_ASPECTS)
        filler = rng.choice(_FILLER)
        core = f"the {aspect} is {'not ' if negate else ''}{adj}"
        templates = [f"{filler} {core} on this {item}", f"this {item}: {core}", f"{core}, {filler}",
                     f"bought the {item} and {core}", f"{core} — {filler} the {item} arrived on time"]
        text = re.sub(r"\s+", " ", templates[rng.integers(len(templates))]).strip(" ,—")
        # weak, noisy extra cue so the problem isn't purely about one adjective
        if rng.random() < 0.15:
            text += " " + rng.choice(["would buy again", "returning it", "five stars", "one star"] if rng.random() < 0.5 else ["meh", "ok"])
        rows.append({"review": text, "sentiment": "positive" if positive else "negative"})
    return pd.DataFrame(rows)


_TICKETS = {
    "billing": ["charged twice", "refund", "invoice", "payment failed", "credit card", "subscription fee", "overcharged", "receipt"],
    "technical": ["app crashes", "error message", "cannot log in", "page won't load", "bug", "update broke", "freezes", "sync issue"],
    "shipping": ["package late", "tracking number", "delivered wrong address", "not arrived", "courier", "damaged box", "delivery date"],
    "account": ["change email", "reset password", "delete my account", "update address", "two factor", "username", "profile settings"],
}
_OPENERS = ["hi", "hello", "hey team", "good morning", "urgent:", "quick question,", "please help,", ""]
_CLOSERS = ["thanks", "thank you", "asap please", "regards", "cheers", "", ""]


def gen_tickets(n=3000, seed=42):
    rng = np.random.default_rng(seed)
    cats = list(_TICKETS)
    rows = []
    for _ in range(int(n)):
        c = cats[rng.integers(len(cats))]
        a, b = rng.choice(_TICKETS[c], 2, replace=False)
        other = rng.choice(_TICKETS[cats[rng.integers(len(cats))]]) if rng.random() < 0.2 else ""
        text = f"{rng.choice(_OPENERS)} {a} and {b} {('also ' + other) if other else ''} {rng.choice(_CLOSERS)}"
        rows.append({"message": re.sub(r"\s+", " ", text).strip(), "team": c})
    return pd.DataFrame(rows)


def gen_spam(n=3000, seed=42):
    rng = np.random.default_rng(seed)
    spam_bits = ["win a free", "claim your prize", "urgent: your account", "click here", "limited offer", "you have been selected",
                 "cash bonus", "txt stop to", "call now", "100% free", "exclusive deal", "congratulations"]
    ham_bits = ["see you at", "running late", "can you pick up", "dinner tonight", "call me when", "thanks for", "meeting moved to",
                "happy birthday", "did you see", "on my way", "lunch tomorrow", "good luck with"]
    tails = ["5pm", "the kids", "the station", "mum", "friday", "the report", "milk", "the game", "your exam", "home"]
    rows = []
    for _ in range(int(n)):
        spam = rng.random() < 0.15
        bits = rng.choice(spam_bits if spam else ham_bits, 2, replace=False)
        text = f"{bits[0]} {rng.choice(tails)} {bits[1]}" + (f" {rng.integers(100, 9999)}" if spam and rng.random() < 0.6 else "")
        if spam and rng.random() < 0.3:
            text = text.upper()
        rows.append({"text": text, "label": "spam" if spam else "ham"})
    return pd.DataFrame(rows)


GENERATORS = {"reviews": gen_reviews, "tickets": gen_tickets, "spam": gen_spam}
TARGETS = {"reviews": ("review", "sentiment"), "tickets": ("message", "team"), "spam": ("text", "label")}


def generate(name: str, params: dict | None = None, seed: int = 42):
    p = {**TEXT_SETS[name]["params"], **(params or {})}
    p["n"] = max(100, min(int(p.get("n", 3000)), 20000))
    df = GENERATORS[name](**p, seed=seed)
    text_col, target = TARGETS[name]
    return df, {"name": TEXT_SETS[name]["label"], "source": "text_set", "text_set": name, "modality": "text",
                "text_column": text_col, "task_hint": "classification", "target_hint": target}


def detect_text_column(df: pd.DataFrame, exclude: str | None = None) -> str | None:
    best, best_len = None, 0.0
    for c in df.columns:
        if c == exclude or pd.api.types.is_numeric_dtype(df[c]):
            continue
        L = df[c].dropna().astype(str).str.split().str.len().mean()
        if L and L >= 3 and L > best_len:
            best, best_len = c, L
    return best


# ----------------------------------------------------------------------------- preprocessing
class TextPreprocessor:
    """Raw text → TF-IDF vectors (classic models) or padded token ids (torch text models). Duck-types Preprocessor."""

    def __init__(self, text_column: str, task: str, target: str, ngram_max=1, max_features=3000, min_df=2, max_len=40,
                 vocab_size=8000):
        self.text_column, self.task, self.target = text_column, task, target
        self.ngram_max, self.max_features, self.min_df = int(ngram_max), int(max_features), int(min_df)
        self.max_len, self.vocab_size = int(max_len), int(vocab_size)
        self.vectorizer = None
        self.vocab: dict[str, int] = {}
        self.mode = "tfidf"
        self.label_encoder = None
        self.target_transform = "none"
        self.input_schema = [{"name": text_column, "type": "text"}]
        self.feature_names_out: list[str] = []
        self.fe_steps: list = []
        self.modality = "text"

    def fit(self, texts):
        from sklearn.feature_extraction.text import TfidfVectorizer
        self.vectorizer = TfidfVectorizer(ngram_range=(1, self.ngram_max), max_features=self.max_features,
                                          min_df=min(self.min_df, max(1, len(texts) // 50)), token_pattern=r"[a-z0-9']+",
                                          sublinear_tf=True).fit(texts)
        self.feature_names_out = [str(f) for f in self.vectorizer.get_feature_names_out()]
        counts: dict[str, int] = {}
        for t in texts:
            for w in tokenize(t):
                counts[w] = counts.get(w, 0) + 1
        words = sorted(counts, key=lambda w: -counts[w])[: self.vocab_size - 2]
        self.vocab = {w: i + 2 for i, w in enumerate(words)}  # 0 = pad, 1 = unknown
        return self

    def _texts(self, x):
        if isinstance(x, pd.DataFrame):
            col = self.text_column if self.text_column in x.columns else x.columns[0]
            return x[col].fillna("").astype(str).tolist()
        if isinstance(x, str):
            return [x]
        return [str(t) for t in x]

    def tfidf(self, texts) -> np.ndarray:
        return self.vectorizer.transform(texts).toarray().astype(np.float32)

    def sequences(self, texts) -> np.ndarray:
        out = np.zeros((len(texts), self.max_len), dtype=np.float32)
        for i, t in enumerate(texts):
            ids = [self.vocab.get(w, 1) for w in tokenize(t)][: self.max_len]
            out[i, : len(ids)] = ids
        return out

    def transform(self, x) -> np.ndarray:
        texts = self._texts(x)
        return self.sequences(texts) if self.mode == "seq" else self.tfidf(texts)

    def encode_y(self, y):
        return self.label_encoder.transform(pd.Series(y).astype(str)).astype(np.int64)

    def decode_y(self, y):
        return self.label_encoder.inverse_transform(np.asarray(y).astype(int))

    @property
    def classes(self):
        return [str(c) for c in self.label_encoder.classes_] if self.label_encoder is not None else None


def prepare_text(df: pd.DataFrame, spec: dict, dataset_id: str):
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder

    from .pipeline import Prepared
    from .store import new_id
    task, target = spec["task"], spec["target"]
    tcfg = {"text_column": None, "ngram_max": 1, "max_features": 3000, "min_df": 2, "max_len": 40, **(spec.get("text") or {})}
    col = tcfg["text_column"] or detect_text_column(df, exclude=target)
    if not col or col not in df.columns:
        raise ValueError("Choose which column holds the text.")
    sp = {"test_size": 0.2, "val_size": 0.1, "seed": 42, **(spec.get("split") or {})}
    d = df[df[target].notna()].reset_index(drop=True)
    texts = d[col].fillna("").astype(str).tolist()
    pp = TextPreprocessor(col, task, target, tcfg["ngram_max"], tcfg["max_features"], tcfg["min_df"], tcfg["max_len"])
    pp.label_encoder = LabelEncoder().fit(d[target].astype(str))
    y = pp.encode_y(d[target])
    seed = int(sp["seed"])
    strat = y if np.bincount(y).min() >= 3 else None
    idx = np.arange(len(d))
    tr, te = train_test_split(idx, test_size=float(sp["test_size"]), random_state=seed, stratify=strat)
    va = np.array([], dtype=int)
    if float(sp["val_size"]) > 0:
        rel = float(sp["val_size"]) / (1 - float(sp["test_size"]))
        tr, va = train_test_split(tr, test_size=rel, random_state=seed, stratify=strat[tr] if strat is not None else None)
    pp.fit([texts[i] for i in tr])
    T = lambda ix: [texts[i] for i in ix]  # noqa: E731
    X = {k: pp.tfidf(T(ix)) for k, ix in (("tr", tr), ("va", va), ("te", te))}
    S = {k: pp.sequences(T(ix)) for k, ix in (("tr", tr), ("va", va), ("te", te))}
    classes = pp.classes
    counts = lambda ix: {classes[int(k)]: int(v) for k, v in zip(*np.unique(y[ix], return_counts=True))}  # noqa: E731
    lengths = [len(tokenize(t)) for t in T(tr)]
    report = {
        "modality": "text", "task": task, "classes": classes, "text_column": col,
        "splits": {"train": int(len(tr)), "train_before_resample": int(len(tr)), "val": int(len(va)), "test": int(len(te))},
        "class_counts_before": counts(tr), "class_counts_after": counts(tr), "class_counts_test": counts(te),
        "added": 0, "removed": 0, "outliers_removed": 0, "before_points": [], "after_points": [],
        "feature_names_out": pp.feature_names_out[:200], "n_features": len(pp.feature_names_out), "numeric_columns": [],
        "categorical_columns": [], "warnings": [], "image_shape": None, "duplicates_found": 0, "features_created": [],
        "split_info": {"method": "random"}, "vocab_size": len(pp.vocab) + 2,
        "length_hist": {"edges": list(np.histogram_bin_edges(lengths, bins=20).round(1)), "counts": np.histogram(lengths, bins=20)[0].tolist()},
        "examples": [{"text": texts[i], "label": str(d[target].iloc[i]), "tokens": tokenize(texts[i])[: pp.max_len]} for i in tr[:6]],
    }
    prepared = Prepared(id=new_id("pr"), task=task, target=target, dataset_id=dataset_id, spec={**spec, "text": {**tcfg, "text_column": col}},
                        preprocessor=pp, X_train=X["tr"], y_train=y[tr], X_val=X["va"], y_val=y[va], X_test=X["te"], y_test=y[te],
                        feature_names=pp.feature_names_out, classes=classes, report=report, X_train_orig=X["tr"], y_train_orig=y[tr],
                        modality="text",
                        payload={"seq_train": S["tr"], "seq_val": S["va"], "seq_test": S["te"], "texts_test": T(te),
                                 "texts_train_sample": T(tr[:2000]), "vocab_size": len(pp.vocab) + 2, "max_len": pp.max_len})
    report["prepared_id"] = prepared.id
    return prepared
