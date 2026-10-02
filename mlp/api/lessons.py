from __future__ import annotations

import json
import shutil

import numpy as np
import threading
import time

from fastapi import APIRouter, Body, HTTPException

from ..config import DATA_DIR
from ..core import procs
from ..core.jobs import manager
from ..core.registry import MODEL_INDEX, defaults
from ..core.store import datasets, new_id, prepared_store, projects
from ..lessons.catalog import LESSON_INDEX, LESSONS
from ..lessons.generators import FORECAST_LESSONS, GENERATORS, IMAGE_LESSONS, RECSYS_LESSONS, TEXT_LESSONS, UNSUPERVISED_LESSONS
from ..lessons.grading import CHALLENGES, goal_label, grade, grade_metrics
from ..util.jsonable import jsonable

router = APIRouter()
ROOT = DATA_DIR / "lessons"
ROOT.mkdir(parents=True, exist_ok=True)
PROGRESS = ROOT / "progress.json"
_lock = threading.Lock()
DATA_SEED = 7


def _progress() -> dict:
    try:
        return json.loads(PROGRESS.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _save_progress(p: dict):
    tmp = PROGRESS.with_suffix(".tmp")
    tmp.write_text(json.dumps(p))
    tmp.replace(PROGRESS)


def _update(lid: str, **fields) -> dict:
    with _lock:
        p = _progress()
        cur = p.get(lid, {})
        cur.update(fields)
        p[lid] = cur
        _save_progress(p)
        return cur


def _challenge_public(lid: str, completed: bool) -> dict:
    lesson, ch = LESSON_INDEX[lid], CHALLENGES[lid]
    out = {k: v for k, v in lesson["challenge"].items() if k != "solution"}
    out.update({"task_type": ch["task"], "target": ch["target"], "positive": ch.get("positive"), "group": ch.get("group"),
                "goals": [{**g, "label": goal_label(ch, g)} for g in ch["goals"]],
                "allowed_models": ch.get("allowed_models")})
    if completed:
        out["solution"] = lesson["challenge"]["solution"]
    return out


@router.get("/lessons")
def list_lessons():
    prog = _progress()
    return [{"id": l["id"], "order": l["order"], "stage": l["stage"], "emoji": l["emoji"], "title": l["title"],
             "tagline": l["tagline"], "modeled_on": l["modeled_on"], "progress": prog.get(l["id"], {})} for l in LESSONS]


@router.get("/lessons/{lid}")
def get_lesson(lid: str):
    lesson = LESSON_INDEX[lid]
    prog = _progress().get(lid, {})
    return {**{k: v for k, v in lesson.items() if k != "challenge"}, "challenge": _challenge_public(lid, bool(prog.get("completed_at"))),
            "progress": prog}


@router.post("/lessons/{lid}/progress")
def set_progress(lid: str, body: dict = Body(...)):
    LESSON_INDEX[lid]
    allowed = {k: v for k, v in body.items() if k in ("quiz_passed", "demo_done", "learn_done")}
    return _update(lid, **allowed)


@router.post("/lessons/{lid}/start")
def start_challenge(lid: str):
    lesson, ch = LESSON_INDEX[lid], CHALLENGES[lid]
    train, _ = GENERATORS[lid](seed=DATA_SEED)
    meta = {"name": lesson["challenge"]["dataset_name"], "source": "lesson", "lesson": lid, "task_hint": ch["task"], "target_hint": ch["target"]}
    if lid in TEXT_LESSONS:
        meta.update(modality="text", text_column=ch["text_column"])
    if lid in RECSYS_LESSONS:
        meta.update(modality="ratings", items=train.items.to_dict("records"),
                    columns={"user": "user", "item": "item", "rating": "rating", "time": "day"})
        did = datasets.put(train.ratings, meta)
    elif lid in IMAGE_LESSONS:
        did = datasets.put(train.frame, meta, images=train.images)
    elif lid in FORECAST_LESSONS:
        meta.update(modality="timeseries", columns=dict(ch["columns"]), exog=list(ch["exog"]), horizon=ch["horizon"])
        did = datasets.put(train, meta)
    else:
        did = datasets.put(train, meta)
    models = []
    for mid in ch["preset_models"]:
        params = {**defaults(mid), **ch.get("preset_params", {}).get(mid, {})}
        models.append({"key": new_id("m"), "model_id": mid, "params": params, "nn_arch": MODEL_INDEX[mid].get("default_arch")})
    unsup = lid in UNSUPERVISED_LESSONS or lid in RECSYS_LESSONS or lid in FORECAST_LESSONS
    project = projects.create({"name": f"{lesson['emoji']} {lesson['challenge']['title']}", "task": ch["task"], "step": "data",
                               "modality": ch.get("modality", "tabular"), "truth": ch.get("truth"),
                               "dataset_id": did, "target": None if unsup else ch["target"], "pipeline": ch.get("preset_pipeline") or None,
                               "models": models, "challenge": {"lesson_id": lid}})
    prog = _progress().get(lid, {})
    _update(lid, started_at=prog.get("started_at") or time.time(), project_id=project["id"])
    return project


@router.post("/lessons/{lid}/check")
def check(lid: str, body: dict = Body(...)):
    ch = CHALLENGES[lid]
    job_id, key = body["job_id"], body["key"]
    result = manager.load_result(job_id)
    if not result or key not in result.get("models", {}):
        raise HTTPException(404, "That trained model is no longer available — train again.")
    res = result["models"][key]
    if res.get("baseline"):
        raise HTTPException(400, "The baseline is just a reference — check one of your trained models.")
    if ch.get("allowed_models") and res["model_id"] not in ch["allowed_models"]:
        names = ", ".join(MODEL_INDEX[m]["label"] for m in ch["allowed_models"])
        raise HTTPException(400, f"This challenge must be solved with: {names}.")
    prepared = prepared_store.get(result["prepared_id"])
    try:
        meta = datasets.meta(prepared.dataset_id)
    except KeyError:
        meta = {}
    if meta.get("lesson") != lid:
        raise HTTPException(400, "This model wasn't trained on the challenge dataset. Start the challenge from its lesson page.")
    src = DATA_DIR / "jobs" / job_id / f"{key}.joblib"
    d = ROOT / "checks" / f"{job_id}_{key}"
    d.mkdir(parents=True, exist_ok=True)
    if not (d / "model.joblib").exists():
        import joblib
        from ..core.library import preprocessor_for
        shutil.copy(src, d / "model.joblib")
        joblib.dump(preprocessor_for(prepared, res["model_id"]), d / "preprocessor.joblib")
    train, hidden = GENERATORS[lid](seed=DATA_SEED)
    if lid in RECSYS_LESSONS or lid in FORECAST_LESSONS:
        if lid in FORECAST_LESSONS:
            vals = procs.call(res["family"], "lesson_eval", model_dir=str(d), hidden=hidden, kind="forecast")
            own = res["metrics"].get("test", {}).get("mae")
            vals["error_ratio"] = vals["mae"] / own if own else None
            vals["users_evaluated"] = vals.get("n", 0)
        else:
            vals = procs.call(res["family"], "lesson_eval", model_dir=str(d), hidden=train.hidden, seeds=train.seeds)
        graded = grade_metrics(lid, vals, vals)
        if lid in FORECAST_LESSONS:
            graded["real_world"] = {k: vals.get(k) for k in ("mae", "mase", "smape", "rmse")}
        graded.update({"model": res["label"], "model_id": res["model_id"], "key": key, "job_id": job_id,
                       "your_test": res["metrics"].get("test", {}), "checked_at": time.time()})
        prog = _progress().get(lid, {})
        fields = {"attempts": prog.get("attempts", 0) + 1, "last_check": graded}
        if graded["passed"] and not prog.get("completed_at"):
            fields["completed_at"] = time.time()
        _update(lid, **fields)
        if graded["passed"]:
            graded["solution"] = LESSON_INDEX[lid]["challenge"]["solution"]
        return jsonable(graded)
    if lid in IMAGE_LESSONS:
        out = procs.call(res["family"], "predict_arrays", model_dir=str(d), images=np.asarray(hidden.images))
        hidden, train = hidden.frame, train.frame
    elif lid in TEXT_LESSONS:
        out = procs.call(res["family"], "predict_text", model_dir=str(d), texts=hidden[ch["text_column"]].astype(str).tolist())
    elif lid in UNSUPERVISED_LESSONS:
        a = procs.call(res["family"], "assign", model_dir=str(d), rows=hidden.drop(columns=[ch["truth"]]).to_dict("records"))
        out = {"predictions": a.get("cluster", [])}
    else:
        out = procs.call(res["family"], "predict_frame", model_dir=str(d), frame=hidden.drop(columns=[ch["target"]]))
    baseline_value = float(train[ch["target"]].mean()) if ch["task"] == "regression" else None
    try:
        graded = grade(lid, hidden, out["predictions"], out.get("probabilities"), out.get("classes"),
                       res["metrics"].get("test", {}), baseline_value)
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    graded.update({"model": res["label"], "model_id": res["model_id"], "key": key, "job_id": job_id,
                   "your_test": res["metrics"].get("test", {}), "checked_at": time.time()})
    prog = _progress().get(lid, {})
    attempts = prog.get("attempts", 0) + 1
    fields = {"attempts": attempts, "last_check": graded}
    if graded["passed"] and not prog.get("completed_at"):
        fields["completed_at"] = time.time()
    _update(lid, **fields)
    if graded["passed"]:
        graded["solution"] = LESSON_INDEX[lid]["challenge"]["solution"]
    return jsonable(graded)
