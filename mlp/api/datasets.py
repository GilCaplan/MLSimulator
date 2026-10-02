from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Body, File, HTTPException, UploadFile

from ..config import MAX_UPLOAD_BYTES
from ..core import coach, profile, synthetic
from ..core.pipeline import prepare
from ..core.store import datasets, prepared_store
from ..util.jsonable import jsonable
from ..util.safe_expr import FUNCTIONS_HELP

router = APIRouter()


def read_table(path: Path, filename: str) -> pd.DataFrame:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext in ("xlsx", "xlsm", "xls"):
        return pd.read_excel(path)
    if ext in ("json", "jsonl", "ndjson"):
        text = path.read_text(encoding="utf-8", errors="replace").strip()
        if ext in ("jsonl", "ndjson") or (text.startswith("{") and "\n{" in text):
            return pd.read_json(path, lines=True)
        data = json.loads(text)
        if isinstance(data, dict):
            for k in ("data", "rows", "records", "items"):
                if isinstance(data.get(k), list):
                    return pd.json_normalize(data[k])
            if all(isinstance(v, list) for v in data.values()):
                return pd.DataFrame(data)
            return pd.json_normalize(data)
        return pd.json_normalize(data)
    if ext == "tsv":
        return pd.read_csv(path, sep="\t")
    try:
        return pd.read_csv(path, sep=None, engine="python")
    except Exception:  # noqa: BLE001
        return pd.read_csv(path)


def clean_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() or f"col_{i}" for i, c in enumerate(df.columns)]
    df = df.loc[:, ~df.columns.duplicated()]
    df = df.dropna(how="all").dropna(axis=1, how="all")
    for c in df.columns:  # numeric-looking strings -> numbers
        if not pd.api.types.is_numeric_dtype(df[c]):
            conv = pd.to_numeric(df[c], errors="coerce")
            if conv.notna().sum() >= 0.95 * df[c].notna().sum() and df[c].notna().any():
                df[c] = conv
    return df.reset_index(drop=True)


def summary(did: str) -> dict:
    return jsonable(profile.summarize(datasets.get(did), datasets.meta(did)))


async def _save_upload(file: UploadFile) -> Path:
    suffix = Path(file.filename or "data.csv").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    size = 0
    while chunk := await file.read(1 << 20):
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            tmp.close()
            Path(tmp.name).unlink(missing_ok=True)
            raise HTTPException(413, "File is larger than 200 MB.")
        tmp.write(chunk)
    tmp.close()
    return Path(tmp.name)


@router.get("/datasets/catalog")
def catalog():
    return {"distributions": synthetic.DISTRIBUTIONS, "presets": synthetic.PRESETS, "samples": synthetic.SAMPLES,
            "functions": FUNCTIONS_HELP}


@router.post("/datasets/upload")
async def upload(file: UploadFile = File(...)):
    path = await _save_upload(file)
    try:
        df = clean_frame(read_table(path, file.filename or "data.csv"))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Couldn't read that file: {e}") from None
    finally:
        path.unlink(missing_ok=True)
    if df.empty or df.shape[1] < 2:
        raise HTTPException(400, "The file needs at least two columns and one row.")
    did = datasets.put(df, {"name": Path(file.filename or "upload").stem, "source": "upload", "filename": file.filename})
    return summary(did)


@router.post("/datasets/synthetic")
def create_synthetic(spec: dict = Body(...)):
    df, meta = synthetic.generate_custom(spec)
    did = datasets.put(df, {**meta, "spec": spec})
    return summary(did)


@router.post("/datasets/synthetic/preview")
def preview_synthetic(spec: dict = Body(...)):
    return jsonable(synthetic.preview(spec, 400))


@router.post("/datasets/preset")
def create_preset(body: dict = Body(...)):
    df, meta = synthetic.generate_preset(body["preset"], body.get("params") or {}, int(body.get("seed", 42)))
    did = datasets.put(df, meta)
    return summary(did)


