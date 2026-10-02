"""Try a trained model straight from a training run (before saving it): random test examples and your own inputs."""
from __future__ import annotations

import shutil

import numpy as np
from fastapi import APIRouter, Body, HTTPException

from ..config import DATA_DIR
from ..core import procs
from ..core.jobs import manager
from ..core.store import datasets, prepared_store
from ..util.jsonable import jsonable

router = APIRouter()
SUPPORTED = {("classification", "tabular"), ("regression", "tabular"), ("classification", "image"), ("regression", "image"),
             ("classification", "text")}


def _context(job_id: str, key: str):
    result = manager.load_result(job_id)
    if not result or key not in result.get("models", {}):
        raise HTTPException(404, "That trained model is no longer available — train again.")
    res = result["models"][key]
    if res.get("baseline"):
        raise HTTPException(400, "The baseline only ever gives one answer — try one of your trained models.")
    try:
        prepared = prepared_store.get(result["prepared_id"])
    except KeyError:
        raise HTTPException(404, "The prepared data for this run is gone — prepare and train again.") from None
    modality = getattr(prepared, "modality", "tabular")
    if (prepared.task, modality) not in SUPPORTED:
        raise HTTPException(400, "Manual testing is available for classification and regression models (tables, images, text). "
                                 "Use the Model Library playground for this kind of model.")
    d = DATA_DIR / "jobs" / job_id / f"try_{key}"
    if not (d / "model.joblib").exists():
        import joblib

        from ..core.library import preprocessor_for
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(DATA_DIR / "jobs" / job_id / f"{key}.joblib", d / "model.joblib")
        joblib.dump(preprocessor_for(prepared, res["model_id"]), d / "preprocessor.joblib")
    return result, res, prepared, modality, d


def _shape(out: dict, prepared, truth=None) -> dict:
    pred = out["predictions"][0]
    o = {"prediction": pred, "classes": out.get("classes") or prepared.classes}
    if out.get("probabilities") is not None:
        o["probabilities"] = out["probabilities"][0]
    if out.get("tokens") is not None:
        o["tokens"] = out["tokens"]
    if out.get("model_input") is not None:
        o["model_input"] = out["model_input"]
    if out.get("saliency") is not None:
        o["saliency"] = out["saliency"]
    if truth is not None:
        o["truth"] = truth
        if prepared.task == "classification":
            o["correct"] = str(pred) == str(truth)
        else:
            o["error"] = float(pred) - float(truth)
    return o


@router.get("/jobs/{job_id}/models/{key}/example")
def example(job_id: str, key: str, label: str | None = None, seed: int | None = None):
    """A random test example (optionally of one class) with the model's answer and the true answer."""
    result, res, prepared, modality, d = _context(job_id, key)
    rng = np.random.default_rng(seed)
    y = np.asarray(prepared.y_test)
    pool = np.arange(len(y))
    if label is not None and prepared.task == "classification" and prepared.classes:
        if label not in prepared.classes:
            raise HTTPException(400, f"Unknown class “{label}”.")
        pool = pool[y == prepared.classes.index(label)]
        if not len(pool):
            raise HTTPException(404, f"No test examples of “{label}”.")
    if not len(pool):
        raise HTTPException(404, "The test set is empty.")
    i = int(rng.choice(pool))
    truth = prepared.classes[int(y[i])] if prepared.task == "classification" else float(prepared.preprocessor.decode_y(y[i:i + 1])[0])
    fam = res["family"]
    if modality == "image":
        from ..core.images import png_data_uri
        idx = prepared.payload["idx_test"][i]
        img = np.asarray(datasets.images(prepared.dataset_id)[idx])
        uri = png_data_uri(img if img.shape[-1] != 1 else img[:, :, 0], 160)
        out = procs.call(fam, "predict_image", model_dir=str(d), images=[uri])
        payload = {"image": uri}
    elif modality == "text":
        text = prepared.payload["texts_test"][i]
        out = procs.call(fam, "predict_text", model_dir=str(d), texts=[text])
        payload = {"text": text}
    else:
        raw = prepared.raw_test
        if raw is None or i >= len(raw):
            raise HTTPException(404, "No raw test rows kept for this run — prepare and train again.")
        row = {k: v for k, v in raw.iloc[i].to_dict().items() if k != prepared.target}
        row = {k: (None if isinstance(v, float) and np.isnan(v) else v.item() if hasattr(v, "item") else v) for k, v in row.items()}
        out = procs.call(fam, "predict", model_dir=str(d), rows=[row])
        payload = {"row": row}
    return jsonable({"modality": modality, "task": prepared.task, "index": i, "n_pool": int(len(pool)), "input": payload,
                     "model": res["label"], **_shape(out, prepared, truth)})


@router.post("/jobs/{job_id}/models/{key}/try")
def try_inputs(job_id: str, key: str, body: dict = Body(...)):
    """Your own input: {image: dataURI} | {text: str} | {row: {col: value}}."""
    result, res, prepared, modality, d = _context(job_id, key)
    fam = res["family"]
    if modality == "image":
        if not body.get("image"):
            raise HTTPException(400, "Send an image.")
        out = procs.call(fam, "predict_image", model_dir=str(d), images=[body["image"]])
    elif modality == "text":
        if not str(body.get("text") or "").strip():
            raise HTTPException(400, "Type some text.")
        out = procs.call(fam, "predict_text", model_dir=str(d), texts=[str(body["text"])])
    else:
        if not isinstance(body.get("row"), dict):
            raise HTTPException(400, "Send a row of input values.")
        out = procs.call(fam, "predict", model_dir=str(d), rows=[body["row"]])
    return jsonable({"modality": modality, "task": prepared.task, "model": res["label"], **_shape(out, prepared)})


@router.get("/jobs/{job_id}/models/{key}/inputs")
def input_schema(job_id: str, key: str):
    """Tabular input schema (for building a manual-input form) — same as a saved model's."""
    result, res, prepared, modality, d = _context(job_id, key)
    pp = prepared.preprocessor
    return jsonable({"modality": modality, "task": prepared.task, "classes": prepared.classes,
                     "input_schema": getattr(pp, "input_schema", []) if modality == "tabular" else [],
                     "image_shape": prepared.image_shape})
