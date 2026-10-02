from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..core import procs
from ..core.jobs import TERMINAL, manager
from ..core.registry import MODEL_INDEX, public_registry
from ..core.store import prepared_store
from ..core.trainer import run_train, run_tune

router = APIRouter()


@router.get("/models/registry")
def registry(task: str | None = None, modality: str | None = None):
    return public_registry(task, modality)


@router.get("/problems")
def problems():
    from ..core.problems import public_problems
    return public_problems()


@router.post("/nn/validate")
def validate(body: dict = Body(...)):
    return procs.call("torch", "validate_arch", arch=body["arch"], n_features=int(body.get("n_features") or 8),
                      n_out=int(body.get("n_out") or 2), image_shape=body.get("image_shape"), timeout=60)


@router.post("/jobs/train")
def start_train(body: dict = Body(...)):
    prepared_store.get(body["prepared_id"])  # 404 early if missing
    models = body.get("models") or []
    if not models:
        raise HTTPException(400, "Choose at least one model.")
    for m in models:
        if m.get("model_id") not in MODEL_INDEX:
            raise HTTPException(400, f"Unknown model {m.get('model_id')}")
    job = manager.submit("train", body, run_train)
    return {"job_id": job.id}


@router.post("/jobs/tune")
def start_tune(body: dict = Body(...)):
    prepared_store.get(body["prepared_id"])
    if MODEL_INDEX.get(body.get("model_id"), {}).get("nn"):
        raise HTTPException(400, "Automatic tuning is available for classic models.")
    job = manager.submit("tune", body, run_tune)
    return {"job_id": job.id}


@router.get("/jobs")
def list_jobs():
    return [j.summary() for j in sorted(manager.jobs.values(), key=lambda j: -j.created_at)][:50]


@router.get("/jobs/{jid}")
def get_job(jid: str):
    return manager.get(jid).summary()


@router.post("/jobs/{jid}/cancel")
def cancel(jid: str):
    manager.cancel(jid)
    return {"ok": True}


@router.get("/jobs/{jid}/result")
def result(jid: str):
    res = manager.load_result(jid)
    if res is None:
        if jid in manager.jobs:
            raise HTTPException(409, f"Job is {manager.jobs[jid].status}.")
        raise HTTPException(404, "Result not found.")
    return res


@router.get("/jobs/{jid}/events")
async def events(jid: str, request: Request, since: int = 0):
    job = manager.get(jid)
    last = request.headers.get("last-event-id")
    if last and last.isdigit():
        since = max(since, int(last))

    async def stream():
        q = manager.subscribe(job)
        try:
            sent = since
            for ev in manager.snapshot(job, since):
                sent = ev["seq"]
                yield f"id: {ev['seq']}\nevent: message\ndata: {json.dumps(ev)}\n\n"
                if ev["type"] in TERMINAL:
                    return
            if job.status in ("finished", "failed", "cancelled") and not any(e["type"] in TERMINAL for e in manager.snapshot(job, since)):
                return
            yield "retry: 1500\n\n"
            while True:
                if await request.is_disconnected():
                    return
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                if ev["seq"] <= sent:
                    continue
                sent = ev["seq"]
                yield f"id: {ev['seq']}\nevent: message\ndata: {json.dumps(ev)}\n\n"
                if ev["type"] in TERMINAL:
                    return
        finally:
            manager.unsubscribe(job, q)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
