"""Image dataset routes: catalogue, synthetic image sets, ZIP upload, thumbnails."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from fastapi import APIRouter, Body, File, HTTPException, UploadFile
from fastapi.responses import Response

from ..core import images as im
from ..core.store import datasets
from ..util.jsonable import jsonable
from .datasets import _save_upload, summary

router = APIRouter()


@router.get("/datasets/image-sets")
def image_sets():
    return im.IMAGE_SETS


@router.post("/datasets/image-set")
def create_image_set(body: dict = Body(...)):
    arr, df, task, meta = im.generate(body["name"], body.get("params") or {}, int(body.get("seed", 42)))
    target = "label" if task == "classification" else "value"
    did = datasets.put(df, {**meta, "task_hint": task, "target_hint": target}, images=arr)
    return summary(did)


@router.post("/datasets/upload-images")
async def upload_images(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(400, "Upload a .zip with one folder per class (or images plus a labels CSV).")
    path = await _save_upload(file)
    try:
        arr, df, task, warnings = im.read_zip(path)
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    finally:
        path.unlink(missing_ok=True)
    target = "label" if task == "classification" else "value"
    did = datasets.put(df, {"name": Path(file.filename or "images").stem, "source": "upload", "task_hint": task,
                            "target_hint": target, "warnings": warnings}, images=arr)
    return summary(did)


@router.get("/datasets/{did}/image/{i}")
def thumbnail(did: str, i: int, size: int = 64, aug: int = 0):
    arr = datasets.images(did)
    if not 0 <= i < len(arr):
        raise HTTPException(404, "No such image")
    a = np.asarray(arr[i])
    if aug:
        a = im.augment_np(a, {"flip_h": True, "rotate": 20, "shift": 0.1, "brightness": 0.25}, np.random.default_rng(aug))
    return Response(im.png_bytes(a, max(8, min(size, 256))), media_type="image/png",
                    headers={"Cache-Control": "max-age=86400" if not aug else "no-cache"})


def image_profile(did: str, target: str | None) -> dict:
    """Class balance / value histogram, sample indices per class, and a 2-D 'image map' (PCA of small grayscale pixels)."""
    from ..core.profile import histogram, value_counts
    df = datasets.get(did)
    arr = datasets.images(did)
    target = target or ("label" if "label" in df.columns else "value")
    out: dict = {"n_rows": int(len(df)), "modality": "image", "coach": []}
    rng = np.random.default_rng(0)
    if target in df.columns and df[target].dtype != float:
        out["class_balance"] = value_counts(df[target], top=50)
        out["task_guess"] = "classification"
        out["samples"] = {str(c): [int(i) for i in rng.permutation(np.where(df[target].astype(str) == str(c))[0])[:12]]
                          for c in df[target].astype(str).value_counts().index[:20]}
    else:
        out["target_hist"] = histogram(df[target])
        out["task_guess"] = "regression"
        order = np.argsort(df[target].to_numpy())
        out["samples"] = {"lowest": [int(i) for i in order[:12]], "highest": [int(i) for i in order[::-1][:12]],
                          "middle": [int(i) for i in order[len(order) // 2 - 6:len(order) // 2 + 6]]}
        vals = df[target].to_numpy()
        out["sample_values"] = {str(i): round(float(vals[i]), 3) for group in out["samples"].values() for i in group}
    idx = np.sort(rng.choice(len(arr), min(len(arr), 600), replace=False))
    small = np.stack([np.asarray(im.Image.fromarray(np.asarray(arr[i])).convert("L").resize((16, 16))) for i in idx]).reshape(len(idx), -1) / 255.0
    from sklearn.decomposition import PCA
    P = PCA(2, random_state=0).fit_transform(small - small.mean(0))
    labels = df[target].astype(str).to_numpy() if out["task_guess"] == "classification" else df[target].to_numpy()
    out["projection"] = [{"x": round(float(P[k, 0]), 3), "y": round(float(P[k, 1]), 3), "i": int(i),
                          "label": labels[i] if out["task_guess"] == "classification" else round(float(labels[i]), 3)} for k, i in enumerate(idx)]
    return jsonable(out)


# ----------------------------------------------------------------------------- text datasets
@router.get("/datasets/text-sets")
def text_sets():
    from ..core.text import TEXT_SETS
    return TEXT_SETS


@router.post("/datasets/text-set")
def create_text_set(body: dict = Body(...)):
    from ..core.text import generate
    df, meta = generate(body["name"], body.get("params") or {}, int(body.get("seed", 42)))
    did = datasets.put(df, meta)
    return summary(did)


def text_profile(did: str, target: str | None, text_column: str | None) -> dict:
    """Class balance, text lengths, distinctive words per class and example texts."""
    from ..core.profile import histogram, value_counts
    from ..core.text import detect_text_column, tokenize
    df = datasets.get(did)
    meta = datasets.meta(did)
    col = text_column or meta.get("text_column") or detect_text_column(df, exclude=target)
    out: dict = {"n_rows": int(len(df)), "modality": "text", "text_column": col, "coach": [], "projection": []}
    if not col:
        return out
    texts = df[col].fillna("").astype(str)
    lens = texts.map(lambda t: len(tokenize(t)))
    out["length_hist"] = histogram(lens)
    if target and target in df.columns:
        out["class_balance"] = value_counts(df[target], top=30)
        out["task_guess"] = "classification"
        counts: dict = {}
        totals: dict = {}
        for t, y in zip(texts, df[target].astype(str)):
            for w in set(tokenize(t)):
                counts.setdefault(y, {}).setdefault(w, 0)
                counts[y][w] += 1
                totals[w] = totals.get(w, 0) + 1
        n_cls = df[target].astype(str).value_counts().to_dict()
        top = []
        for y, cw in counts.items():
            share = {w: (c / n_cls[y]) - (totals[w] - c) / max(1, len(df) - n_cls[y]) for w, c in cw.items() if totals[w] >= 5}
            top.append({"class": y, "words": [{"t": w, "w": round(v, 3)} for w, v in sorted(share.items(), key=lambda kv: -kv[1])[:12]]})
        out["top_words"] = top
        out["examples"] = {y: texts[df[target].astype(str) == y].head(4).tolist() for y in list(n_cls)[:10]}
    return jsonable(out)
