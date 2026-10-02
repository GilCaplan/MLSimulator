"""A binary classifier whose yes/no decision uses a custom probability cut-off (no heavy imports; picklable)."""
from __future__ import annotations

import numpy as np


class ThresholdClassifier:
    """Wraps a fitted binary classifier: `predict` says "second class" when its probability ≥ `threshold`.
    Everything else (predict_proba, feature_importances_, module(), …) is passed through to the wrapped model."""

    def __init__(self, est, threshold: float):
        self.est = est
        self.threshold = float(threshold)

    def predict_proba(self, X):
        return self.est.predict_proba(X)

    def predict(self, X):
        return (np.asarray(self.est.predict_proba(X))[:, 1] >= self.threshold).astype(int)

    def __getattr__(self, name):
        est = self.__dict__.get("est")  # guard: __getattr__ runs before __dict__ is filled while unpickling
        if est is None:
            raise AttributeError(name)
        return getattr(est, name)


def apply_threshold(est, threshold, prepared):
    """Wrap `est` when a threshold is set and the task is binary classification; otherwise return it unchanged."""
    if threshold is None or prepared.task != "classification" or len(prepared.classes or []) != 2 or not hasattr(est, "predict_proba"):
        return est
    t = float(threshold)
    if not 0.0 < t < 1.0 or abs(t - 0.5) < 1e-9:
        return est
    return ThresholdClassifier(est, t)
