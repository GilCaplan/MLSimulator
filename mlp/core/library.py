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
from . import filecheck, procs
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
            "threshold": res.get("threshold"),
            "target": prepared.target, "classes": prepared.classes, "feature_names": prepared.feature_names,
            "input_schema": pp.input_schema, "metrics": res["metrics"], "pipeline": prepared.spec,
            "dataset": {"id": prepared.dataset_id, "name": ds_meta.get("name"), "n_rows": ds_meta.get("n_rows")},
            "project_id": project_id, "job_id": job_id, "key": key, "created_at": time.time(),
            "fit_time_s": res.get("fit_time_s"), "n_params": res.get("n_params"),
            "modality": getattr(prepared, "modality", "tabular"), "image_shape": prepared.image_shape}
    (d / "meta.json").write_text(json.dumps(jsonable(meta)))
    detail = {k: res.get(k) for k in ("confusion", "roc", "pr", "residuals", "importance", "surface", "curve", "cv", "thresholds", "notes",
                                      "calibration", "mistakes", "slices", "vision", "clusters", "reduction", "anomaly", "text", "recsys", "forecast")}
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


def recommend(mid: str, body: dict) -> dict:
    return procs.call(_fam(mid), "recommend", model_dir=str(ROOT / mid), user=body.get("user"), ratings=body.get("ratings"),
                      k=int(body.get("k", 10)))


def forecast(mid: str, body: dict) -> dict:
    return procs.call(_fam(mid), "forecast", model_dir=str(ROOT / mid), series=body.get("series"), horizon=body.get("horizon"),
                      exog=body.get("exog"))


def catalog(mid: str, q: str = "", limit: int = 60) -> dict:
    return procs.call(_fam(mid), "catalog", model_dir=str(ROOT / mid), q=q, limit=limit)


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


BUNDLE_FILES = {"meta.json", "result.json", "model.joblib", "preprocessor.joblib", "architecture.json", "weights.pt",
                "MANIFEST.json", "SIGNATURE", "README.txt"}
MAX_IMPORT_BYTES = 500 * 1024 * 1024


# ----------------------------------------------------------------------------- new file: check, fix, then predict
def _meta(mid: str) -> dict:
    p = ROOT / mid / "meta.json"
    if not p.exists():
        raise KeyError(mid)
    return json.loads(p.read_text())


def check_file(mid: str, df: pd.DataFrame) -> dict:
    """Stage an uploaded file and report how its columns line up with the model's inputs (with obvious renames pre-matched)."""
    meta = _meta(mid)
    fixes = {"mapping": filecheck.auto_mapping(df, meta), "fill": {}, "clean": []}
    return {"upload_id": filecheck.stage(df), "fixes": fixes, "report": filecheck.check(df, meta, fixes)}


def recheck(mid: str, upload_id: str, fixes: dict) -> dict:
    return filecheck.check(filecheck.load(upload_id), _meta(mid), fixes)


def predict_upload(mid: str, upload_id: str, fixes: dict) -> dict:
    meta = _meta(mid)
    raw = filecheck.load(upload_id)
    report = filecheck.check(raw, meta, fixes)
    if not report["ready"]:
        missing = [c["name"] for c in report["columns"] if c["status"] == "missing"]
        raise ValueError(f"Still missing: {', '.join(missing)}. Match each to a column in your file or fill it with a value.")
    out = predict_frame(mid, filecheck.apply_fixes(raw, meta, fixes))
    out["warnings"] = filecheck.warnings_of(report)
    return out


def model_view(mid: str, upload_id: str, fixes: dict) -> dict:
    """A few of the file's rows as typed, next to the numbers the model actually receives after the saved recipe."""
    meta = _meta(mid)
    df = filecheck.preview_rows(filecheck.apply_fixes(filecheck.load(upload_id), meta, fixes))
    names = [s["name"] for s in meta.get("input_schema") or []]
    raw = df.reindex(columns=names)
    out = procs.call(_fam(mid), "transform_rows", model_dir=str(ROOT / mid), frame=df)
    return {"raw": {"columns": names, "rows": raw.astype("object").where(raw.notna(), None).values.tolist()}, **out}


def _bundle_key() -> bytes:
    """Per-install secret used to sign exported bundles (so this computer can recognise its own exports)."""
    import secrets
    p = DATA_DIR / "run" / ".bundle_key"
    if not p.exists():
        p.write_bytes(secrets.token_bytes(32))
    return p.read_bytes()


def _sign(manifest: bytes) -> str:
    import hashlib
    import hmac
    return hmac.new(_bundle_key(), manifest, hashlib.sha256).hexdigest()


def architecture_of(meta: dict) -> dict:
    """A plain, human-readable description of the model (no pickles): what it is, its settings and its data recipe."""
    from .registry import MODEL_INDEX
    spec = MODEL_INDEX.get(meta.get("model_id"), {})
    return {"app": "ml-playground", "kind": "model-architecture", "version": 1,
            "model_id": meta.get("model_id"), "label": meta.get("label"), "family": spec.get("family"),
            "task": meta.get("task"), "modality": meta.get("modality", "tabular"), "params": meta.get("params") or {},
            "nn_arch": meta.get("nn_arch") or (spec.get("default_arch") if spec.get("nn") else None),
            "threshold": meta.get("threshold"), "target": meta.get("target"),
            "classes": meta.get("classes"), "feature_names": meta.get("feature_names"), "input_schema": meta.get("input_schema"),
            "image_shape": meta.get("image_shape"), "pipeline": meta.get("pipeline")}


