from __future__ import annotations

from fastapi import APIRouter, Body, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from ..config import DATA_DIR
from ..core import library
from ..util.jsonable import jsonable
from .datasets import _save_upload, clean_frame, read_table

router = APIRouter()


@router.post("/library/save")
def save(body: dict = Body(...)):
    return library.save(body["job_id"], body["key"], body.get("name") or "", body.get("notes") or "", body.get("project_id"))


@router.post("/library/warm")
def warm(body: dict = Body(default={})):
    from ..core import procs
    fam = body.get("family", "classic")
    return procs.call(fam if fam in ("torch", "classic") else "classic", "ping", timeout=60)


@router.get("/library")
def list_models():
    return library.list_models()


@router.get("/library/{mid}")
def get_model(mid: str):
    return library.get(mid)


@router.patch("/library/{mid}")
def patch_model(mid: str, body: dict = Body(...)):
    return library.update(mid, body)


@router.delete("/library/{mid}")
def delete_model(mid: str):
    library.delete(mid)
    return {"ok": True}


@router.post("/library/{mid}/predict")
def predict(mid: str, body: dict = Body(...)):
    rows = body.get("rows") or []
    if not rows:
        raise HTTPException(400, "No input rows.")
    return jsonable(library.predict(mid, rows))


@router.post("/library/{mid}/predict-text")
def predict_text(mid: str, body: dict = Body(...)):
    """Text models: prediction + per-word influence (occlusion) for the first text."""
    texts = [t for t in (body.get("texts") or []) if isinstance(t, str)][:20]
    if not texts:
        raise HTTPException(400, "No text.")
    return jsonable(library.predict_text(mid, texts))


@router.post("/library/{mid}/assign")
def assign(mid: str, body: dict = Body(...)):
    """Unsupervised models: cluster + distances to centres, anomaly score, and/or 2-D map position for rows."""
    return jsonable(library.assign(mid, body.get("rows") or []))


@router.post("/library/{mid}/predict-image")
def predict_image(mid: str, body: dict = Body(...)):
    images = body.get("images") or []
    if not images:
        raise HTTPException(400, "No image.")
    return jsonable(library.predict_image(mid, images[:16]))


@router.post("/library/{mid}/sensitivity")
def sensitivity(mid: str, body: dict = Body(...)):
    return jsonable(library.sensitivity(mid, body["row"], body.get("class_index")))


@router.post("/library/{mid}/predict-file")
async def predict_file(mid: str, file: UploadFile = File(...)):
    path = await _save_upload(file)
    try:
        df = clean_frame(read_table(path, file.filename or "data.csv"))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Couldn't read that file: {e}") from None
    finally:
        path.unlink(missing_ok=True)
    return jsonable(library.predict_frame(mid, df))


@router.get("/library/{mid}/export")
def export(mid: str):
    meta = library.get(mid)
    name = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in meta["name"])[:40] or mid
    return Response(library.export_zip(mid), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}.zip"'})


@router.get("/downloads/{did}")
def download(did: str):
    if not did.replace("_", "").isalnum():
        raise HTTPException(400, "Bad id")
    p = DATA_DIR / "downloads" / f"{did}.csv"
    if not p.exists():
        raise HTTPException(404, "Download expired.")
    return FileResponse(p, media_type="text/csv", filename="predictions.csv")
