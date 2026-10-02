"""Entry point: python -m mlp.main --port 8765"""
from __future__ import annotations

import argparse


def main():
    ap = argparse.ArgumentParser(description="ML Playground server")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--handoff-from", type=int, default=None)
    ap.add_argument("--handoff-token", default=None)
    args = ap.parse_args()

    import uvicorn

    from .app import create_app
    app = create_app()
    config = uvicorn.Config(app, host=args.host, port=args.port, log_level="warning", access_log=False, timeout_graceful_shutdown=3)
    server = uvicorn.Server(config)
    app.state.server = server
    app.state.port = args.port
    app.state.handoff_token = args.handoff_token
    print(f"ML Playground running on http://localhost:{args.port}", flush=True)
    server.run()


if __name__ == "__main__":
    main()
