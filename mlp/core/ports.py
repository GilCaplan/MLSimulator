"""Port scanning and live port switching (spawn a new server, then retire the old one)."""
from __future__ import annotations

import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.request

from ..config import PORT_RANGE, ROOT, SERVER_JSON, SERVER_LOG


def is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def scan(start: int = PORT_RANGE[0], end: int = PORT_RANGE[1]) -> dict:
    free, busy = [], []
    for p in range(start, end + 1):
        (free if is_free(p) else busy).append(p)
    return {"free": free, "busy": busy, "range": [start, end]}


def health(port: int, timeout: float = 1.0) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=timeout) as r:
            return json.loads(r.read())
    except Exception:  # noqa: BLE001
        return None


def write_server_json(port: int, token: str | None = None):
    SERVER_JSON.write_text(json.dumps({"pid": os.getpid(), "port": port, "token": token, "started_at": time.time()}))


def clear_server_json(port: int):
    try:
        d = json.loads(SERVER_JSON.read_text())
        if d.get("pid") == os.getpid():
            SERVER_JSON.unlink(missing_ok=True)
    except (OSError, json.JSONDecodeError):
        pass


class Handoff:
    """State for retiring this server after a successor is healthy."""

    def __init__(self):
        self.goodbye = threading.Event()
        self.target: int | None = None
        self.token: str | None = None


handoff = Handoff()


def spawn_successor(new_port: int, current_port: int, server) -> dict:
    token = secrets.token_hex(8)
    handoff.target, handoff.token = new_port, token
    handoff.goodbye.clear()
    log = open(SERVER_LOG, "ab")
    detach = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW}
              if os.name == "nt" else {"start_new_session": True})
    subprocess.Popen([sys.executable, "-m", "mlp.main", "--port", str(new_port), "--handoff-from", str(current_port),
                      "--handoff-token", token], cwd=str(ROOT), stdout=log, stderr=log, stdin=subprocess.DEVNULL, **detach)

    def watch():
        t0 = time.time()
        healthy_at = None
        while time.time() - t0 < 60:
            h = health(new_port)
            if h and h.get("ready"):
                healthy_at = healthy_at or time.time()
                if handoff.goodbye.is_set() or time.time() - healthy_at > 30:
                    time.sleep(0.4)
                    server.should_exit = True
                    return
            time.sleep(0.3)
        handoff.target = None  # successor never came up; keep serving

    threading.Thread(target=watch, daemon=True).start()
    return {"status": "starting", "port": new_port}
