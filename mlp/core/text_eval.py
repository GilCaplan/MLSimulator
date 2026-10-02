"""Text-specific evaluation: mistakes with the raw text, top words per class, and word-level attributions by
occlusion (remove one word, see how the prediction moves) — model-agnostic, so classic and neural models compare."""
from __future__ import annotations

import numpy as np

from ..util.jsonable import r
from .text import tokenize


def proba_of(model, pp, texts):
    X = pp.transform(texts)
    if hasattr(model, "predict_proba"):
        return np.asarray(model.predict_proba(X))
    pred = np.asarray(model.predict(X)).astype(int)
    P = np.zeros((len(texts), len(pp.classes)))
    P[np.arange(len(texts)), pred] = 1
    return P


def attribute(model, pp, text: str, max_tokens: int = 40) -> dict:
    """Signed influence of each word on the predicted class (positive = pushes towards the prediction)."""
    toks = tokenize(text)[:max_tokens]
    base = proba_of(model, pp, [" ".join(toks)])[0]
    c = int(base.argmax())
    variants = [" ".join(toks[:i] + toks[i + 1:]) for i in range(len(toks))]
    if not variants:
        return {"tokens": [], "pred": pp.classes[c], "probability": r(base[c], 3)}
    P = proba_of(model, pp, variants)
    return {"tokens": [{"t": t, "w": r(float(base[c] - P[i, c]), 3)} for i, t in enumerate(toks)],
            "pred": pp.classes[c], "probability": r(base[c], 3)}


def text_extras(model, prepared, pred, proba) -> dict:
    pp = prepared.preprocessor
    texts = (prepared.payload or {}).get("texts_test") or []
    y = prepared.y_test
    out: dict = {"text_column": pp.text_column}
    if len(texts) == len(y):
        conf = proba.max(1) if proba is not None else np.ones(len(y))
        wrong = np.where(pred != y)[0]
        order = wrong[np.argsort(-conf[wrong])][:25]
        out["mistakes"] = [{"text": texts[i], "true": prepared.classes[int(y[i])], "pred": prepared.classes[int(pred[i])],
                            "confidence": r(conf[i], 3)} for i in order]
        right = np.where(pred == y)[0]
        picks = list(order[:3]) + [int(i) for i in right[:3]]
        try:
            out["examples"] = [{"text": texts[i], "true": prepared.classes[int(y[i])], **attribute(model, pp, texts[i])} for i in picks]
        except Exception as e:  # noqa: BLE001 - explanations are a bonus
            out["note"] = f"Word explanations unavailable: {e}"
    if hasattr(model, "coef_") and pp.mode == "tfidf":
        cf = np.asarray(model.coef_, float)
        names = pp.feature_names_out
        rows = cf if cf.shape[0] > 1 else np.vstack([-cf[0], cf[0]])
        out["top_words"] = [{"class": prepared.classes[k], "words": [{"t": names[j], "w": r(rows[k, j], 3)} for j in np.argsort(-rows[k])[:12]]}
                            for k in range(len(prepared.classes))]
    elif hasattr(model, "feature_log_prob_") and pp.mode == "tfidf":
        lp = np.asarray(model.feature_log_prob_)
        names = pp.feature_names_out
        rel = lp - lp.mean(0, keepdims=True)
        out["top_words"] = [{"class": prepared.classes[k], "words": [{"t": names[j], "w": r(rel[k, j], 3)} for j in np.argsort(-rel[k])[:12]]}
                            for k in range(len(prepared.classes))]
    return out
