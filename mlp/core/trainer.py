"""Job functions executed by the JobManager thread (they delegate heavy work to child processes)."""
from __future__ import annotations

from ..config import DATA_DIR
from . import coach
from .jobs import Cancelled, manager
from .procs import family, run_in_process
from .registry import MODEL_INDEX
from .store import prepared_store

CLS_PRIMARY = "accuracy"
REG_PRIMARY = "r2"


def run_baseline(prepared) -> dict:
    """The 'always guess the most common class / the average' reference, trained on the real (pre-resampling) rows."""
    import time

    from .evaluate import evaluate
    from .registry import build_estimator
    t0 = time.time()
    est = build_estimator("baseline", prepared.task).fit(prepared.X_train_orig, prepared.y_train_orig)
    res = evaluate(est, prepared, with_surface=False, with_importance=False)
    if prepared.task == "classification":
        label = f"Baseline · always “{prepared.classes[int(est.predict(prepared.X_test[:1])[0])]}”"
    else:
        label = f"Baseline · always {prepared.preprocessor.decode_y(est.predict(prepared.X_test[:1]))[0]:,.4g}"
    return {**res, "key": "baseline", "model_id": "baseline", "label": label, "params": {}, "nn_arch": None, "family": "classic",
            "baseline": True, "fit_time_s": round(time.time() - t0, 4), "curve": None, "notes": {}, "cv": None}


def run_forecast_baseline(prepared) -> dict:
    """'Same as last season' — the reference every forecast should beat (numpy only, runs in the API process)."""
    import time

    from .forecast import SEASON_NAME, evaluate_forecast, fit_forecast
    t0 = time.time()
    est = fit_forecast("fc_seasonal_naive", {}, prepared, lambda t, d: None, None, "baseline")
    res = evaluate_forecast(est, prepared)
    idx = prepared.preprocessor
    what = f"repeat last {SEASON_NAME[idx.freq]}" if idx.season > 1 and idx.freq in SEASON_NAME else "repeat the last value"
    return {**res, "key": "baseline", "model_id": "fc_seasonal_naive", "label": f"Baseline · {what}", "params": {}, "nn_arch": None,
            "family": "classic", "baseline": True, "fit_time_s": round(time.time() - t0, 4), "notes": {}, "cv": None}


def leaderboard(results: dict, task: str, modality: str = "tabular") -> list[dict]:
    from .problems import problem_for
    prob = problem_for(task, modality) or {}
    metric = prob.get("primary_metric") or (CLS_PRIMARY if task == "classification" else REG_PRIMARY)
    lower = bool(prob.get("lower_is_better"))
    rows = []
    for key, res in results.items():
        test = res.get("metrics", {}).get("test", {})
        train = res.get("metrics", {}).get("train", {})
        rows.append({"key": key, "model_id": res["model_id"], "label": res["label"], "score": test.get(metric),
                     "train_score": train.get(metric), "fit_time_s": res.get("fit_time_s"), "metric": metric,
                     "baseline": bool(res.get("baseline"))})
    rows.sort(key=lambda r: (r["score"] if r["score"] is not None else 1e18) if lower else -(r["score"] if r["score"] is not None else -1e18))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


def run_train(job):
    req = job.request
    prepared = prepared_store.get(req["prepared_id"])
    models = req["models"]
    options = req.get("options") or {}
    job_dir = DATA_DIR / "jobs" / job.id
    job_dir.mkdir(parents=True, exist_ok=True)
    results: dict = {}
    failures: dict = {}
    for i, m in enumerate(models):
        if job.cancel.is_set():
            raise Cancelled()
        key, model_id = m["key"], m["model_id"]
        spec = MODEL_INDEX[model_id]
        manager.emit(job, "model.started", {"key": key, "model_id": model_id, "label": spec["label"], "index": i,
                                            "total": len(models), "nn": bool(spec.get("nn"))})
        if spec.get("requires") == "image" and not prepared.image_shape:
            failures[key] = "Needs image data — load the handwritten digits sample (and skip feature selection)."
            manager.emit(job, "model.failed", {"key": key, "error": failures[key]})
            continue
        payload = {"family": family(model_id), "prepared_id": prepared.id, "model": m, "options": options,
                   "model_path": str(job_dir / f"{key}.joblib")}
        out = run_in_process(payload, lambda t, d: manager.emit(job, t, d), job.cancel, spec["label"])
        if out[0] == "cancelled":
            raise Cancelled()
        if out[0] == "error":
            failures[key] = out[1]
            manager.emit(job, "model.failed", {"key": key, "error": out[1]})
            print(out[2] if len(out) > 2 else "")
            continue
        res = {**out[1], "key": key, "model_id": model_id, "label": spec["label"], "params": m.get("params") or {},
               "nn_arch": m.get("nn_arch"), "family": family(model_id)}
        results[key] = res
        manager.emit(job, "model.finished", {"key": key, "metrics": res["metrics"], "fit_time_s": res["fit_time_s"],
                                             "curve": res.get("curve"), "cv": res.get("cv")})
    if not results:
        raise RuntimeError("Every model failed: " + "; ".join(f"{k}: {v}" for k, v in failures.items()))
    from .unsupervised import UNSUPERVISED_TASKS
    unsup = prepared.task in UNSUPERVISED_TASKS or prepared.task == "recommendation"
    try:
        if unsup:
            raise StopIteration
        if prepared.task == "forecasting":
            if any(r["model_id"] == "fc_seasonal_naive" for r in results.values()):
                raise StopIteration  # the learner already trains the reference model
            results["baseline"] = run_forecast_baseline(prepared)
            manager.emit(job, "log", {"level": "info", "message": "Added the seasonal-naive baseline for comparison."})
            raise StopIteration
        results["baseline"] = run_baseline(prepared)
        manager.emit(job, "log", {"level": "info", "message": "Added the baseline (always guessing) for comparison."})
    except StopIteration:
        pass
    except Exception as e:  # noqa: BLE001
        print("baseline failed:", e)
    lb = leaderboard(results, prepared.task, getattr(prepared, "modality", "tabular"))
    suggestions = (coach.recsys_suggestions(results, prepared) if prepared.task == "recommendation"
                   else coach.forecast_suggestions(results, prepared) if prepared.task == "forecasting"
                   else coach.unsupervised_suggestions(results, prepared) if unsup
                   else coach.results_suggestions(results, lb, prepared, req.get("models"), options))
    return {"job_id": job.id, "task": prepared.task, "prepared_id": prepared.id, "models": results, "failures": failures,
            "leaderboard": lb, "coach": suggestions, "classes": prepared.classes,
            "feature_names": prepared.feature_names, "options": options}


def run_tune(job):
    req = job.request
    prepared = prepared_store.get(req["prepared_id"])
    payload = {"family": family(req["model_id"]), "op": "tune", "prepared_id": prepared.id, **req}
    out = run_in_process(payload, lambda t, d: manager.emit(job, t, d), job.cancel, "tuning")
    if out[0] == "cancelled":
        raise Cancelled()
    if out[0] == "error":
        raise RuntimeError(out[1])
    return out[1]


def run_sweep_job(job):
    req = job.request
    prepared = prepared_store.get(req["prepared_id"])
    payload = {"family": "classic", "op": "sweep", "prepared_id": prepared.id, **req}
    out = run_in_process(payload, lambda t, d: manager.emit(job, t, d), job.cancel, "k sweep")
    if out[0] == "cancelled":
        raise Cancelled()
    if out[0] == "error":
        raise RuntimeError(out[1])
    return out[1]
