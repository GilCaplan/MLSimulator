"""FastAPI application factory: API routers + the built single-page app."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import FRONTEND_DIST
from .core import ports, procs
from .core.jobs import manager


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        manager.set_loop(asyncio.get_running_loop())

        async def announce():
            server = getattr(app.state, "server", None)
            while server is not None and not server.started:
                await asyncio.sleep(0.05)
            ports.write_server_json(app.state.port, getattr(app.state, "handoff_token", None))

        task = asyncio.create_task(announce())
        yield
        task.cancel()
        procs.shutdown_all()
        ports.clear_server_json(app.state.port)

    app = FastAPI(title="ML Playground", lifespan=lifespan)
    app.state.port = 0
    app.add_middleware(CORSMiddleware, allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
                       allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(KeyError)
    async def not_found(_req: Request, exc: KeyError):
        return JSONResponse({"error": "Not found", "detail": str(exc).strip("'")}, status_code=404)

    @app.exception_handler(ValueError)
    async def bad_request(_req: Request, exc: ValueError):
        return JSONResponse({"error": str(exc), "detail": str(exc)}, status_code=400)

    @app.exception_handler(HTTPException)
    async def http_exc(_req: Request, exc: HTTPException):
        return JSONResponse({"error": exc.detail, "detail": exc.detail}, status_code=exc.status_code)

    from .api import datasets, labs, lessons, library, media, projects, system, train
    for r in (system.router, projects.router, media.router, datasets.router, train.router, library.router, lessons.router, labs.router):
        app.include_router(r, prefix="/api")

    if (FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Unknown API route")
        f = FRONTEND_DIST / path
        if path and f.is_file() and FRONTEND_DIST in f.resolve().parents:
            return FileResponse(f)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        return JSONResponse({"message": "Frontend not built yet. Run: cd frontend && npm run build"})

    return app
