from __future__ import annotations

import os
import platform
import subprocess

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..config import DATA_DIR, PORT_RANGE, SERVER_LOG, VERSION
from ..core import ports
from ..core.jobs import manager

router = APIRouter()


@router.get("/health")
def health(request: Request):
    server = getattr(request.app.state, "server", None)
    return {"ok": True, "ready": bool(server is None or server.started), "port": request.app.state.port, "pid": os.getpid(),
            "version": VERSION, "jobs_running": manager.running()}


@router.get("/system/info")
def info(request: Request):
    import importlib.metadata as md
    versions = {}
    for pkg in ("torch", "scikit-learn", "xgboost", "lightgbm", "imbalanced-learn", "pandas", "numpy", "fastapi"):
        try:
            versions[pkg] = md.version(pkg)
        except md.PackageNotFoundError:
            versions[pkg] = None
    return {"version": VERSION, "port": request.app.state.port, "pid": os.getpid(), "data_dir": str(DATA_DIR),
            "log_path": str(SERVER_LOG), "python": platform.python_version(), "machine": platform.machine(),
            "cpu_count": os.cpu_count(), "versions": versions, "mps": platform.system() == "Darwin" and platform.machine() == "arm64", "os": platform.system(),
            "gpu": _gpu()}


@router.get("/system/ports")
def list_ports(request: Request, start: int = PORT_RANGE[0], end: int = PORT_RANGE[1]):
    start, end = max(1024, start), min(65535, end)
    if end - start > 400:
        end = start + 400
    out = ports.scan(start, end)
    cur = request.app.state.port
    out["current"] = cur
    out["busy"] = [p for p in out["busy"] if p != cur]
    return out


class SwitchReq(BaseModel):
    port: int


@router.post("/system/switch-port")
def switch_port(req: SwitchReq, request: Request):
    cur = request.app.state.port
    if req.port == cur:
        raise HTTPException(400, "Already running on that port.")
    if not (1024 <= req.port <= 65535):
        raise HTTPException(400, "Choose a port between 1024 and 65535.")
    if manager.running():
        raise HTTPException(409, "A training job is running — wait for it to finish (or stop it) before switching ports.")
    if not ports.is_free(req.port):
        raise HTTPException(409, f"Port {req.port} is already in use.")
    return ports.spawn_successor(req.port, cur, request.app.state.server)


@router.post("/system/goodbye")
def goodbye():
    ports.handoff.goodbye.set()
    return {"ok": True}


@router.post("/system/shutdown")
def shutdown(request: Request):
    request.app.state.server.should_exit = True
    return {"ok": True}


def _gpu() -> str | None:
    """Which accelerator PyTorch can use — detected without importing torch in the API process."""
    import shutil
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        return "Apple GPU (MPS)"
    if shutil.which("nvidia-smi"):
        return "NVIDIA GPU (CUDA)"
    return None


@router.post("/system/reveal-data")
def reveal_data():
    try:
        if platform.system() == "Darwin":
            subprocess.Popen(["open", str(DATA_DIR)])
        elif platform.system() == "Windows":
            os.startfile(str(DATA_DIR))  # noqa: S606
        else:
            subprocess.Popen(["xdg-open", str(DATA_DIR)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass  # no file manager available — the path is still returned
    return {"ok": True, "path": str(DATA_DIR)}
