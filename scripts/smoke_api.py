"""End-to-end API smoke test against a running server."""
import json, sys, time, urllib.request

BASE = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else 8765}/api"


def call(method, path, body=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = r.read()
            return data if raw else json.loads(data)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read()[:500]); raise


def stream(jid):
    types = {}
    with urllib.request.urlopen(BASE + f"/jobs/{jid}/events", timeout=600) as r:
        for line in r:
            line = line.decode().strip()
            if line.startswith("data:"):
                ev = json.loads(line[5:])
                types[ev["type"]] = types.get(ev["type"], 0) + 1
                if ev["type"] in ("model.failed", "job.failed", "log"):
                    print("  ", ev["type"], ev["data"])
                if ev["type"] in ("job.finished", "job.failed", "job.cancelled"):
                    break
    return types


print(call("GET", "/health"))
proj = call("POST", "/projects", {"name": "smoke", "task": "classification"})
ds = call("POST", "/datasets/sample", {"name": "fraud"})
print("dataset", ds["id"], ds["n_rows"], [c["role"] for c in ds["columns"]])
prof = call("GET", f"/datasets/{ds['id']}/profile?target=is_fraud&task=classification")
print("coach", [s["title"] for s in prof["coach"]])
rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"target": "is_fraud", "task": "classification",
           "resample": {"mode": "oversample", "over": "smote"}}, "model_ids": ["svm", "mlp"]})
print("prepared", rep["prepared_id"], rep["class_counts_before"], rep["class_counts_after"], len(rep["after_points"]))
t = time.time()
job = call("POST", "/jobs/train", {"project_id": proj["id"], "prepared_id": rep["prepared_id"], "options": {"cv_folds": 3},
           "models": [{"key": "a", "model_id": "xgboost"}, {"key": "b", "model_id": "mlp", "params": {"epochs": 20}},
                      {"key": "c", "model_id": "logistic_regression"}, {"key": "d", "model_id": "lightgbm"},
                      {"key": "e", "model_id": "gcn", "params": {"epochs": 30}}, {"key": "f", "model_id": "random_forest"}]})
print("events", stream(job["job_id"]), round(time.time() - t, 1), "s")
res = call("GET", f"/jobs/{job['job_id']}/result")
for r in res["leaderboard"]:
    print("  ", r["rank"], r["label"], r["score"], r["train_score"], r["fit_time_s"])
print("coach", [s["title"] for s in res["coach"]])
print("failures", res["failures"])
m = call("POST", "/library/save", {"job_id": job["job_id"], "key": "b", "name": "fraud mlp"})
m2 = call("POST", "/library/save", {"job_id": job["job_id"], "key": "a", "name": "fraud xgb"})
row = {"amount": 900, "hour": 3, "distance_km": 40, "account_age_days": 20, "channel": "online", "foreign": 1}
for mid in (m["id"], m2["id"]):
    t = time.time(); p = call("POST", f"/library/{mid}/predict", {"rows": [row]}); print("predict", p, round(time.time() - t, 2))
    t = time.time(); p = call("POST", f"/library/{mid}/predict", {"rows": [row]}); print("predict again", round(time.time() - t, 3))
    s = call("POST", f"/library/{mid}/sensitivity", {"row": row}); print("sens", len(s["curves"]))
print(len(call("GET", "/library")))
v = call("POST", "/nn/validate", {"arch": {"kind": "mlp", "layers": [{"type": "dense", "units": 16}]}, "n_features": 8, "n_out": 2}); print("validate", v["total_params"])
job = call("POST", "/jobs/tune", {"prepared_id": rep["prepared_id"], "model_id": "random_forest", "params": {"n_estimators": 50},
           "space": {"max_depth": {"min": 2, "max": 20}, "min_samples_leaf": {"min": 1, "max": 10}}, "n_iter": 6, "cv": 3, "scoring": "f1"})
print("tune events", stream(job["job_id"]))
tr = call("GET", f"/jobs/{job['job_id']}/result"); print("tune best", tr["best"], tr["baseline"], tr["improvement"])
ds2 = call("POST", "/datasets/synthetic", {"n_samples": 300, "features": [{"name": "a", "dist": "normal"}, {"name": "b", "dist": "categorical"}],
            "target": {"name": "y", "task": "regression", "rule": {"type": "linear", "weights": {"a": 2, "b": 1}}}})
print("synthetic", ds2["n_rows"], [c["name"] for c in ds2["columns"]])
pv = call("POST", "/datasets/preset/preview", {"preset": "spirals", "params": {}}); print("preset preview", len(pv["points"]))
cp = call("POST", f"/datasets/{ds2['id']}/compose", {"add_features": [{"name": "z", "dist": "uniform"}], "add_rows": 100, "target": "y"}); print("compose", cp["n_rows"], cp["n_cols"])
print(call("GET", "/system/ports")["free"][:5])
