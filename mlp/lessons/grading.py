"""Challenge specs (data + goals + reference configs) and grading on the hidden test set."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..util.jsonable import r

# Each challenge: task/target/positive class, the starting ("naive") setup the learner gets, goals checked on the
# hidden test set, optional model constraint, and reference configs used by scripts/validate_lessons.py to prove the
# issue is present (naive fails) and solvable with in-app tools (solution passes).
CHALLENGES: dict[str, dict] = {
    "missing": {
        "task": "classification", "target": "readmitted", "positive": "readmitted",
        "preset_pipeline": {"impute": {"numeric": "drop_rows", "categorical": "most_frequent"}},
        "preset_models": ["logistic_regression", "random_forest"],
        "goals": [{"metric": "accuracy", "op": ">=", "value": 0.70}, {"metric": "balanced_accuracy", "op": ">=", "value": 0.68}],
        "solution": {"pipeline": {"impute": {"numeric": "median"}}},
    },
    "outliers": {
        "task": "regression", "target": "price",
        "preset_pipeline": {},
        "preset_models": ["linear_regression", "random_forest"],
        "goals": [{"metric": "r2", "op": ">=", "value": 0.85}],
        "solution": {"pipeline": {"target_filter": {"enabled": True, "min": 500, "max": 300000}, "target_transform": "log1p"}},
    },
    "leakage": {
        "task": "classification", "target": "status", "positive": "delayed",
        "preset_pipeline": {},
        "preset_models": ["logistic_regression", "random_forest"],
        "goals": [{"metric": "balanced_accuracy", "op": ">=", "value": 0.62}],
        "solution": {"pipeline": {"drop_columns": ["carrier_delay_min", "weather_delay_min", "late_aircraft_min"]}},
    },
    "scaling": {
        "task": "regression", "target": "monthly_rent",
        "preset_pipeline": {"scale": {"method": "none"}},
        "preset_models": ["knn"],
        "allowed_models": ["knn"],
        "goals": [{"metric": "r2", "op": ">=", "value": 0.75}],
        "solution": {"pipeline": {"scale": {"method": "standard"}}},
    },
    "imbalance": {
        "task": "classification", "target": "label", "positive": "fraud",
        "preset_pipeline": {},
        "preset_models": ["logistic_regression", "random_forest"],
        "goals": [{"metric": "recall_pos", "op": ">=", "value": 0.65}, {"metric": "precision_pos", "op": ">=", "value": 0.10}],
        "solution": {"pipeline": {"resample": {"mode": "oversample", "over": "smote"}}},
    },
    "overfitting": {
        "task": "classification", "target": "outcome", "positive": "success",
        "preset_pipeline": {},
        "preset_models": ["decision_tree"],
        "preset_params": {"decision_tree": {"max_depth": 30, "min_samples_leaf": 1}},
        "allowed_models": ["decision_tree"],
        "goals": [{"metric": "accuracy", "op": ">=", "value": 0.78}],
        "solution": {"params": {"decision_tree": {"max_depth": 3, "min_samples_leaf": 15}}},
    },
    "shortcut": {
        "task": "classification", "target": "diagnosis", "positive": "heart disease",
        "preset_pipeline": {},
        "preset_models": ["logistic_regression", "random_forest"],
        "goals": [{"metric": "balanced_accuracy", "op": ">=", "value": 0.70}],
        "solution": {"pipeline": {"drop_columns": ["clinic"]}},
    },
    "fairness": {
        "task": "classification", "target": "outcome", "positive": "repaid", "group": "gender",
        "preset_pipeline": {},
        "preset_models": ["logistic_regression", "random_forest"],
        "goals": [{"metric": "accuracy", "op": ">=", "value": 0.62}, {"metric": "tpr_gap", "op": "<=", "value": 0.06}],
        "solution": {"pipeline": {"drop_columns": ["gender", "shopping_profile"]}},
        "partial": {"pipeline": {"drop_columns": ["gender"]}},
    },
}

CHALLENGES.update({
    "baselines": {
        "task": "regression", "target": "delay_min",
        "preset_pipeline": {},
        "preset_models": ["linear_regression"],
        "goals": [{"metric": "mae_vs_baseline", "op": ">=", "value": 0.30}],
        "solution": {"models": ["random_forest"]},
    },
    "splits": {
        "task": "classification", "target": "diagnosis", "positive": "dementia",
        "preset_pipeline": {},
        "preset_models": ["random_forest", "knn"],
        "goals": [{"metric": "accuracy", "op": ">=", "value": 0.70},
                  {"metric": "estimate_gap", "of": "accuracy", "op": "<=", "value": 0.035}],
        "solution": {"pipeline": {"split": {"method": "group", "group_column": "patient_id"}}},
    },
    "features": {
        "task": "regression", "target": "tip",
        "preset_pipeline": {},
        "preset_models": ["linear_regression"],
        "allowed_models": ["linear_regression", "ridge", "lasso", "elastic_net"],
        "goals": [{"metric": "r2", "op": ">=", "value": 0.93}],
        "solution": {"pipeline": {"features": [
            {"op": "date_parts", "column": "pickup_time", "parts": ["hour"]},
            {"op": "product", "a": "fare", "b": "paid_by_card", "name": "card_fare"},
            {"op": "formula", "expr": "paid_by_card * ((pickup_time_hour >= 22) or (pickup_time_hour < 4))", "name": "card_late_night"}]}},
        "partial": {"pipeline": {"features": [{"op": "date_parts", "column": "pickup_time", "parts": ["hour"]}]}},
    },
    "calibration": {
        "task": "classification", "target": "destination", "positive": "ICU",
        "preset_pipeline": {"resample": {"mode": "oversample", "over": "smote"}},
        "preset_models": ["logistic_regression", "random_forest"],
        "goals": [{"metric": "ece", "op": "<=", "value": 0.03}, {"metric": "roc_auc", "op": ">=", "value": 0.75}],
        "solution": {"pipeline": {"resample": {"mode": "none"}}},
        # calibrating on SMOTE-rebalanced rows keeps the fake base rate — must FAIL (taught in the lesson)
        "partial": {"options": {"calibrate": "isotonic"}},
    },
})

CHALLENGES.update({
    "convolutions": {
        "kind": "image", "task": "classification", "target": "label", "modality": "image",
        "preset_pipeline": {"image": {"size": 32, "grayscale": False, "augment": {}}},
        "preset_models": ["logistic_regression", "random_forest"],
        "goals": [{"metric": "accuracy", "op": ">=", "value": 0.70}],
        "solution": {"models": ["cnn2d"]},
    },
    "augmentation": {
        "kind": "image", "task": "classification", "target": "label", "modality": "image",
        "preset_pipeline": {"image": {"size": 32, "grayscale": False, "augment": {}}},
        "preset_models": ["cnn2d"],
        "goals": [{"metric": "accuracy", "op": ">=", "value": 0.80}],
        "solution": {"pipeline": {"image": {"size": 32, "grayscale": False, "augment": {"rotate": 180, "shift": 0.3}}}},
    },
})

METRIC_LABELS = {
    "accuracy": "Accuracy", "balanced_accuracy": "Balanced accuracy", "recall_pos": "Recall ({pos})",
    "precision_pos": "Precision ({pos})", "f1_pos": "F1 ({pos})", "r2": "R²",
    "tpr_gap": "Approval gap between {group} groups",
    "mae_vs_baseline": "Beats the always-the-average guess by",
    "estimate_gap": "Gap between your test score and the real world",
    "ece": "Calibration error",
    "roc_auc": "ROC-AUC",
}

PERCENT_METRICS = {"accuracy", "balanced_accuracy", "recall_pos", "precision_pos", "f1_pos", "tpr_gap", "mae_vs_baseline",
                   "estimate_gap", "ece"}


def goal_label(ch: dict, g: dict) -> str:
    name = METRIC_LABELS[g["metric"]].format(pos=ch.get("positive", ""), group=ch.get("group", ""))
    v = g["value"]
    if g["metric"] == "estimate_gap":
        shown = f"{v * 100:g} pts"
    elif g["metric"] in PERCENT_METRICS:
        shown = f"{v:.0%}" if abs(v * 100 - round(v * 100)) < 1e-9 else f"{v:.1%}"
    else:
        shown = f"{v:.2f}"
    return f"{name} {'≥' if g['op'] == '>=' else '≤'} {shown}"


def _pos_proba(ch, probabilities, classes):
    if probabilities is None or classes is None:
        raise ValueError("This model doesn't output probabilities, which this challenge needs.")
    return np.asarray(probabilities, float)[:, list(map(str, classes)).index(str(ch["positive"]))]


def ece_of(p: np.ndarray, hit: np.ndarray, bins: int = 10) -> float:
    idx = np.clip(np.digitize(p, np.linspace(0, 1, bins + 1)[1:-1]), 0, bins - 1)
    return float(sum((idx == b).mean() * abs(p[idx == b].mean() - hit[idx == b].mean()) for b in range(bins) if (idx == b).any()))


def metric_value(metric: str, ch: dict, y_true, y_pred, hidden: pd.DataFrame, probabilities=None, classes=None,
                 your_test: dict | None = None, baseline_value: float | None = None, goal: dict | None = None) -> tuple[float, dict]:
    from sklearn import metrics as M
    extra: dict = {}
    if metric == "mae_vs_baseline":
        yt, yp = np.asarray(y_true, float), np.asarray(y_pred, float)
        base = float(np.mean(np.abs(yt - baseline_value)))
        mae = float(np.mean(np.abs(yt - yp)))
        extra.update({"mae": r(mae), "baseline_mae": r(base)})
        return 1 - mae / base, extra
    if metric == "estimate_gap":
        of = (goal or {}).get("of", "accuracy")
        real, _ = metric_value(of, ch, y_true, y_pred, hidden)
        mine = (your_test or {}).get(of)
        if mine is None:
            raise ValueError("Your own test score is missing — train again.")
        extra.update({"your_test": r(mine), "real_world": r(real), "of": of})
        return abs(float(mine) - real), extra
    if metric in ("ece", "roc_auc"):
        p = _pos_proba(ch, probabilities, classes)
        hit = (np.asarray(y_true).astype(str) == str(ch["positive"])).astype(float)
        if metric == "roc_auc":
            return float(M.roc_auc_score(hit, p)), extra
        extra.update({"predicted_cases": r(p.sum(), 1), "actual_cases": int(hit.sum())})
        return ece_of(p, hit), extra
    if metric == "r2":
        return float(M.r2_score(np.asarray(y_true, float), np.asarray(y_pred, float))), extra
    yt, yp = np.asarray(y_true).astype(str), np.asarray(y_pred).astype(str)
    pos = ch.get("positive")
    if metric == "accuracy":
        return float((yt == yp).mean()), extra
    if metric == "balanced_accuracy":
        return float(M.balanced_accuracy_score(yt, yp)), extra
    if metric == "recall_pos":
        return float(M.recall_score(yt, yp, pos_label=pos, zero_division=0)), extra
    if metric == "precision_pos":
        return float(M.precision_score(yt, yp, pos_label=pos, zero_division=0)), extra
    if metric == "f1_pos":
        return float(M.f1_score(yt, yp, pos_label=pos, zero_division=0)), extra
    if metric == "tpr_gap":
        groups = hidden[ch["group"]].astype(str).to_numpy()
        rates = {}
        for gname in sorted(set(groups)):
            m = (groups == gname) & (yt == pos)
            rates[gname] = float((yp[m] == pos).mean()) if m.any() else 0.0
        extra["per_group"] = {k: r(v) for k, v in rates.items()}
        return float(max(rates.values()) - min(rates.values())), extra
    raise ValueError(metric)


def grade(lesson_id: str, hidden: pd.DataFrame, predictions, probabilities=None, classes=None, your_test: dict | None = None,
          baseline_value: float | None = None) -> dict:
    ch = CHALLENGES[lesson_id]
    y_true = hidden[ch["target"]]
    results = []
    for g in ch["goals"]:
        v, extra = metric_value(g["metric"], ch, y_true, predictions, hidden, probabilities, classes, your_test, baseline_value, g)
        ok = v >= g["value"] if g["op"] == ">=" else v <= g["value"]
        results.append({"metric": g["metric"], "label": goal_label(ch, g), "value": r(v), "target": g["value"], "op": g["op"],
                        "passed": bool(ok), **extra})
    return {"passed": all(x["passed"] for x in results), "goals": results, "n_hidden": int(len(hidden))}
