"""Background job manager: a single worker thread, sequenced event log, SSE fan-out, cooperative cancel."""
from __future__ import annotations

import asyncio
import json
import threading
import time
import traceback
from collections import deque
from concurrent.futures import ThreadPoolExecutor

from ..config import DATA_DIR
from ..util.jsonable import jsonable
from .store import new_id

TERMINAL = {"job.finished", "job.failed", "job.cancelled"}


class Cancelled(Exception):
    pass


class Job:
    def __init__(self, kind: str, request: dict):
        self.id = new_id("j")
        self.kind = kind
        self.request = request
        self.status = "queued"
        self.created_at = time.time()
        self.started_at = None
        self.ended_at = None
        self.events: deque = deque(maxlen=6000)
        self.seq = 0
        self.subscribers: set = set()
        self.cancel = threading.Event()
        self.result = None
        self.error = None
        self.progress: dict = {}

    def summary(self) -> dict:
        return {"id": self.id, "kind": self.kind, "status": self.status, "created_at": self.created_at,
                "started_at": self.started_at, "ended_at": self.ended_at, "error": self.error,
                "progress": self.progress, "project_id": self.request.get("project_id"),
                "prepared_id": self.request.get("prepared_id")}


class JobManager:
    def __init__(self):
        self.jobs: dict[str, Job] = {}
        self.lock = threading.RLock()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mlp-job")

    def set_loop(self, loop):
        self.loop = loop

    def get(self, jid: str) -> Job:
        if jid not in self.jobs:
            raise KeyError(jid)
        return self.jobs[jid]

    def running(self) -> int:
        return sum(1 for j in self.jobs.values() if j.status in ("queued", "running"))

    def submit(self, kind: str, request: dict, fn) -> Job:
        job = Job(kind, request)
        with self.lock:
            self.jobs[job.id] = job
        self.executor.submit(self._run, job, fn)
        return job

    def _run(self, job: Job, fn):
        job.status = "running"
        job.started_at = time.time()
        self.emit(job, "job.started", {"kind": job.kind})
        try:
            if job.cancel.is_set():
                raise Cancelled()
            job.result = fn(job)
            job.status = "finished"
            self._persist(job)
            self.emit(job, "job.finished", {"summary": (job.result or {}).get("leaderboard") or (job.result or {}).get("best")})
        except Cancelled:
            job.status = "cancelled"
            self.emit(job, "job.cancelled", {})
        except Exception as e:  # noqa: BLE001 - report every failure to the UI
            job.status = "failed"
            job.error = f"{type(e).__name__}: {e}"
            traceback.print_exc()
            self.emit(job, "job.failed", {"error": job.error})
        finally:
            job.ended_at = time.time()

    def _persist(self, job: Job):
        d = DATA_DIR / "jobs" / job.id
        d.mkdir(parents=True, exist_ok=True)
        (d / "result.json").write_text(json.dumps(jsonable({"job": job.summary(), "request": job.request, "result": job.result})))
        (d / "job.json").write_text(json.dumps(jsonable(job.summary())))

    def finished_on_disk(self) -> list[dict]:
        """Summaries of jobs from earlier server runs (in-memory jobs are listed from memory)."""
        out = []
        for p in (DATA_DIR / "jobs").glob("*/job.json"):
            if p.parent.name in self.jobs:
                continue
            try:
                out.append(json.loads(p.read_text()))
            except (OSError, ValueError):
                pass
        return out

    def load_result(self, jid: str) -> dict | None:
        if jid in self.jobs and self.jobs[jid].result is not None:
            return self.jobs[jid].result
        p = DATA_DIR / "jobs" / jid / "result.json"
        if p.exists():
            return json.loads(p.read_text()).get("result")
        return None

    def emit(self, job: Job, type_: str, data: dict):
        with self.lock:
            job.seq += 1
            ev = {"seq": job.seq, "type": type_, "data": jsonable(data), "t": time.time()}
            job.events.append(ev)
            self._track(job, type_, data)
            subs = list(job.subscribers)
        if self.loop is not None:
            for q in subs:
                self.loop.call_soon_threadsafe(q.put_nowait, ev)

    @staticmethod
    def _track(job: Job, type_: str, d: dict):
        key = d.get("key") if isinstance(d, dict) else None
        if not key:
            return
        p = job.progress.setdefault(key, {"state": "queued", "pct": 0})
        if type_ == "model.started":
            p.update(state="running", pct=0)
        elif type_ == "epoch":
            p.update(pct=d["epoch"] / max(1, d["epochs"]), epoch=d["epoch"])
        elif type_ == "iteration" and d.get("n"):
            p.update(pct=d["i"] / d["n"])
        elif type_ == "model.finished":
            p.update(state="done", pct=1)
        elif type_ == "model.failed":
            p.update(state="failed")

    def subscribe(self, job: Job) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        with self.lock:
            job.subscribers.add(q)
        return q

    def unsubscribe(self, job: Job, q):
        with self.lock:
            job.subscribers.discard(q)

    def snapshot(self, job: Job, since: int) -> list:
        with self.lock:
            return [e for e in job.events if e["seq"] > since]

    def cancel(self, jid: str):
        job = self.get(jid)
        job.cancel.set()
        self.emit(job, "log", {"level": "info", "message": "Stopping…"})


manager = JobManager()
