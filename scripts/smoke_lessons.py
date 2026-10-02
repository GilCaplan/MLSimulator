"""API test of the lesson challenge loop: start -> prepare -> train -> check (naive fails, fix passes)."""
import json, sys, urllib.request

BASE = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else 8765}/api"


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"http_error": e.code, "detail": json.loads(e.read()).get("error")}


def wait(jid):
    with urllib.request.urlopen(BASE + f"/jobs/{jid}/events", timeout=600) as r:
        for line in r:
            if line.startswith(b"data:") and json.loads(line[5:])["type"] in ("job.finished", "job.failed", "job.cancelled"):
                return


def attempt(project, pipeline_patch):
    pipe = {**(project.get("pipeline") or {}), **pipeline_patch, "target": project["target"], "task": project["task"]}
    rep = call("POST", f"/datasets/{project['dataset_id']}/prepare", {"pipeline": pipe, "model_ids": [m["model_id"] for m in project["models"]]})
    job = call("POST", "/jobs/train", {"project_id": project["id"], "prepared_id": rep["prepared_id"], "models": project["models"], "options": {}})
    wait(job["job_id"])
    res = call("GET", f"/jobs/{job['job_id']}/result")
    out = []
    for key, m in res["models"].items():
        chk = call("POST", f"/lessons/{project['challenge']['lesson_id']}/check", {"job_id": job["job_id"], "key": key})
        out.append((m["label"], m["metrics"]["test"].get("accuracy") or m["metrics"]["test"].get("r2"), chk.get("passed"),
                    [(g["metric"], g["value"]) for g in chk.get("goals", [])] or chk))
    return out


print([(l["id"], l["title"]) for l in call("GET", "/lessons")])
L = call("GET", "/lessons/leakage"); print("goals:", [g["label"] for g in L["challenge"]["goals"]], "| quiz:", len(L["quiz"]))
p = call("POST", "/lessons/leakage/start"); print("project", p["id"], p["step"], [m["model_id"] for m in p["models"]])
print("naive:", attempt(p, {}))
print("fixed:", attempt(p, {"drop_columns": ["carrier_delay_min", "weather_delay_min", "late_aircraft_min"]}))
p2 = call("POST", "/lessons/scaling/start")
p2["models"].append({"key": "mlpx", "model_id": "mlp", "params": {"epochs": 30}, "nn_arch": None})
print("scaling (MLP not allowed):", attempt(p2, {"scale": {"method": "standard"}}))
print("progress:", {k: {kk: vv for kk, vv in v.items() if kk != "last_check"} for k, v in call("GET", "/lessons")[2:4] and {l["id"]: l["progress"] for l in call("GET", "/lessons")}.items()})
