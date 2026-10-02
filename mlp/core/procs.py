"""Process management for training runs and the per-family prediction servers."""
from __future__ import annotations

import multiprocessing as mp
import queue as queue_mod
import threading
import time

from .registry import uses_torch

CTX = mp.get_context("spawn")


def family(model_id: str) -> str:
    return "torch" if uses_torch(model_id) else "classic"


def run_in_process(payload: dict, on_event, cancel_flag: threading.Event, label: str = "model"):
    """Run worker.train_entry in a fresh process. Returns ("result", data) | ("cancelled", None) | ("error", msg, tb)."""
    from .worker import train_entry
    q = CTX.Queue()
    stop = CTX.Event()
    proc = CTX.Process(target=train_entry, args=(payload, q, stop), daemon=True)
    proc.start()
    outcome = None
    cancel_at = None
    try:
        while True:
            if cancel_flag.is_set() and not stop.is_set():
                stop.set()
                cancel_at = time.time()
            if cancel_at and time.time() - cancel_at > 4 and proc.is_alive():
                proc.terminate()
                outcome = ("cancelled", None)
                break
            try:
                msg = q.get(timeout=0.15)
            except queue_mod.Empty:
                if not proc.is_alive():
                    # drain anything flushed right before exit
                    try:
                        msg = q.get(timeout=0.5)
                    except queue_mod.Empty:
                        code = proc.exitcode
                        outcome = ("error", f"The {label} worker stopped unexpectedly (exit code {code}).", "")
                        break
                else:
                    continue
            if msg[0] == "event":
                on_event(msg[1], msg[2])
                continue
            outcome = msg
            break
    finally:
        proc.join(timeout=5)
        if proc.is_alive():
            proc.terminate()
        q.close()
    return outcome


class FamilyServer:
    """A long-lived prediction process for one library family."""

    def __init__(self, fam: str):
        self.fam = fam
        self.proc = None
        self.conn = None
        self.lock = threading.Lock()

    def _start(self):
        from .worker import serve_entry
        parent, child = CTX.Pipe()
        self.proc = CTX.Process(target=serve_entry, args=(child, self.fam), daemon=True)
        self.proc.start()
        self.conn = parent

    def call(self, op: str, timeout: float = 300, **kw):
        with self.lock:
            for attempt in range(2):
                if self.proc is None or not self.proc.is_alive():
                    self._start()
                try:
                    self.conn.send((op, kw))
                    if not self.conn.poll(timeout):
                        self.proc.terminate()
                        self.proc = None
                        raise TimeoutError("Prediction took too long.")
                    ok, val = self.conn.recv()
                except (EOFError, BrokenPipeError, ConnectionResetError, OSError):
                    self.proc = None
                    if attempt == 1:
                        raise RuntimeError("The prediction worker crashed.")
                    continue
                if not ok:
                    raise ValueError(val)
                return val

    def shutdown(self):
        if self.proc is not None and self.proc.is_alive():
            self.proc.terminate()


servers = {"torch": FamilyServer("torch"), "classic": FamilyServer("classic")}


def call(fam: str, op: str, **kw):
    return servers[fam].call(op, **kw)


def shutdown_all():
    for s in servers.values():
        s.shutdown()
