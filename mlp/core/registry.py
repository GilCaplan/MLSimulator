"""Catalogue of classic ML models.

Each entry carries a plain-language description and a hyperparameter schema the
UI renders generically. `build_estimator` turns (model_id, task, params) into an
unfitted sklearn-compatible estimator.
"""
from __future__ import annotations

from typing import Any


def P(name, label, type_, default, help_, **kw) -> dict:
    return {"name": name, "label": label, "type": type_, "default": default, "help": help_, **kw}


C_PARAM = P("C", "Regularization strength (C)", "float", 1.0,
            "Smaller values = simpler model that resists overfitting; larger values fit the training data more tightly.",
            min=0.001, max=100.0, log=True)
N_EST = P("n_estimators", "Number of trees", "int", 200,
          "More trees = more stable predictions, but slower training.", min=10, max=1000, step=10)
MAX_DEPTH = P("max_depth", "Max tree depth", "int", 6,
              "How many questions each tree may ask. Deeper trees capture more detail but can memorize noise.",
              min=1, max=30)
LR = P("learning_rate", "Learning rate", "float", 0.1,
       "How big a correction each new tree makes. Smaller = slower but often more accurate.",
       min=0.001, max=1.0, log=True)

MODELS: list[dict[str, Any]] = [
    # ---------- linear ----------
    {"id": "linear_regression", "label": "Linear Regression", "family": "Linear", "tasks": ["regression"],
     "emoji": "📈", "description": "Fits the best straight line (or flat plane) through your data. Fast, simple and easy to interpret.",
     "params": [P("fit_intercept", "Fit intercept", "bool", True, "Allow the line to not pass through zero.")]},
    {"id": "ridge", "label": "Ridge Regression", "family": "Linear", "tasks": ["regression"], "emoji": "🪢",
     "description": "Linear regression that gently shrinks coefficients to avoid overreacting to noise.",
     "params": [P("alpha", "Penalty (alpha)", "float", 1.0, "Higher = stronger shrinking of coefficients.", min=0.0001, max=100.0, log=True)]},
    {"id": "lasso", "label": "Lasso Regression", "family": "Linear", "tasks": ["regression"], "emoji": "✂️",
     "description": "Linear regression that can push unhelpful features all the way to zero, picking features for you.",
     "params": [P("alpha", "Penalty (alpha)", "float", 0.1, "Higher = more features switched off.", min=0.0001, max=10.0, log=True)]},
    {"id": "elastic_net", "label": "Elastic Net", "family": "Linear", "tasks": ["regression"], "emoji": "🕸️",
     "description": "A blend of Ridge and Lasso: shrinks coefficients and can drop features.",
     "params": [P("alpha", "Penalty (alpha)", "float", 0.1, "Overall penalty strength.", min=0.0001, max=10.0, log=True),
                P("l1_ratio", "Lasso ↔ Ridge mix", "float", 0.5, "1 = pure Lasso, 0 = pure Ridge.", min=0.0, max=1.0, step=0.05)]},
    {"id": "logistic_regression", "label": "Logistic Regression", "family": "Linear", "tasks": ["classification"], "emoji": "🧭",
     "description": "Draws a straight boundary between classes and gives a probability for each. A great first baseline.",
     "params": [C_PARAM, P("max_iter", "Max iterations", "int", 1000, "How long the optimizer may search.", min=100, max=10000, step=100),
                P("class_weight", "Class weighting", "choice", "none", "'balanced' gives rare classes more importance.", options=["none", "balanced"])]},
    # ---------- SVM ----------
    {"id": "svm", "label": "Support Vector Machine", "family": "Kernel", "tasks": ["classification"], "emoji": "🛡️",
     "description": "Finds the widest possible margin between classes; kernels let the boundary curve.",
     "params": [C_PARAM, P("kernel", "Kernel", "choice", "rbf", "Shape of the boundary: linear, curvy (rbf), or polynomial.", options=["rbf", "linear", "poly", "sigmoid"]),
                P("gamma", "Gamma", "choice", "scale", "How far each training point's influence reaches.", options=["scale", "auto"]),
                P("class_weight", "Class weighting", "choice", "none", "'balanced' gives rare classes more importance.", options=["none", "balanced"])]},
    {"id": "svr", "label": "Support Vector Regression", "family": "Kernel", "tasks": ["regression"], "emoji": "🛡️",
     "description": "Fits a tube around the data and ignores small errors inside it; kernels allow curves.",
     "params": [C_PARAM, P("kernel", "Kernel", "choice", "rbf", "Shape of the function.", options=["rbf", "linear", "poly"]),
                P("epsilon", "Tube width (epsilon)", "float", 0.1, "Errors smaller than this are ignored.", min=0.001, max=5.0, log=True)]},
    # ---------- neighbours / bayes ----------
    {"id": "knn", "label": "K-Nearest Neighbors", "family": "Instance", "tasks": ["classification", "regression"], "emoji": "👥",
     "description": "Predicts by looking at the K most similar examples it has seen. No real 'training'.",
     "params": [P("n_neighbors", "Neighbors (K)", "int", 5, "How many similar examples vote. Small K = jumpy, large K = smooth.", min=1, max=100),
                P("weights", "Vote weighting", "choice", "uniform", "'distance' lets closer neighbors count more.", options=["uniform", "distance"])]},
    {"id": "naive_bayes", "label": "Naive Bayes", "family": "Probabilistic", "tasks": ["classification"], "emoji": "🎲",
     "description": "Uses probability rules assuming features are independent. Very fast; surprisingly decent.",
     "params": [P("var_smoothing", "Variance smoothing", "float", 1e-9, "Stabilizes calculations; rarely needs changing.", min=1e-12, max=1e-3, log=True)]},
    # ---------- trees ----------
    {"id": "decision_tree", "label": "Decision Tree", "family": "Tree", "tasks": ["classification", "regression"], "emoji": "🌳",
     "description": "A flowchart of yes/no questions. Very interpretable, but a single tree overfits easily.",
     "params": [MAX_DEPTH, P("min_samples_leaf", "Min samples per leaf", "int", 1, "Each final answer must be backed by at least this many examples.", min=1, max=100)]},
    {"id": "random_forest", "label": "Random Forest", "family": "Ensemble", "tasks": ["classification", "regression"], "emoji": "🌲",
     "description": "Hundreds of trees each trained on a random slice of the data, then they vote. Robust and strong.",
     "params": [N_EST, P("max_depth", "Max tree depth", "int", 0, "0 = unlimited. Limit it to reduce overfitting.", min=0, max=50),
                P("min_samples_leaf", "Min samples per leaf", "int", 1, "Larger = smoother, less overfit.", min=1, max=50),
                P("max_features", "Features per split", "choice", "sqrt", "How many features each split may consider.", options=["sqrt", "log2", "all"])]},
    {"id": "extra_trees", "label": "Extra Trees", "family": "Ensemble", "tasks": ["classification", "regression"], "emoji": "🎋",
     "description": "Like a random forest but with even more randomness in the splits — often faster and smoother.",
     "params": [N_EST, P("max_depth", "Max tree depth", "int", 0, "0 = unlimited.", min=0, max=50)]},
    {"id": "gradient_boosting", "label": "Gradient Boosting", "family": "Boosting", "tasks": ["classification", "regression"], "emoji": "🚀",
     "description": "Builds trees one after another, each fixing the previous ones' mistakes.",
     "params": [P("n_estimators", "Number of trees", "int", 150, "More rounds of correction.", min=10, max=1000, step=10), LR,
                P("max_depth", "Max tree depth", "int", 3, "Boosted trees are usually shallow.", min=1, max=12),
                P("subsample", "Row sample fraction", "float", 1.0, "Below 1 adds randomness that can reduce overfitting.", min=0.3, max=1.0, step=0.05)]},
    {"id": "hist_gradient_boosting", "label": "Histogram Boosting", "family": "Boosting", "tasks": ["classification", "regression"], "emoji": "⚡",
     "description": "scikit-learn's fast boosting for larger datasets; handles missing values natively.",
     "params": [P("max_iter", "Boosting rounds", "int", 200, "Number of trees.", min=10, max=1000, step=10), LR,
                P("max_leaf_nodes", "Leaves per tree", "int", 31, "Complexity of each tree.", min=4, max=255)]},
    {"id": "adaboost", "label": "AdaBoost", "family": "Boosting", "tasks": ["classification", "regression"], "emoji": "🎯",
     "description": "Repeatedly re-weights the examples it got wrong so the next learner focuses on them.",
     "params": [P("n_estimators", "Number of learners", "int", 100, "Rounds of boosting.", min=10, max=1000, step=10), LR]},
    {"id": "xgboost", "label": "XGBoost", "family": "Boosting", "tasks": ["classification", "regression"], "emoji": "🏆",
     "description": "The competition-winning gradient boosting library. Fast, regularized, and very accurate on tables.",
     "params": [N_EST, LR, MAX_DEPTH,
                P("subsample", "Row sample fraction", "float", 0.9, "Randomly use part of the rows per tree.", min=0.3, max=1.0, step=0.05),
                P("colsample_bytree", "Column sample fraction", "float", 0.9, "Randomly use part of the features per tree.", min=0.3, max=1.0, step=0.05),
                P("reg_lambda", "L2 regularization", "float", 1.0, "Penalizes large leaf values.", min=0.0, max=20.0, step=0.1)]},
    {"id": "lightgbm", "label": "LightGBM", "family": "Boosting", "tasks": ["classification", "regression"], "emoji": "💡",
     "description": "Microsoft's very fast leaf-wise boosting. Great for larger datasets.",
     "params": [N_EST, LR, P("num_leaves", "Leaves per tree", "int", 31, "Main complexity control.", min=4, max=255),
                P("subsample", "Row sample fraction", "float", 0.9, "Randomly use part of the rows.", min=0.3, max=1.0, step=0.05)]},
]

