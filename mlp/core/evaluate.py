"""Metrics, curves, confusion matrices, importances and decision surfaces."""
from __future__ import annotations

import time

import numpy as np
import pandas as pd

from ..util.jsonable import r


def predict_proba_safe(model, X):
    if hasattr(model, "predict_proba"):
        try:
            return np.asarray(model.predict_proba(X))
        except Exception:  # noqa: BLE001 - some estimators expose but cannot compute proba
            return None
    return None


def cls_metrics(y, pred, proba, n_classes) -> dict:
    from sklearn import metrics as M
    out = {
        "accuracy": M.accuracy_score(y, pred),
        "balanced_accuracy": M.balanced_accuracy_score(y, pred),
        "precision": M.precision_score(y, pred, average="macro", zero_division=0),
        "recall": M.recall_score(y, pred, average="macro", zero_division=0),
        "f1": M.f1_score(y, pred, average="macro", zero_division=0),
        "f1_weighted": M.f1_score(y, pred, average="weighted", zero_division=0),
        "mcc": M.matthews_corrcoef(y, pred) if len(np.unique(y)) > 1 else 0.0,
    }
    if proba is not None and len(np.unique(y)) > 1:
        try:
            p = np.clip(proba, 1e-7, 1)
            p = p / p.sum(1, keepdims=True)
            out["log_loss"] = M.log_loss(y, p, labels=list(range(n_classes)))
            if n_classes == 2:
                out["roc_auc"] = M.roc_auc_score(y, proba[:, 1])
                out["avg_precision"] = M.average_precision_score(y, proba[:, 1])
            else:
                out["roc_auc"] = M.roc_auc_score(y, p, multi_class="ovr", average="macro",
                                                 labels=list(range(n_classes)))
        except ValueError:
            pass
    return {k: r(v) for k, v in out.items()}


def reg_metrics(y, pred) -> dict:
    from sklearn import metrics as M
    y, pred = np.asarray(y, float), np.asarray(pred, float)
    mse = float(M.mean_squared_error(y, pred))
    out = {"r2": M.r2_score(y, pred), "mae": M.mean_absolute_error(y, pred), "rmse": float(np.sqrt(mse)), "mse": mse,
           "median_ae": float(np.median(np.abs(y - pred))) if len(y) else 0.0, "max_error": float(np.max(np.abs(y - pred))) if len(y) else 0.0,
           "explained_variance": M.explained_variance_score(y, pred)}
    nz = np.abs(y) > 1e-9
    if nz.mean() > 0.9:
        out["mape"] = float(np.mean(np.abs((y[nz] - pred[nz]) / y[nz])))
    return {k: r(v) for k, v in out.items()}


def score_of(task, y, pred) -> float:
    if task == "classification":
        return float(np.mean(np.asarray(y) == np.asarray(pred)))
    from sklearn.metrics import r2_score
    return float(r2_score(y, pred))


def _downsample(xs, ys, n=150):
    xs, ys = np.asarray(xs), np.asarray(ys)
    if len(xs) > n:
        idx = np.unique(np.linspace(0, len(xs) - 1, n).astype(int))
        xs, ys = xs[idx], ys[idx]
    return [r(v) for v in xs], [r(v) for v in ys]


def permutation_importance(model, X, y, task, names, seed=0, max_rows=800, repeats=3):
    rng = np.random.default_rng(seed)
    if len(X) > max_rows:
        idx = rng.choice(len(X), max_rows, replace=False)
        X, y = X[idx], y[idx]
    base = score_of(task, y, model.predict(X))
    vals = []
    for j in range(X.shape[1]):
        drops = []
        for _ in range(repeats):
            Xp = X.copy()
            Xp[:, j] = Xp[rng.permutation(len(Xp)), j]
            drops.append(base - score_of(task, y, model.predict(Xp)))
        vals.append(float(np.mean(drops)))
    return vals


def importance(model, prepared, seed=0) -> dict | None:
    names = prepared.feature_names
    est = model
    vals, method = None, None
    if hasattr(est, "feature_importances_"):
        try:
            vals, method = np.asarray(est.feature_importances_, float), "built-in (tree splits)"
        except Exception:  # noqa: BLE001
            vals = None
    if vals is None and hasattr(est, "coef_"):
        c = np.asarray(est.coef_, float)
        vals = np.abs(c).mean(axis=0) if c.ndim > 1 else np.abs(c)
        method = "size of coefficients"
    if (vals is None or len(vals) != len(names)) and len(names) <= 120:
        X, y = (prepared.X_test, prepared.y_test)
        vals, method = np.asarray(permutation_importance(model, X, y, prepared.task, names, seed)), "permutation (shuffle test)"
    if vals is None or len(vals) != len(names):
        return None
    order = np.argsort(-np.abs(vals))[:25]
    return {"names": [names[i] for i in order], "values": [r(vals[i]) for i in order], "method": method}


