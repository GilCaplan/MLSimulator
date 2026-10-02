"""Fit classic estimators with live progress, curves and cooperative cancellation."""
from __future__ import annotations

import time

import numpy as np

from ..util.jsonable import r
from .evaluate import score_of
from .registry import build_estimator


class Cancelled(Exception):
    pass


def _check(cancel):
    if cancel is not None and cancel.is_set():
        raise Cancelled()


def _val_or_train(prepared):
    if len(prepared.y_val):
        return prepared.X_val, prepared.y_val
    return prepared.X_test, prepared.y_test


def fit_classic(model_id, params, prepared, emit, cancel, key, seed=42, n_jobs=-1, calibrate=None):
    """Returns (fitted_estimator, curve dict | None). `calibrate` = sigmoid | isotonic wraps the model so its
    probabilities match observed frequencies (3-fold internal calibration)."""
    task = prepared.task
    if calibrate in ("sigmoid", "isotonic") and task == "classification":
        from sklearn.calibration import CalibratedClassifierCV
        base = build_estimator(model_id, task, params, n_classes=len(prepared.classes or []), seed=seed)
        emit("iteration", {"key": key, "i": 0, "n": 0})
        _check(cancel)
        est = CalibratedClassifierCV(base, method=calibrate, cv=3).fit(prepared.X_train, prepared.y_train)
        _check(cancel)
        return est, None
    X, y = prepared.X_train, prepared.y_train
    Xv, yv = _val_or_train(prepared)
    n_classes = len(prepared.classes) if prepared.classes else 0
    est = build_estimator(model_id, task, params, n_classes=n_classes, seed=seed)
    metric = "accuracy" if task == "classification" else "r2"
    points: list[dict] = []
    last = [0.0]

    def tick(i, n, **vals):
        now = time.time()
        if now - last[0] > 0.08 or i == n:
            last[0] = now
            emit("iteration", {"key": key, "i": int(i), "n": int(n), **{k: r(v) for k, v in vals.items()}})

    _check(cancel)
    if model_id == "xgboost":
        from xgboost.callback import TrainingCallback
        n = int(est.get_params()["n_estimators"])

        class CB(TrainingCallback):
            def after_iteration(self, model, epoch, evals_log):
                vals = {}
                for ds, name in (("validation_0", "train_loss"), ("validation_1", "val_loss")):
                    if ds in evals_log:
                        m = next(iter(evals_log[ds].values()))
                        vals[name] = m[-1]
                if epoch % max(1, n // 60) == 0 or epoch == n - 1:
                    points.append({"step": epoch + 1, **{k: r(v) for k, v in vals.items()}})
                tick(epoch + 1, n, **vals)
                return bool(cancel is not None and cancel.is_set())

        est.set_params(callbacks=[CB()])
        est.fit(X, y, eval_set=[(X, y), (Xv, yv)], verbose=False)
        est.set_params(callbacks=None)
        _check(cancel)
        return est, {"x_label": "boosting rounds", "loss": "log-loss" if task == "classification" else "RMSE", "points": points}

    if model_id == "lightgbm":
        n = int(est.get_params()["n_estimators"])

        def cb(env):
            if cancel is not None and cancel.is_set():
                raise Cancelled()
            vals = {}
            for (ds, _m, v, _hb) in env.evaluation_result_list:
                vals["train_loss" if ds in ("training", "train") else "val_loss"] = v
            i = env.iteration + 1
            if i % max(1, n // 60) == 0 or i == n:
                points.append({"step": i, **{k: r(v) for k, v in vals.items()}})
            tick(i, n, **vals)

        est.fit(X, y, eval_set=[(X, y), (Xv, yv)], eval_names=["train", "val"], callbacks=[cb])
        return est, {"x_label": "boosting rounds", "loss": "log-loss" if task == "classification" else "L2", "points": points}

    if model_id in ("random_forest", "extra_trees"):
        n_total = int(est.get_params()["n_estimators"])
        chunks = max(1, min(10, n_total // 10))
        est.set_params(warm_start=True)
        for c in range(1, chunks + 1):
            _check(cancel)
            n_now = max(1, round(n_total * c / chunks))
            est.set_params(n_estimators=n_now)
            est.fit(X, y)
            tr = score_of(task, y[:3000], est.predict(X[:3000]))
            va = score_of(task, yv, est.predict(Xv))
            points.append({"step": n_now, "train_score": r(tr), "val_score": r(va)})
            tick(c, chunks, train_score=tr, val_score=va)
        est.set_params(warm_start=False)
        return est, {"x_label": "trees", "score": metric, "points": points}

    if model_id == "gradient_boosting":
        n = int(est.get_params()["n_estimators"])

        def monitor(i, e, _locals):
            tick(i + 1, n, train_loss=e.train_score_[i])
            return bool(cancel is not None and cancel.is_set())

        est.fit(X, y, monitor=monitor)
        _check(cancel)
        return est, _staged_curve(est, prepared, task, metric, "boosting rounds")

    emit("iteration", {"key": key, "i": 0, "n": 0})  # indeterminate progress
    est.fit(X, y)
    _check(cancel)
    if model_id in ("adaboost", "hist_gradient_boosting"):
        return est, _staged_curve(est, prepared, task, metric, "boosting rounds")
    return est, None


def _staged_curve(est, prepared, task, metric, label):
    if not hasattr(est, "staged_predict"):
        return None
    X, y = prepared.X_train[:3000], prepared.y_train[:3000]
    Xv, yv = _val_or_train(prepared)
    tr = [score_of(task, y, p) for p in est.staged_predict(X)]
    va = [score_of(task, yv, p) for p in est.staged_predict(Xv)]
    n = len(tr)
    step = max(1, n // 60)
    pts = [{"step": i + 1, "train_score": r(tr[i]), "val_score": r(va[i])} for i in range(0, n, step)]
    if n and pts[-1]["step"] != n:
        pts.append({"step": n, "train_score": r(tr[-1]), "val_score": r(va[-1])})
    return {"x_label": label, "score": metric, "points": pts}


def cross_validate(model_id, params, prepared, folds, emit, cancel, key, seed=42, scoring=None):
    """K-fold CV on the original (pre-resampling) training rows, re-applying resampling inside each fold."""
    from sklearn.base import clone
    from sklearn.model_selection import KFold, StratifiedKFold

    from .pipeline import resample
    task = prepared.task
    X, y = prepared.X_train_orig, prepared.y_train_orig
    folds = max(2, min(int(folds), 10))
    if task == "classification" and np.bincount(y).min() >= folds:
        splitter = StratifiedKFold(folds, shuffle=True, random_state=seed)
    else:
        splitter = KFold(folds, shuffle=True, random_state=seed)
    base = build_estimator(model_id, task, params, n_classes=len(prepared.classes or []), seed=seed)
    rs = prepared.spec.get("resample", {})
    scores = []
    for i, (tr, va) in enumerate(splitter.split(X, y)):
        _check(cancel)
        Xt, yt = X[tr], y[tr]
        if task == "classification" and (rs.get("mode", "none") != "none" or rs.get("clean", "none") != "none"):
            Xt, yt, _, _ = resample(Xt, yt, rs, prepared.classes, seed, prepared.resample_groups, prepared.resample_lohi)
        m = clone(base).fit(Xt, yt)
        s = _score(scoring, task, m, X[va], y[va])
        scores.append(s)
        emit("cv.fold", {"key": key, "fold": i + 1, "folds": folds, "score": r(s)})
    return {"scores": [r(s) for s in scores], "mean": r(np.mean(scores)), "std": r(np.std(scores)),
            "metric": scoring or ("accuracy" if task == "classification" else "r2")}


def _score(scoring, task, model, X, y):
    from sklearn import metrics as M
    if not scoring:
        return score_of(task, y, model.predict(X))
    if scoring in ("f1", "f1_macro"):
        return M.f1_score(y, model.predict(X), average="macro")
    if scoring == "balanced_accuracy":
        return M.balanced_accuracy_score(y, model.predict(X))
    if scoring == "roc_auc":
        p = model.predict_proba(X)
        return M.roc_auc_score(y, p[:, 1]) if p.shape[1] == 2 else M.roc_auc_score(y, p, multi_class="ovr")
    if scoring == "neg_rmse":
        return -float(np.sqrt(M.mean_squared_error(y, model.predict(X))))
    if scoring == "neg_mae":
        return -float(M.mean_absolute_error(y, model.predict(X)))
    return score_of(task, y, model.predict(X))