MODELS.append({"id": "baseline", "label": "Baseline", "family": "Reference", "tasks": ["classification", "regression"],
               "emoji": "🎯", "hidden": True,
               "description": "Always predicts the most common class (or the average). Any real model must beat it.",
               "params": []})

MODEL_INDEX = {m["id"]: m for m in MODELS}


def defaults(model_id: str) -> dict:
    return {p["name"]: p["default"] for p in MODEL_INDEX[model_id]["params"]}


def _cw(v):
    return None if v in (None, "none") else v


def _depth(v):
    return None if not v else int(v)


def build_estimator(model_id: str, task: str, params: dict | None = None, n_classes: int = 2, seed: int = 42):
    p = {**defaults(model_id), **(params or {})}
    clf = task == "classification"
    if model_id == "baseline":
        from sklearn.dummy import DummyClassifier, DummyRegressor
        return DummyClassifier(strategy="prior") if clf else DummyRegressor(strategy="mean")
    if model_id == "linear_regression":
        from sklearn.linear_model import LinearRegression
        return LinearRegression(fit_intercept=bool(p["fit_intercept"]))
    if model_id == "ridge":
        from sklearn.linear_model import Ridge
        return Ridge(alpha=float(p["alpha"]))
    if model_id == "lasso":
        from sklearn.linear_model import Lasso
        return Lasso(alpha=float(p["alpha"]), max_iter=10000)
    if model_id == "elastic_net":
        from sklearn.linear_model import ElasticNet
        return ElasticNet(alpha=float(p["alpha"]), l1_ratio=float(p["l1_ratio"]), max_iter=10000)
    if model_id == "logistic_regression":
        from sklearn.linear_model import LogisticRegression
        return LogisticRegression(C=float(p["C"]), max_iter=int(p["max_iter"]), class_weight=_cw(p["class_weight"]))
    if model_id == "svm":
        from sklearn.calibration import CalibratedClassifierCV
        from sklearn.svm import SVC
        svc = SVC(C=float(p["C"]), kernel=p["kernel"], gamma=p["gamma"], class_weight=_cw(p["class_weight"]), random_state=seed)
        return CalibratedClassifierCV(svc, ensemble=False, cv=3)
    if model_id == "svr":
        from sklearn.svm import SVR
        return SVR(C=float(p["C"]), kernel=p["kernel"], epsilon=float(p["epsilon"]))
    if model_id == "knn":
        from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
        cls = KNeighborsClassifier if clf else KNeighborsRegressor
        return cls(n_neighbors=int(p["n_neighbors"]), weights=p["weights"])
    if model_id == "naive_bayes":
        from sklearn.naive_bayes import GaussianNB
        return GaussianNB(var_smoothing=float(p["var_smoothing"]))
    if model_id == "decision_tree":
        from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
        cls = DecisionTreeClassifier if clf else DecisionTreeRegressor
        return cls(max_depth=_depth(p["max_depth"]), min_samples_leaf=int(p["min_samples_leaf"]), random_state=seed)
    if model_id == "random_forest":
        from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
        cls = RandomForestClassifier if clf else RandomForestRegressor
        mf = None if p["max_features"] == "all" else p["max_features"]
        return cls(n_estimators=int(p["n_estimators"]), max_depth=_depth(p["max_depth"]),
                   min_samples_leaf=int(p["min_samples_leaf"]), max_features=mf, n_jobs=-1, random_state=seed)
    if model_id == "extra_trees":
        from sklearn.ensemble import ExtraTreesClassifier, ExtraTreesRegressor
        cls = ExtraTreesClassifier if clf else ExtraTreesRegressor
        return cls(n_estimators=int(p["n_estimators"]), max_depth=_depth(p["max_depth"]), n_jobs=-1, random_state=seed)
    if model_id == "gradient_boosting":
        from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
        cls = GradientBoostingClassifier if clf else GradientBoostingRegressor
        return cls(n_estimators=int(p["n_estimators"]), learning_rate=float(p["learning_rate"]),
                   max_depth=int(p["max_depth"]), subsample=float(p["subsample"]), random_state=seed)
    if model_id == "hist_gradient_boosting":
        from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
        cls = HistGradientBoostingClassifier if clf else HistGradientBoostingRegressor
        return cls(max_iter=int(p["max_iter"]), learning_rate=float(p["learning_rate"]),
                   max_leaf_nodes=int(p["max_leaf_nodes"]), random_state=seed)
    if model_id == "adaboost":
        from sklearn.ensemble import AdaBoostClassifier, AdaBoostRegressor
        cls = AdaBoostClassifier if clf else AdaBoostRegressor
        return cls(n_estimators=int(p["n_estimators"]), learning_rate=float(p["learning_rate"]), random_state=seed)
    if model_id == "xgboost":
        from xgboost import XGBClassifier, XGBRegressor
        kw = dict(n_estimators=int(p["n_estimators"]), learning_rate=float(p["learning_rate"]), max_depth=int(p["max_depth"]),
                  subsample=float(p["subsample"]), colsample_bytree=float(p["colsample_bytree"]),
                  reg_lambda=float(p["reg_lambda"]), random_state=seed, n_jobs=-1, verbosity=0)
        return XGBClassifier(**kw) if clf else XGBRegressor(**kw)
    if model_id == "lightgbm":
        from lightgbm import LGBMClassifier, LGBMRegressor
        kw = dict(n_estimators=int(p["n_estimators"]), learning_rate=float(p["learning_rate"]), num_leaves=int(p["num_leaves"]),
                  subsample=float(p["subsample"]), subsample_freq=1, random_state=seed, verbose=-1)
        return LGBMClassifier(**kw) if clf else LGBMRegressor(**kw)
    raise ValueError(f"Unknown model {model_id}")