def export_zip(mid: str) -> bytes:
    """Bundle: model + preprocessing (joblib), architecture.json, PyTorch weights.pt for networks, README, signed manifest."""
    import hashlib
    import zipfile

    from ..config import VERSION
    d = ROOT / mid
    meta = json.loads((d / "meta.json").read_text())
    if meta.get("family") == "torch" and not (d / "weights.pt").exists():
        try:
            procs.call("torch", "export_weights", model_dir=str(d))
        except Exception:  # noqa: BLE001 — weights.pt is a convenience; the joblib bundle is complete without it
            pass
    files: dict[str, bytes] = {f.name: f.read_bytes() for f in d.iterdir() if f.name in BUNDLE_FILES - {"MANIFEST.json", "SIGNATURE", "README.txt"}}
    files["architecture.json"] = json.dumps(jsonable(architecture_of(meta)), indent=2).encode()
    torch_note = ("\nPyTorch network weights (state_dict) are in weights.pt; the layer layout is in architecture.json → nn_arch.\n"
                  "import torch\nstate = torch.load('weights.pt', weights_only=True)\n" if "weights.pt" in files else "")
    files["README.txt"] = (
        f"ML Playground model bundle — {meta.get('name')} ({meta.get('label')})\n\n"
        "Import it back: ML Playground → Model Library → Import model.\n\n"
        "Use it in Python (needs the ML Playground 'mlp' package on the Python path):\n"
        "import joblib\npre = joblib.load('preprocessor.joblib')\nmodel = joblib.load('model.joblib')\n"
        "X = pre.transform(dataframe)\npred = pre.decode_y(model.predict(X))\n" + torch_note +
        "\narchitecture.json describes the model, its settings and its data-preparation recipe in plain JSON.\n"
        "Only load .joblib files you trust: they can run code when loaded.\n").encode()
    manifest = json.dumps({"app": "ml-playground", "app_version": VERSION, "exported_at": time.time(), "model_id": meta.get("model_id"),
                           "files": {k: hashlib.sha256(v).hexdigest() for k, v in sorted(files.items())}}, indent=2).encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for k, v in files.items():
            z.writestr(k, v)
        z.writestr("MANIFEST.json", manifest)
        z.writestr("SIGNATURE", _sign(manifest))
    return buf.getvalue()


class NeedsTrust(Exception):
    def __init__(self, reason: str, summary: dict):
        super().__init__(reason)
        self.reason, self.summary = reason, summary


def import_zip(data: bytes, trust: bool = False) -> dict:
    """Add an exported bundle to the library. Bundles signed by this install are trusted; others need trust=True
    (their pickled model files could run code). The model is test-loaded in a worker process, never in this one."""
    import hashlib
    import hmac
    import zipfile

    from .registry import MODEL_INDEX
    if len(data) > MAX_IMPORT_BYTES:
        raise ValueError("That file is larger than 500 MB.")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise ValueError("That isn't a .zip file exported from ML Playground.") from None
    names = {n for n in z.namelist() if not n.endswith("/")}
    for n in names:
        if n.startswith("/") or ".." in n or "/" in n or "\\" in n:
            raise ValueError("The bundle contains unexpected paths.")
    missing = {"meta.json", "model.joblib", "preprocessor.joblib"} - names
    if missing:
        raise ValueError("This doesn't look like an ML Playground model bundle (missing " + ", ".join(sorted(missing)) + ").")
    if sum(i.file_size for i in z.infolist()) > 4 * MAX_IMPORT_BYTES:
        raise ValueError("The bundle unpacks to more than 2 GB.")
    meta = json.loads(z.read("meta.json"))
    manifest_raw = z.read("MANIFEST.json") if "MANIFEST.json" in names else None
    signed = False
    reason = "This bundle isn't signed by this computer (it may come from another person or an older version)."
    if manifest_raw is not None:
        manifest = json.loads(manifest_raw)
        bad = [k for k, h in manifest.get("files", {}).items() if k in names and hashlib.sha256(z.read(k)).hexdigest() != h]
        if bad:
            raise ValueError("The bundle is damaged or was modified (" + ", ".join(bad) + " changed).")
        sig = z.read("SIGNATURE").decode().strip() if "SIGNATURE" in names else ""
        signed = bool(sig) and hmac.compare_digest(sig, _sign(manifest_raw))
        if not signed and sig:
            reason = "This bundle was exported from a different ML Playground install."
    summary = {"name": meta.get("name"), "label": meta.get("label"), "task": meta.get("task"), "model_id": meta.get("model_id"),
               "modality": meta.get("modality", "tabular"), "created_at": meta.get("created_at"), "signed": signed}
    if meta.get("model_id") not in MODEL_INDEX:
        raise ValueError(f"This model type ({meta.get('model_id')}) isn't available in this version of ML Playground.")
    if not signed and not trust:
        raise NeedsTrust(reason, summary)
    new_mid = new_id("m")
    d = ROOT / new_mid
    d.mkdir(parents=True)
    try:
        for n in names & BUNDLE_FILES - {"MANIFEST.json", "SIGNATURE", "README.txt"}:
            (d / n).write_bytes(z.read(n))
        meta.update({"id": new_mid, "name": f"{meta.get('name') or meta.get('label')} (imported)", "imported_at": time.time(),
                     "imported_signed": signed, "job_id": None, "key": None, "project_id": None})
        meta.setdefault("family", "torch" if MODEL_INDEX[meta["model_id"]].get("nn") or MODEL_INDEX[meta["model_id"]].get("torch") else "classic")
        (d / "meta.json").write_text(json.dumps(jsonable(meta)))
        if not (d / "result.json").exists():
            (d / "result.json").write_text("{}")
        procs.call(meta["family"], "load_check", model_dir=str(d))
    except Exception as e:  # noqa: BLE001
        shutil.rmtree(d, ignore_errors=True)
        raise ValueError(f"The model couldn't be loaded: {e}") from None
    return meta