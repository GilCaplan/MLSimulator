"""Labs: free-play experiments (GAN, autoencoder map, transfer learning; bandit and gridworld run in the browser)."""
from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from ..config import DATA_DIR
from ..core import procs
from ..core.jobs import manager
from ..core.labs import GAN_TARGETS, LABS
from ..core.trainer import run_lab_job
from ..util.jsonable import jsonable

router = APIRouter()


@router.get("/labs")
def list_labs():
    return {"labs": LABS, "gan_targets": GAN_TARGETS}


@router.post("/labs/{lab}/run")
def run_lab(lab: str, body: dict = Body(default={})):
    if lab not in LABS or LABS[lab]["kind"] != "server":
        raise HTTPException(404, "Unknown lab.")
    params = {**LABS[lab].get("params", {}), **(body.get("params") or {})}
    job = manager.submit("lab", {"lab": lab, "params": params}, run_lab_job)
    return {"job_id": job.id}


@router.post("/labs/vae/decode")
def vae_decode(body: dict = Body(...)):
    """Decode points of a finished autoencoder-map run: {run_id, z: [[x, y], ...]} → 8×8 images (64 values 0–1)."""
    run_dir = DATA_DIR / "labs" / str(body.get("run_id", "")).replace("/", "")
    if not (run_dir / "vae.pt").exists():
        raise HTTPException(404, "That run is no longer available — train the map again.")
    z = body.get("z") or []
    if not z or len(z) > 400:
        raise HTTPException(400, "Send between 1 and 400 points.")
    return jsonable(procs.call("torch", "lab_decode", run_dir=str(run_dir), z=z))
