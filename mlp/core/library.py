"""Saved-model library: bundles a trained model + its preprocessor + config, and serves predictions."""
from __future__ import annotations

import io
import json
import pickle
import shutil
import time

import pandas as pd

from ..config import DATA_DIR
from ..util.jsonable import jsonable
from . import procs
from .jobs import manager
from .store import datasets, new_id, prepared_store

ROOT = DATA_DIR / "library"


def preprocessor_for(prepared, model_id: str):
    """The fitted preprocessor as this model expects it (neural text models read token ids, classic ones TF-IDF)."""
    pp = prepared.preprocessor
    if getattr(prepared, "modality", "tabular") == "text":
        import copy

        from .registry import MODEL_INDEX
        pp = copy.copy(pp)
        pp.mode = "seq" if MODEL_INDEX[model_id].get("arch_kind") in ("embedding_bag", "gru", "text_transformer") else "tfidf"
    return pp


def save(job_id: str, key: str, name: str, notes: str = "", project_id: str | None = None) -> dict:
    result = manager.load_result(job_id)
    if not result or key not in result.get("models", {}):
        raise KeyError("That trained model is no longer available — train again.")
    res = result["models"][key]
    if res.get("baseline"):
        raise ValueError("The baseline is just a reference — save one of your trained models.")
    src = DATA_DIR / "jobs" / job_id / f"{key}.joblib"
    if not src.exists():
        raise KeyError("Model file missing — train again.")
    prepared = prepared_store.get(result["prepared_id"])
    mid = new_id("m")
    d = ROOT / mid
    d.mkdir(parents=True)
    shutil.copy(src, d / "model.joblib")
    import joblib
    joblib.dump(preprocessor_for(prepared, res["model_id"]), d / "preprocessor.joblib")
    try:
        ds_meta = datasets.meta(prepared.dataset_id)
    except KeyError:
        ds_meta = {}
    pp = prepared.preprocessor
    meta = {"id": mid, "text_column": getattr(pp, "text_column", None), "name": name or res["label"], "notes": notes, "task": prepared.task, "model_id": res["model_id"],
            "label": res["label"], "family": res["family"], "params": res.get("params"), "nn_arch": res.get("nn_arch"),
            "target": prepared.target, "classes": prepared.classes, "feature_names": prepared.feature_names,
            "input_schema": pp.input_schema, "metrics": res["metrics"], "pipeline": prepared.spec,
            "dataset": {"id": prepared.dataset_id, "name": ds_meta.get("name"), "n_rows": ds_meta.get("n_rows")},
            "project_id": project_id, "job_id": job_id, "key": key, "created_at": time.time(),
            "fit_time_s": res.get("fit_time_s"), "n_params": res.get("n_params"),
            "modality": getattr(prepared, "modality", "tabular"), "image_shape": prepared.image_shape}
    (d / "meta.json").write_text(json.dumps(jsonable(meta)))
    detail = {k: res.get(k) for k in ("confusion", "roc", "pr", "residuals", "importance", "surface", "curve", "cv", "thresholds", "notes",
                                      "calibration", "mistakes", "slices", "vision", "clusters", "reduction", "anomaly", "text")}
    (d / "result.json").write_text(json.dumps(jsonable(detail)))
    return meta


def list_models() -> list[dict]:
    out = []
    for d in ROOT.iterdir():
        if (d / "meta.json").exists():
            out.append(json.loads((d / "meta.json").read_text()))
    return sorted(out, key=lambda m: m.get("created_at", 0), reverse=True)


def get(mid: str) -> dict:
    p = ROOT / mid / "meta.json"
    if not p.exists():
        raise KeyError(mid)
    meta = json.loads(p.read_text())
    rp = ROOT / mid / "result.json"
    meta["detail"] = json.loads(rp.read_text()) if rp.exists() else {}
    return meta


def update(mid: str, patch: dict) -> dict:
    p = ROOT / mid / "meta.json"
    meta = json.loads(p.read_text())
    for k in ("name", "notes"):
        if k in patch:
            meta[k] = patch[k]
    p.write_text(json.dumps(jsonable(meta)))
    return meta


def delete(mid: str):
    shutil.rmtree(ROOT / mid, ignore_errors=True)


def _fam(mid: str) -> str:
    return json.loads((ROOT / mid / "meta.json").read_text())["family"]


def predict(mid: str, rows: list[dict]) -> dict:
    return procs.call(_fam(mid), "predict", model_dir=str(ROOT / mid), rows=rows)


def predict_text(mid: str, texts: list[str]) -> dict:
    return procs.call(_fam(mid), "predict_text", model_dir=str(ROOT / mid), texts=texts)


def assign(mid: str, rows: list[dict]) -> dict:
    return procs.call(_fam(mid), "assign", model_dir=str(ROOT / mid), rows=rows)


def predict_image(mid: str, images: list[str]) -> dict:
    return procs.call(_fam(mid), "predict_image", model_dir=str(ROOT / mid), images=images)


def sensitivity(mid: str, row: dict, class_index=None) -> dict:
    return procs.call(_fam(mid), "sensitivity", model_dir=str(ROOT / mid), row=row, class_index=class_index)


def predict_frame(mid: str, df: pd.DataFrame) -> dict:
    out = procs.call(_fam(mid), "predict_frame", model_dir=str(ROOT / mid), frame=df)
    res = df.copy()
    res["prediction"] = out["predictions"]
    if out.get("probabilities") and out.get("classes"):
        for i, c in enumerate(out["classes"]):
            res[f"prob_{c}"] = [p[i] for p in out["probabilities"]]
    did = new_id("dl")
    res.to_csv(DATA_DIR / "downloads" / f"{did}.csv", index=False)
    head = res.head(50)
    out_small = {"download_id": did, "n_rows": int(len(res)),
                 "preview": {"columns": [str(c) for c in head.columns], "rows": head.astype("object").where(head.notna(), None).values.tolist()},
                 "metrics": out.get("metrics"), "confusion": out.get("confusion"), "classes": out.get("classes")}
    preds = pd.Series(out["predictions"])
    if out.get("classes"):
        vc = preds.astype(str).value_counts()
        out_small["prediction_counts"] = {"labels": vc.index.tolist(), "counts": vc.values.tolist()}
    else:
        from .profile import histogram
        out_small["prediction_hist"] = histogram(preds)
    return out_small


def export_zip(mid: str) -> bytes:
    buf = io.BytesIO()
    import zipfile
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in (ROOT / mid).iterdir():
            z.write(f, f.name)
        z.writestr("README.txt", "ML Playground model bundle.\n\nimport joblib\npre = joblib.load('preprocessor.joblib')\n"
                   "model = joblib.load('model.joblib')\nX = pre.transform(dataframe)\npred = pre.decode_y(model.predict(X))\n\n"
                   "Requires the ML Playground 'mlp' package on the Python path.\n")
    return buf.getvalue()
