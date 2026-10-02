"""API test of an image lesson challenge: start → prepare → train → check (naive fails, fix passes)."""
import json, sys, urllib.request

BASE = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else 8765}/api"


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"http_error": e.code, "detail": json.loads(e.read()).get("error")}


def wait(jid):
    with urllib.request.urlopen(BASE + f"/jobs/{jid}/events", timeout=900) as r:
        for line in r:
            if line.startswith(b"data:") and json.loads(line[5:])["type"] in ("job.finished", "job.failed", "job.cancelled"):
                return


def attempt(lid, project, patch, models=None):
    pipe = {**(project.get("pipeline") or {}), **patch, "target": project["target"], "task": project["task"]}
    rep = call("POST", f"/datasets/{project['dataset_id']}/prepare", {"pipeline": pipe, "model_ids": []})
    ms = models or project["models"]
    job = call("POST", "/jobs/train", {"project_id": project["id"], "prepared_id": rep["prepared_id"], "models": ms, "options": {}})
    wait(job["job_id"])
    res = call("GET", f"/jobs/{job['job_id']}/result")
    return [(m["label"], m["metrics"]["test"].get("accuracy"), call("POST", f"/lessons/{lid}/check", {"job_id": job["job_id"], "key": k}).get("goals"))
            for k, m in res["models"].items() if k != "baseline"]


for lid, fix, models in [("convolutions", {}, [{"key": "cnn", "model_id": "cnn2d", "params": {}, "nn_arch": None}]),
                         ("augmentation", {"image": {"size": 32, "grayscale": False, "augment": {"rotate": 180, "shift": 0.3}}}, None)]:
    p = call("POST", f"/lessons/{lid}/start")
    print(lid, "project", p["id"], p.get("modality"), [m["model_id"] for m in p["models"]])
    print("  naive:", [(a, b, [(g["value"], g["passed"]) for g in (c or [])]) for a, b, c in attempt(lid, p, {})])
    print("  fixed:", [(a, b, [(g["value"], g["passed"]) for g in (c or [])]) for a, b, c in attempt(lid, p, fix, models)])
