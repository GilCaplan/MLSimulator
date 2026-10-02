from __future__ import annotations

from fastapi import APIRouter, Body

from ..core.store import projects

router = APIRouter()


@router.get("/projects")
def list_projects():
    return projects.list()


@router.post("/projects")
def create_project(doc: dict = Body(default={})):
    return projects.create(doc)


@router.get("/projects/{pid}")
def get_project(pid: str):
    return projects.get(pid)


@router.put("/projects/{pid}")
def put_project(pid: str, doc: dict = Body(...)):
    cur = projects.get(pid)
    return projects.save({**cur, **doc, "id": pid, "created_at": cur.get("created_at")})


@router.delete("/projects/{pid}")
def delete_project(pid: str):
    projects.delete(pid)
    return {"ok": True}
