"""API smoke test for the regularization / regression-metrics / thresholds lessons: naive fails, fix passes."""
import json, sys, urllib.request

BASE = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else 8765}/api"


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read()[:400]); raise


def train(prepared_id, models):
    job = call("POST", "/jobs/train", {"project_id": "p_x", "prepared_id": prepared_id, "options": {}, "models": models})
    with urllib.request.urlopen(BASE + f"/jobs/{job['job_id']}/events", timeout=600) as r:
        for line in r:
            if line.startswith(b"data:") and json.loads(line[5:])["type"] in ("job.finished", "job.failed"):
                break
    return job["job_id"], call("GET", f"/jobs/{job['job_id']}/result")


CASES = {
    "regularization": ("score", [{"key": "a", "model_id": "linear_regression", "params": {}}],
                       [{"key": "a", "model_id": "lasso", "params": {"alpha": 0.3}}]),
    "regression_metrics": ("minutes", [{"key": "a", "model_id": "linear_regression", "params": {}}],
                           [{"key": "a", "model_id": "gradient_boosting", "params": {"loss": "absolute_error"}}]),
    "thresholds": ("label", [{"key": "a", "model_id": "logistic_regression", "params": {}}],
                   [{"key": "a", "model_id": "logistic_regression", "params": {}, "threshold": 0.85}]),
}
for lid, (target, naive, fix) in CASES.items():
    proj = call("POST", f"/lessons/{lid}/start")
    rep = call("POST", f"/datasets/{proj['dataset_id']}/prepare", {"pipeline": {"target": target, "task": proj["task"]}, "model_ids": []})
    for label, models in (("naive", naive), ("fix", fix)):
        jid, res = train(rep["prepared_id"], models)
        chk = call("POST", f"/lessons/{lid}/check", {"job_id": jid, "key": "a"})
        print(f"{lid:18s} {label:5s} passed={chk['passed']}", [(g["metric"], g["value"]) for g in chk["goals"]])
        if lid == "thresholds" and label == "fix":
            m = call("POST", "/library/save", {"job_id": jid, "key": "a", "name": "spam 0.85"})
            print("   saved threshold:", m.get("threshold"), "| test metrics:", {k: res["models"]["a"]["metrics"]["test"][k] for k in ("precision", "recall")} if "precision" in res["models"]["a"]["metrics"]["test"] else list(res["models"]["a"]["metrics"]["test"])[:8])
