"""Cross-platform smoke test (used by CI on Linux, macOS and Windows) against the server started by launcher/launch.py:
sample data → prepare → train a classic model and a PyTorch network (separate worker processes) → save → predict."""
import json, os, sys, urllib.request
from pathlib import Path

DATA = Path(os.environ.get("MLP_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
PORT = json.loads((DATA / "run" / "server.json").read_text())["port"]
BASE = f"http://127.0.0.1:{PORT}/api"


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())


ds = call("POST", "/datasets/sample", {"name": "iris"})
target = "species"
rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"target": target, "task": "classification"}, "model_ids": []})
models = [{"key": "lr", "model_id": "logistic_regression", "params": {}}, {"key": "mlp", "model_id": "mlp", "params": {"epochs": 5}}]
job = call("POST", "/jobs/train", {"project_id": "p_ci", "prepared_id": rep["prepared_id"], "options": {}, "models": models})
with urllib.request.urlopen(BASE + f"/jobs/{job['job_id']}/events", timeout=600) as r:
    for line in r:
        if line.startswith(b"data:"):
            ev = json.loads(line[5:])
            if ev["type"] in ("model.failed", "job.failed"):
                sys.exit(f"FAILED: {ev['data']}")
            if ev["type"] in ("job.finished", "job.cancelled"):
                break
res = call("GET", f"/jobs/{job['job_id']}/result")
accs = {k: res["models"][k]["metrics"]["test"]["accuracy"] for k in ("lr", "mlp")}
print("accuracy:", accs)
m = call("POST", "/library/save", {"job_id": job["job_id"], "key": "mlp", "name": "ci"})
pred = call("POST", f"/library/{m['id']}/predict", {"rows": [{"sepal_length": 5.1, "sepal_width": 3.5, "petal_length": 1.4, "petal_width": 0.2}]})
print("prediction:", pred["predictions"])
assert accs["lr"] > 0.8, accs
print("PLATFORM SMOKE OK")
