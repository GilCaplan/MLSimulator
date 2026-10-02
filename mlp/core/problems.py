"""Catalogue of problem types (task × modality). Mirrored in frontend/src/lib/problems.ts.

Each problem defines the wizard's step labels, the primary metric and its direction, and whether it's enabled yet.
Existing projects without a modality are tabular.
"""
from __future__ import annotations

DEFAULT_STEPS = [["problem", "Problem"], ["models", "Models"], ["data", "Data"], ["prepare", "Prepare"], ["train", "Train"],
                 ["improve", "Improve"]]

PROBLEMS: list[dict] = [
    {"id": "classification", "task": "classification", "modality": "tabular", "group": "Predict", "emoji": "🏷️",
     "label": "Classification", "question": "Which group does it belong to?", "primary_metric": "accuracy",
     "lower_is_better": False, "enabled": True},
    {"id": "regression", "task": "regression", "modality": "tabular", "group": "Predict", "emoji": "📈",
     "label": "Regression", "question": "How much / how many?", "primary_metric": "r2", "lower_is_better": False, "enabled": True},
    {"id": "image_classification", "task": "classification", "modality": "image", "group": "Vision", "emoji": "🖼️",
     "label": "Image classification", "question": "What is in this picture?", "primary_metric": "accuracy",
     "lower_is_better": False, "enabled": True,
     "steps": [["problem", "Problem"], ["models", "Models"], ["data", "Images"], ["prepare", "Prepare"], ["train", "Train"], ["improve", "Improve"]]},
    {"id": "image_regression", "task": "regression", "modality": "image", "group": "Vision", "emoji": "📐",
     "label": "Image regression", "question": "What number does this picture show?", "primary_metric": "r2",
     "lower_is_better": False, "enabled": True,
     "steps": [["problem", "Problem"], ["models", "Models"], ["data", "Images"], ["prepare", "Prepare"], ["train", "Train"], ["improve", "Improve"]]},
    {"id": "text_classification", "task": "classification", "modality": "text", "group": "Language", "emoji": "💬",
     "label": "Text classification", "question": "What kind of text is this?", "primary_metric": "accuracy",
     "lower_is_better": False, "enabled": True,
     "steps": [["problem", "Problem"], ["models", "Models"], ["data", "Texts"], ["prepare", "Prepare"], ["train", "Train"], ["improve", "Improve"]]},
    {"id": "clustering", "task": "clustering", "modality": "tabular", "group": "Discover", "emoji": "🫧",
     "label": "Clustering", "question": "Which natural groups exist?", "primary_metric": "silhouette",
     "lower_is_better": False, "enabled": True, "unsupervised": True,
     "steps": [["problem", "Problem"], ["models", "Models"], ["data", "Data"], ["prepare", "Prepare"], ["train", "Discover"], ["improve", "Refine"]]},
    {"id": "reduction", "task": "reduction", "modality": "tabular", "group": "Discover", "emoji": "🗺️",
     "label": "Map my data", "question": "What does my data look like in 2-D?", "primary_metric": "trustworthiness",
     "lower_is_better": False, "enabled": True, "unsupervised": True,
     "steps": [["problem", "Problem"], ["models", "Models"], ["data", "Data"], ["prepare", "Prepare"], ["train", "Map"], ["improve", "Refine"]]},
    {"id": "anomaly", "task": "anomaly", "modality": "tabular", "group": "Discover", "emoji": "🚨",
     "label": "Anomaly detection", "question": "Which rows are unusual?", "primary_metric": "roc_auc",
     "lower_is_better": False, "enabled": True, "unsupervised": True,
     "steps": [["problem", "Problem"], ["models", "Models"], ["data", "Data"], ["prepare", "Prepare"], ["train", "Detect"], ["improve", "Refine"]]},
    {"id": "recommendation", "task": "recommendation", "modality": "ratings", "group": "Recommend", "emoji": "🎬",
     "label": "Recommendations", "question": "What will this person like next?", "primary_metric": "ndcg_at_10",
     "lower_is_better": False, "enabled": False},
    {"id": "forecasting", "task": "forecasting", "modality": "timeseries", "group": "Forecast", "emoji": "⏱️",
     "label": "Forecasting", "question": "What happens next?", "primary_metric": "mae", "lower_is_better": True, "enabled": False},
]

PROBLEM_INDEX = {p["id"]: p for p in PROBLEMS}


def problem_for(task: str | None, modality: str | None) -> dict | None:
    modality = modality or "tabular"
    for p in PROBLEMS:
        if p["task"] == task and p["modality"] == modality:
            return p
    return None


def public_problems() -> list[dict]:
    return [{**p, "steps": p.get("steps", DEFAULT_STEPS)} for p in PROBLEMS]
