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


# ----------------------------------------------------------------------------- ratings datasets
@router.get("/datasets/ratings-sets")
def ratings_sets():
    from ..core.recsys import RATINGS_SETS
    return RATINGS_SETS


@router.post("/datasets/ratings-set")
def create_ratings_set(body: dict = Body(...)):
    from ..core.recsys import generate
    ratings, items, meta = generate(body.get("name", "movies"), body.get("params") or {}, int(body.get("seed", 42)))
    did = datasets.put(ratings, {**meta, "items": items.to_dict("records")})
    return summary(did)


def ratings_profile(did: str, cols: dict) -> dict:
    df = datasets.get(did)
    meta = datasets.meta(did)
    c = {**(meta.get("columns") or {}), **{k: v for k, v in cols.items() if v}}
    out: dict = {"n_rows": int(len(df)), "modality": "ratings", "columns_roles": c, "coach": [], "projection": []}
    if not all(c.get(k) in df.columns for k in ("user", "item", "rating")):
        return out
    uc, ic = df[c["user"]].value_counts(), df[c["item"]].value_counts()
    out.update({"n_users": int(uc.size), "n_items": int(ic.size), "sparsity": round(1 - len(df) / (uc.size * ic.size), 4),
                "rating_hist": {"labels": [str(v) for v in sorted(df[c["rating"]].unique())][:20],
                                "counts": df[c["rating"]].value_counts().sort_index().tolist()[:20]},
                "per_user": np.histogram(uc.to_numpy(), bins=20)[0].tolist(), "per_user_edges": [round(float(e), 1) for e in np.histogram_bin_edges(uc.to_numpy(), 20)],
                "long_tail": [int(v) for v in ic.to_numpy()]})
    titles = {str(r["item"]): r for r in meta.get("items") or []}
    out["top_items"] = [{"item": str(it), "ratings": int(n), **({k: v for k, v in titles.get(str(it), {}).items() if k != "item"})} for it, n in ic.head(12).items()]
    return jsonable(out)


# ----------------------------------------------------------------------------- time-series datasets
@router.get("/datasets/timeseries-sets")
def timeseries_sets():
    from ..core.forecast import public_sets
    return public_sets()


@router.post("/datasets/timeseries-set")
def create_timeseries_set(body: dict = Body(...)):
    from ..core.forecast import FORECAST_SETS, generate
    name = body.get("name", "store_sales")
    if name not in FORECAST_SETS:
        raise HTTPException(404, "Unknown series set.")
    df, meta = generate(name, body.get("params") or {}, int(body.get("seed", 42)))
    did = datasets.put(df, meta)
    return summary(did)


def _guess_ts_columns(df) -> dict:
    import pandas as pd
    out: dict = {"time": None, "value": None, "series": None}
    hints_t = ("date", "time", "day", "month", "week", "year", "timestamp", "period", "step", "ds")
    for c in df.columns:
        if str(c).lower() in hints_t or any(h in str(c).lower() for h in ("date", "time")):
            out["time"] = c
            break
    if out["time"] is None:
        for c in df.columns:
            if df[c].dtype == object and pd.to_datetime(df[c].head(50), errors="coerce", format="mixed").notna().mean() > 0.9:
                out["time"] = c
                break
    num = [c for c in df.columns if c != out["time"] and pd.api.types.is_numeric_dtype(df[c])]
    cat = [c for c in df.columns if c != out["time"] and not pd.api.types.is_numeric_dtype(df[c]) and 2 <= df[c].nunique() <= 30]
    if cat and len(df) / df[cat[0]].nunique() >= 30:
        out["series"] = cat[0]
    hints_v = ("sales", "value", "demand", "visits", "count", "y", "load", "price", "passengers", "amount", "target")
    vals = [c for c in num if df[c].nunique() > 2]
    out["value"] = next((c for c in vals if str(c).lower() in hints_v), vals[0] if vals else None)
    return out


def timeseries_profile(did: str, cols: dict) -> dict:
    import pandas as pd

    from ..core.forecast import prepare_forecast
    df = datasets.get(did)
    meta = datasets.meta(did)
    guess = _guess_ts_columns(df)
    c = {**guess, **(meta.get("columns") or {}), **{k: v for k, v in cols.items() if v}}
    if c.get("series") in ("", "none"):
        c["series"] = None
    columns = [{"name": str(k), "numeric": bool(pd.api.types.is_numeric_dtype(df[k])), "n_unique": int(df[k].nunique())} for k in df.columns]
    out: dict = {"n_rows": int(len(df)), "modality": "timeseries", "columns_roles": c, "coach": [], "projection": [], "columns": columns,
                 "exog_candidates": [x["name"] for x in columns if x["numeric"] and x["name"] not in (c.get("time"), c.get("value"), c.get("series"))],
                 "exog": meta.get("exog") or [], "horizon_default": meta.get("horizon")}
    if not (c.get("time") in df.columns and c.get("value") in df.columns):
        return jsonable(out)
    try:
        p = prepare_forecast(df, {"columns": c, "forecast": {"exog": []}}, did, {"horizon": meta.get("horizon") or 14})
    except ValueError as e:
        out["error"] = str(e)
        return jsonable(out)
    rep = p.report
    y = pd.to_numeric(df[c["value"]], errors="coerce")
    out.update({k: rep[k] for k in ("freq", "unit", "season", "season_name", "n_series", "series_names", "filled", "acf", "seasonal_profile")})
    out["horizon_default"] = meta.get("horizon") or int(min(2 * rep["season"] if rep["season"] > 1 else 14, rep["horizon"]))
    out["timeline"] = [{"series": t["series"], "points": [{"t": q["t"], "y": q["y"]} for q in t["points"]]} for t in rep["timeline"]]
    out["series"] = [{"name": s["name"], "n": int(s["n"]), "start": str(s["times"][0])[:16], "end": str(s["times"][-1])[:16],
                      "mean": float(np.mean(s["y"])), "min": float(np.min(s["y"])), "max": float(np.max(s["y"]))} for s in p.preprocessor.series]
    out["value_stats"] = {"min": float(y.min()), "max": float(y.max()), "mean": float(y.mean()), "missing": int(y.isna().sum())}
    coach = []
    if rep["filled"]:
        coach.append({"id": "ts_gaps", "severity": "info", "title": f"{rep['filled']} missing time steps were filled",
                      "why": "Forecasting models expect evenly spaced steps, so gaps are filled by drawing a straight line between neighbours."})
    if out["acf"] and rep["season"] > 1:
        seas = next((a["r"] for a in out["acf"] if a["lag"] == rep["season"]), None)
        if seas is not None and seas > 0.3:
            coach.append({"id": "ts_season", "severity": "info", "title": f"A strong {rep['season_name']}ly rhythm",
                          "why": f"Values correlate {seas:.2f} with the value {rep['season']} {rep['unit']}s earlier. A lag of {rep['season']} and calendar features will help."})
    if float(y.min()) > 0 and float(y.max()) / max(float(y.min()), 1e-9) > 8:
        coach.append({"id": "ts_log", "severity": "info", "title": "Values span a wide range",
                      "why": "When the ups and downs grow with the level, a log transform (in Prepare) makes the pattern steadier."})
    out["coach"] = coach
    return jsonable(out)