def decision_surface(model, prepared, res: int = 48) -> dict | None:
    """Predictions over a grid in the 2-D projection plane used for the scatter plots."""
    X = prepared.X_train_orig
    y = prepared.y_train_orig
    nf = X.shape[1]
    rng = np.random.default_rng(1)
    idx = np.arange(len(X)) if len(X) <= 600 else rng.choice(len(X), 600, replace=False)
    lab = (lambda v: prepared.classes[int(v)]) if prepared.task == "classification" else (lambda v: r(prepared.preprocessor.decode_y([v])[0], 3))
    if nf == 1:
        lo, hi = float(X[:, 0].min()), float(X[:, 0].max())
        pad = (hi - lo) * 0.05 or 1
        xs = np.linspace(lo - pad, hi + pad, 160, dtype=np.float32)[:, None]
        pred = model.predict(xs)
        if prepared.task == "regression":
            pred = prepared.preprocessor.decode_y(pred)
        return {"kind": "curve", "xs": [r(v) for v in xs[:, 0]], "pred": [r(v) for v in pred] if prepared.task == "regression" else [int(v) for v in pred],
                "points": [{"x": r(X[i, 0], 3), "y": r(prepared.preprocessor.decode_y([y[i]])[0], 3) if prepared.task == "regression" else int(y[i]), "label": lab(y[i])} for i in idx]}
    pca = prepared.pca
    P = pca.transform(X) if pca is not None else X[:, :2]
    (x0, y0), (x1, y1) = P.min(0), P.max(0)
    px, py = (x1 - x0) * 0.08 or 1, (y1 - y0) * 0.08 or 1
    gx = np.linspace(x0 - px, x1 + px, res)
    gy = np.linspace(y0 - py, y1 + py, res)
    G = np.array([[a, b] for b in gy for a in gx])
    Xg = pca.inverse_transform(G).astype(np.float32) if pca is not None else G.astype(np.float32)
    t = time.time()
    pred = model.predict(Xg)
    if time.time() - t > 20:
        return None
    if prepared.task == "classification":
        proba = predict_proba_safe(model, Xg)
        conf = proba.max(1) if proba is not None else np.ones(len(pred))
        grid = [int(v) for v in pred]
        extra = {"confidence": [r(v, 2) for v in conf]}
    else:
        grid = [r(v, 3) for v in prepared.preprocessor.decode_y(pred)]
        extra = {}
    return {"kind": "grid", "nx": res, "ny": res, "x": [r(gx[0]), r(gx[-1])], "y": [r(gy[0]), r(gy[-1])], "grid": grid,
            "exact": pca is None, **extra,
            "points": [{"x": r(P[i, 0], 3), "y": r(P[i, 1], 3), "label": lab(y[i]), "c": int(y[i]) if prepared.task == "classification" else None} for i in idx]}


def calibration(y, proba, classes, bins: int = 10) -> dict | None:
    """Reliability curve: predicted probability vs observed frequency (positive class for binary, top label otherwise)."""
    if proba is None or len(y) < 20:
        return None
    y = np.asarray(y)
    if proba.shape[1] == 2:
        p, hit, label = proba[:, 1], (y == 1).astype(float), f"P({classes[1]})"
    else:
        p, hit, label = proba.max(1), (proba.argmax(1) == y).astype(float), "confidence of top answer"
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    rows, ece = [], 0.0
    for b in range(bins):
        m = idx == b
        if m.sum() == 0:
            continue
        pm, fm = float(p[m].mean()), float(hit[m].mean())
        ece += m.mean() * abs(pm - fm)
        rows.append({"p": r(pm), "freq": r(fm), "n": int(m.sum()), "lo": r(edges[b], 2), "hi": r(edges[b + 1], 2)})
    brier = float(np.mean((p - hit) ** 2))
    return {"bins": rows, "ece": r(ece), "brier": r(brier), "label": label}