# ---------------------------------------------------------------------------
# Neural networks (PyTorch). Architecture comes from `nn_arch`; these are the training knobs.
# ---------------------------------------------------------------------------
NN_TRAIN_PARAMS = [
    P("epochs", "Epochs", "int", 60, "How many full passes over the training data.", min=1, max=500),
    P("batch_size", "Batch size", "int", 64, "Examples per weight update. Smaller = noisier but sometimes better.", min=8, max=1024, step=8),
    P("lr", "Learning rate", "float", 0.003, "Step size of each update. Too high = unstable, too low = slow.", min=1e-5, max=0.5, log=True),
    P("optimizer", "Optimizer", "choice", "adamw", "The algorithm that updates the weights.", options=["adamw", "adam", "sgd", "rmsprop"]),
    P("weight_decay", "Weight decay", "float", 1e-4, "Gently pulls weights toward zero to reduce overfitting.", min=0.0, max=0.1, step=0.0001),
    P("patience", "Early-stop patience", "int", 12, "Stop if validation hasn't improved for this many epochs (0 = never).", min=0, max=100),
    P("scheduler", "LR schedule", "choice", "plateau", "Lower the learning rate as training progresses.", options=["none", "plateau", "cosine"]),
    P("class_weight", "Class weighting", "choice", "none", "'balanced' makes mistakes on rare classes cost more.", options=["none", "balanced"]),
]

