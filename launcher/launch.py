"""Cross-platform ML Playground launcher (macOS, Linux, Windows). Standard library only.

Reuses a running server (data/run/server.json + a health check) or starts one on a free port in the background, then
opens the browser. The desktop / Start-menu shortcuts created by the setup scripts run this file.

    python launcher/launch.py               # start (or reopen) the app and open the browser
    python launcher/launch.py --no-browser  # start (or find) the server only; prints its URL
    python launcher/launch.py --status      # print the URL if running (exit code 0), else exit code 1
    python launcher/launch.py --stop        # stop the background server
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("MLP_DATA_DIR", ROOT / "data"))
WINDOWS = os.name == "nt"
PORTS = range(8765, 8801)


def venv_python(gui: bool = False) -> Path:
    if WINDOWS:
        return ROOT / ".venv" / "Scripts" / ("pythonw.exe" if gui else "python.exe")
    return ROOT / ".venv" / "bin" / "python"


def log(msg: str):
    (DATA / "logs").mkdir(parents=True, exist_ok=True)
    with open(DATA / "logs" / "launcher.log", "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")


def fail(msg: str):
    log("ERROR: " + msg)
    details = f"{msg}\n\nDetails: {DATA / 'logs' / 'launcher.log'}"
    try:  # a dialog when started from a shortcut (no terminal)
        import tkinter
        from tkinter import messagebox
        root = tkinter.Tk()
        root.withdraw()
        messagebox.showerror("ML Playground", details)
        root.destroy()
    except Exception:  # noqa: BLE001
        print("ML Playground: " + details, file=sys.stderr)
    sys.exit(1)


def health(port: int) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as r:
            return json.loads(r.read())
    except Exception:  # noqa: BLE001
        return None


def running_port() -> int | None:
    """The port of a running ML Playground server, if server.json points at one that answers."""
    try:
        info = json.loads((DATA / "run" / "server.json").read_text())
    except (OSError, ValueError):
        return None
    port = info.get("port")
    h = health(port) if port else None
    return port if h and h.get("ok") and h.get("pid") == info.get("pid") else None


def free_port() -> int | None:
    for port in PORTS:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if not WINDOWS:  # allow ports in TIME_WAIT (uvicorn does the same); on Windows this would allow stealing
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    return None


def start_server(port: int):
    py = venv_python()
    if not py.exists():
        fail("The Python environment is missing. Run the setup script first (see README → Quick start).")
    if not (ROOT / "frontend" / "dist" / "index.html").exists():
        fail("The interface hasn't been built yet. Run the setup script first (see README → Quick start).")
    (DATA / "logs").mkdir(parents=True, exist_ok=True)
    out = open(DATA / "logs" / "server.log", "ab")
    kw: dict = {"cwd": str(ROOT), "stdout": out, "stderr": out, "stdin": subprocess.DEVNULL}
    if WINDOWS:
        kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
    else:
        kw["start_new_session"] = True
    subprocess.Popen([str(py), "-m", "mlp.main", "--port", str(port)], **kw)


def open_app(port: int):
    url = f"http://localhost:{port}/"
    print(url, flush=True)
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)


def main():
    if "--status" in sys.argv:
        port = running_port()
        print(f"running: http://localhost:{port}/" if port else "not running")
        sys.exit(0 if port else 1)
    if "--stop" in sys.argv:
        port = running_port()
        if port:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/system/shutdown", method="POST", data=b"")
            urllib.request.urlopen(req, timeout=3)
            for _ in range(60):  # wait until it has really gone
                if not health(port):
                    break
                time.sleep(0.25)
            print(f"Stopped the server on port {port}.")
        else:
            print("ML Playground isn't running.")
        return
    port = running_port()
    if port:
        log(f"already running on {port}")
        open_app(port)
        return
    port = free_port()
    if port is None:
        fail(f"No free port between {PORTS.start} and {PORTS.stop - 1}.")
    log(f"starting on {port}")
    start_server(port)
    for _ in range(120):
        h = health(port)
        if h and h.get("ready"):
            log("up")
            open_app(port)
            return
        time.sleep(0.25)
    fail("The server didn't start within 30 seconds.")


if __name__ == "__main__":
    main()