@router.post("/datasets/preset/preview")
def preview_preset(body: dict = Body(...)):
    params = {**(body.get("params") or {})}
    params["n_samples"] = min(int(params.get("n_samples", 400)), 500)
    df, meta = synthetic.generate_preset(body["preset"], params, int(body.get("seed", 42)))
    X, _ = profile.numeric_matrix(df, exclude=["target"])
    P, _ = profile.project_2d(X)
    task = meta["task_hint"]
    lab = df["target"].astype(int).astype(str).tolist() if task == "classification" else [round(float(v), 3) for v in df["target"]]
    return {"task": task, "points": [{"x": round(float(P[i, 0]), 3), "y": round(float(P[i, 1]), 3), "label": lab[i]} for i in range(len(df))]}


@router.post("/datasets/sample")
def create_sample(body: dict = Body(...)):
    df, meta = synthetic.load_sample(body["name"])
    did = datasets.put(df, meta)
    return summary(did)


@router.post("/datasets/{did}/compose")
def compose(did: str, body: dict = Body(...)):
    base = datasets.get(did)
    meta = datasets.meta(did)
    df = synthetic.compose(base, body.get("add_features") or [], int(body.get("add_rows") or 0), float(body.get("jitter", 0.05)),
                           int(body.get("seed", 42)), body.get("target"))
    new = datasets.put(df, {**{k: v for k, v in meta.items() if k not in ("id", "created_at", "n_rows", "n_cols")},
                            "name": meta.get("name", "data") if str(meta.get("name", "")).endswith("+ synthetic") else f"{meta.get('name', 'data')} + synthetic", "source": "composed", "parent": did})
    return summary(new)


@router.get("/datasets")
def list_datasets():
    return datasets.list()


@router.get("/datasets/{did}")
def get_dataset(did: str):
    return summary(did)


@router.delete("/datasets/{did}")
def delete_dataset(did: str):
    datasets.delete(did)
    return {"ok": True}


@router.get("/datasets/{did}/rows")
def rows(did: str, offset: int = 0, limit: int = 100):
    df = datasets.get(did)
    page = df.iloc[offset: offset + min(limit, 1000)]
    return jsonable({"columns": [str(c) for c in df.columns], "rows": page.astype("object").where(page.notna(), None).values.tolist(),
                     "total": len(df), "offset": offset})


@router.get("/datasets/{did}/profile")
def get_profile(did: str, target: str | None = None, task: str | None = None):
    if datasets.meta(did).get("modality") == "image":
        from .media import image_profile
        return image_profile(did, target)
    df = datasets.get(did)
    prof = profile.dataset_profile(df, target)
    summ = profile.summarize(df, datasets.meta(did))
    prof["coach"] = coach.data_suggestions(summ, prof, task or prof.get("task_guess"), target)
    return jsonable(prof)


@router.post("/datasets/{did}/features/preview")
def preview_features(did: str, body: dict = Body(...)):
    """Apply engineered-feature steps to the dataset (preview only) and summarise the new columns."""
    from ..core.features import apply_bins, apply_stateless, fit_bins
    df = datasets.get(did)
    steps = body.get("steps") or []
    if len(df) > 20000:
        df = df.sample(20000, random_state=0)
    try:
        out, new, _ = apply_stateless(df, steps)
        out, new2, _ = apply_bins(out, steps, fit_bins(out, steps))
    except ValueError as e:
        return {"ok": False, "error": str(e), "columns": []}
    return jsonable({"ok": True, "columns": [profile.column_summary(out, c) for c in new + new2]})


@router.post("/datasets/{did}/prepare")
def prepare_dataset(did: str, body: dict = Body(...)):
    df = datasets.get(did)
    meta = datasets.meta(did)
    spec = body["pipeline"]
    if meta.get("modality") == "image":
        from ..core.images import prepare_images
        prepared = prepare_images(datasets.images(did), df, spec, did)
    else:
        prepared = prepare(df, spec, did, image_shape=meta.get("image_shape"))
    prepared_store.put(prepared)
    report = dict(prepared.report)
    report["coach"] = coach.prepare_suggestions(report, prepared.spec, body.get("model_ids") or [], prepared.task)
    report["classes"] = prepared.classes
    report["task"] = prepared.task
    return jsonable(report)