NN_MODELS: list[dict[str, Any]] = [
    {"id": "mlp", "label": "Neural Network (MLP)", "family": "Neural", "tasks": ["classification", "regression"], "emoji": "🧠",
     "nn": True, "arch_kind": "mlp",
     "description": "Stacked layers of neurons, fully connected. You design the layers; it learns any smooth pattern.",
     "default_arch": {"kind": "mlp", "layers": [{"type": "dense", "units": 64, "activation": "relu", "dropout": 0.1, "batchnorm": False},
                                                {"type": "dense", "units": 32, "activation": "relu", "dropout": 0.0, "batchnorm": False}]},
     "params": NN_TRAIN_PARAMS},
    {"id": "cnn1d", "label": "1-D Convolutional Net", "family": "Neural", "tasks": ["classification", "regression"], "emoji": "〰️",
     "nn": True, "arch_kind": "cnn1d",
     "description": "Slides small filters along your features to find local patterns — good for ordered signals.",
     "default_arch": {"kind": "cnn1d", "layers": [{"type": "conv", "filters": 16, "kernel": 3, "activation": "relu", "pool": 2},
                                                  {"type": "conv", "filters": 32, "kernel": 3, "activation": "relu", "pool": 0},
                                                  {"type": "dense", "units": 32, "activation": "relu", "dropout": 0.2}]},
     "params": NN_TRAIN_PARAMS},
    {"id": "cnn2d", "label": "Image CNN (2-D)", "family": "Neural", "tasks": ["classification", "regression"], "emoji": "🖼️",
     "nn": True, "arch_kind": "cnn2d", "requires": "image",
     "description": "The classic image network: filters scan the picture for edges, strokes and shapes. Needs image data (e.g. the digits sample).",
     "default_arch": {"kind": "cnn2d", "global_pool": True,
                      "layers": [{"type": "conv", "filters": 32, "kernel": 3, "activation": "relu", "pool": 2, "batchnorm": True},
                                 {"type": "conv", "filters": 64, "kernel": 3, "activation": "relu", "pool": 2, "batchnorm": True},
                                 {"type": "conv", "filters": 64, "kernel": 3, "activation": "relu", "pool": 0, "batchnorm": True},
                                 {"type": "dense", "units": 64, "activation": "relu", "dropout": 0.2}]},
     "params": NN_TRAIN_PARAMS},
    {"id": "ft_transformer", "label": "Tabular Transformer", "family": "Neural", "tasks": ["classification", "regression"], "emoji": "🔮",
     "nn": True, "arch_kind": "ft_transformer",
     "description": "Turns each feature into a token and lets attention discover which features matter together (FT-Transformer).",
     "default_arch": {"kind": "ft_transformer", "d_token": 32, "n_blocks": 2, "n_heads": 4, "ffn_mult": 2, "dropout": 0.1},
     "params": NN_TRAIN_PARAMS},
    {"id": "gcn", "label": "Graph Neural Net (GCN)", "family": "Neural", "tasks": ["classification", "regression"], "emoji": "🕸️",
     "nn": True, "arch_kind": "gcn",
     "description": "Connects every example to its most similar neighbours, then lets information flow along the graph.",
     "default_arch": {"kind": "gcn", "k": 10, "hidden": [64, 32], "activation": "relu", "dropout": 0.3},
     "params": [p for p in NN_TRAIN_PARAMS if p["name"] != "batch_size"]},
]