def mistakes(prepared, pred, proba, k: int = 30) -> dict | None:
    raw = prepared.raw_test
    if raw is None or len(raw) != len(prepared.y_test):
        return None
    pp = prepared.preprocessor
    cols = [c for c in raw.columns if c != prepared.target][:14]
    y = prepared.y_test
    if prepared.task == "classification":
        wrong = np.where(pred != y)[0]
        conf = proba.max(1) if proba is not None else np.ones(len(y))
        order = wrong[np.argsort(-conf[wrong])][:k]
        rows = [{"values": [_cell(raw.iloc[i][c]) for c in cols], "true": prepared.classes[int(y[i])], "pred": prepared.classes[int(pred[i])],
                 "confidence": r(conf[i], 3)} for i in order]
        summary = {"wrong": int(len(wrong)), "total": int(len(y))}
    else:
        yt, yp = pp.decode_y(y), pp.decode_y(pred)
        err = yp - yt
        order = np.argsort(-np.abs(err))[:k]
        rows = [{"values": [_cell(raw.iloc[i][c]) for c in cols], "true": r(yt[i], 4), "pred": r(yp[i], 4), "error": r(err[i], 4)} for i in order]
        summary = {"mae": r(np.mean(np.abs(err))), "total": int(len(y))}
    return {"columns": cols, "rows": rows, **summary}


def slices(prepared, pred, max_columns: int = 6) -> list[dict]:
    """Per-group performance on the test rows: where is the model weakest?"""
    raw = prepared.raw_test
    if raw is None or len(raw) != len(prepared.y_test) or len(raw) < 30:
        return []
    pp = prepared.preprocessor
    y = prepared.y_test
    if prepared.task == "classification":
        good = (pred == y).astype(float)
        metric, overall, better = "accuracy", float(good.mean()), "higher"
    else:
        good = np.abs(pp.decode_y(pred) - pp.decode_y(y))
        metric, overall, better = "mean error", float(good.mean()), "lower"
    out = []
    for c in [c for c in raw.columns if c != prepared.target][:20]:
        s = raw[c]
        if pd.api.types.is_numeric_dtype(s) and s.nunique() > 8:
            try:
                g = pd.qcut(s, 4, duplicates="drop").astype(str)
            except ValueError:
                continue
        elif s.nunique() <= 15:
            g = s.astype("object").where(s.notna(), "(missing)").astype(str)
        else:
            continue
        groups = []
        for label, ix in pd.Series(np.arange(len(g))).groupby(g.to_numpy()):
            if len(ix) >= 10:
                groups.append({"label": str(label), "n": int(len(ix)), "value": r(good[ix.to_numpy()].mean())})
        if len(groups) < 2:
            continue
        vals = [x["value"] for x in groups]
        out.append({"column": str(c), "metric": metric, "better": better, "overall": r(overall), "spread": r(max(vals) - min(vals)),
                    "groups": sorted(groups, key=lambda x: x["value"], reverse=better == "lower")})
    return sorted(out, key=lambda x: -x["spread"])[:max_columns]


def _cell(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (np.floating, float)):
        return r(v, 4)
    if isinstance(v, (np.integer,)):
        return int(v)
    return str(v) if not isinstance(v, (int, bool)) else v