NN_MODELS.append(
    {"id": "tiny_resnet", "label": "Tiny ResNet", "family": "Vision", "tasks": ["classification", "regression"], "emoji": "🏗️",
     "nn": True, "arch_kind": "tiny_resnet", "modalities": ["image"], "requires": "image",
     "description": "A small residual network — the 'skip connection' design behind modern vision models. Learns textures, parts and shapes.",
     "default_arch": {"kind": "tiny_resnet", "width": 16, "stages": 3, "blocks": 1, "dropout": 0.1},
     "params": NN_TRAIN_PARAMS})

# Image models learn more slowly (especially with augmentation): train longer and stop less eagerly.
VISION_TRAIN_PARAMS = [({**p, "default": 40} if p["name"] == "epochs" else {**p, "default": 20} if p["name"] == "patience" else p)
                       for p in NN_TRAIN_PARAMS]
for _m in NN_MODELS:
    if _m["id"] in ("cnn2d", "tiny_resnet"):
        _m["params"] = VISION_TRAIN_PARAMS
    MODELS.append(_m)
    MODEL_INDEX[_m["id"]] = _m

# Which models make sense on images ("pixels as a table" for classic models is a deliberate teaching contrast).
for _id in ("logistic_regression", "linear_regression", "ridge", "svm", "knn", "random_forest", "extra_trees", "mlp", "cnn2d", "baseline"):
    MODEL_INDEX[_id]["modalities"] = ["tabular", "image"]
MODEL_INDEX["cnn2d"]["description"] = ("The classic image network: small filters slide over the picture to find edges, strokes and shapes, "
                                       "pooling shrinks it, then dense layers decide. Needs image data.")


def is_nn(model_id: str) -> bool:
    return bool(MODEL_INDEX.get(model_id, {}).get("nn"))


def modalities_of(m: dict) -> list[str]:
    return m.get("modalities") or ["tabular"]


def public_registry(task: str | None = None, modality: str | None = None) -> list[dict]:
    """Every model (incl. hidden reference models, flagged `hidden`) for the task and data modality."""
    out = []
    for m in MODELS:
        if task is not None and task not in m["tasks"]:
            continue
        if modality is not None and modality not in modalities_of(m):
            continue
        out.append({**m, "modalities": modalities_of(m)})
    return out