def evaluate(model, prepared, seed=0, with_surface=True, with_importance=True) -> dict:
    task = prepared.task
    is_image = getattr(prepared, "modality", "tabular") == "image"
    is_text = getattr(prepared, "modality", "tabular") == "text"
    if is_image or is_text:
        with_surface, with_importance = False, False
    pp = prepared.preprocessor
    out: dict = {"metrics": {}}
    sets = {"train": (prepared.X_train_orig, prepared.y_train_orig), "val": (prepared.X_val, prepared.y_val),
            "test": (prepared.X_test, prepared.y_test)}
    t0 = time.time()
    preds = {}
    for name, (X, y) in sets.items():
        if len(y) == 0:
            continue
        pred = np.asarray(model.predict(X))
        if task == "classification":
            proba = predict_proba_safe(model, X)
            out["metrics"][name] = cls_metrics(y, pred.astype(int), proba, len(prepared.classes))
            preds[name] = (pred.astype(int), proba)
        else:
            yt, yp = pp.decode_y(y), pp.decode_y(pred)
            out["metrics"][name] = reg_metrics(yt, yp)
            preds[name] = (yp, None)
    out["predict_ms_per_1k"] = r((time.time() - t0) / max(1, sum(len(s[1]) for s in sets.values())) * 1e6, 2)

    y_test = prepared.y_test
    if task == "classification":
        from sklearn.metrics import confusion_matrix, precision_recall_curve, roc_curve
        pred, proba = preds["test"]
        k = len(prepared.classes)
        out["confusion"] = {"labels": prepared.classes, "matrix": confusion_matrix(y_test, pred, labels=list(range(k))).tolist()}
        if proba is not None and len(np.unique(y_test)) > 1:
            if k == 2:
                fpr, tpr, _ = roc_curve(y_test, proba[:, 1])
                fx, fy = _downsample(fpr, tpr)
                out["roc"] = [{"label": prepared.classes[1], "fpr": fx, "tpr": fy, "auc": out["metrics"]["test"].get("roc_auc")}]
                pr_, rc_, _ = precision_recall_curve(y_test, proba[:, 1])
                rx, ry = _downsample(rc_[::-1], pr_[::-1])
                out["pr"] = {"recall": rx, "precision": ry}
                ths = np.round(np.arange(0.05, 0.96, 0.05), 2)
                rows = []
                for th in ths:
                    pp_ = (proba[:, 1] >= th).astype(int)
                    tp = int(((pp_ == 1) & (y_test == 1)).sum()); fp = int(((pp_ == 1) & (y_test == 0)).sum())
                    fn = int(((pp_ == 0) & (y_test == 1)).sum()); tn = int(((pp_ == 0) & (y_test == 0)).sum())
                    prec = tp / (tp + fp) if tp + fp else 0.0
                    rec = tp / (tp + fn) if tp + fn else 0.0
                    rows.append({"t": float(th), "precision": r(prec), "recall": r(rec), "f1": r(2 * prec * rec / (prec + rec) if prec + rec else 0),
                                 "accuracy": r((tp + tn) / len(y_test)), "tp": tp, "fp": fp, "fn": fn, "tn": tn})
                out["thresholds"] = rows
            else:
                from sklearn.preprocessing import label_binarize
                Yb = label_binarize(y_test, classes=list(range(k)))
                rocs = []
                for c in range(min(k, 10)):
                    if Yb[:, c].sum() == 0:
                        continue
                    fpr, tpr, _ = roc_curve(Yb[:, c], proba[:, c])
                    from sklearn.metrics import auc
                    fx, fy = _downsample(fpr, tpr, 80)
                    rocs.append({"label": prepared.classes[c], "fpr": fx, "tpr": fy, "auc": r(auc(fpr, tpr))})
                out["roc"] = rocs
    else:
        yt, yp = pp.decode_y(y_test), preds["test"][0]
        idx = np.arange(len(yt))
        if len(idx) > 800:
            idx = np.random.default_rng(0).choice(len(idx), 800, replace=False)
        out["residuals"] = {"points": [{"t": r(yt[i], 4), "p": r(yp[i], 4)} for i in idx]}
        res = yt - yp
        h, e = np.histogram(res, bins=24)
        out["residuals"]["hist"] = {"edges": [r(v) for v in e], "counts": h.tolist()}
        try:
            out["residuals"]["hetero_r"] = r(np.corrcoef(np.abs(res), yp)[0, 1], 3)
        except Exception:  # noqa: BLE001
            pass
    raw_pred = np.asarray(model.predict(prepared.X_test))
    test_proba = preds["test"][1]
    if task == "classification":
        raw_pred = raw_pred.astype(int)
        out["calibration"] = calibration(y_test, test_proba, prepared.classes)
    if is_image:
        from .vision_eval import vision_extras
        out["vision"] = vision_extras(model, prepared, raw_pred, test_proba)
    if is_text:
        from .text_eval import text_extras
        out["text"] = text_extras(model, prepared, raw_pred, test_proba)
    try:
        out["mistakes"] = mistakes(prepared, raw_pred, test_proba)
        out["slices"] = slices(prepared, raw_pred)
    except Exception as e:  # noqa: BLE001
        out.setdefault("notes", []).append(f"Error analysis unavailable: {e}")
    try:
        out["importance"] = importance(model, prepared, seed) if with_importance else None
    except Exception as e:  # noqa: BLE001
        out["importance"] = None
        out.setdefault("notes", []).append(f"Importance unavailable: {e}")
    if with_surface:
        try:
            out["surface"] = decision_surface(model, prepared)
        except Exception as e:  # noqa: BLE001
            out["surface"] = None
    return out
