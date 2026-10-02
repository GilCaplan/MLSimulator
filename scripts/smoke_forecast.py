"""API smoke test for forecasting: series set → profile → prepare → models (incl. GRU) → save → forecast → lesson check."""
import json, sys, urllib.request

BASE = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else 8765}/api"


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read()[:500]); raise


def wait(jid):
    with urllib.request.urlopen(BASE + f"/jobs/{jid}/events", timeout=900) as r:
        for line in r:
            if line.startswith(b"data:"):
                ev = json.loads(line[5:])
                if ev["type"] in ("model.failed", "job.failed"):
                    print("  ", ev["type"], ev["data"])
                if ev["type"] in ("job.finished", "job.failed", "job.cancelled"):
                    return


def train(prepared_id, models):
    job = call("POST", "/jobs/train", {"project_id": "p_x", "prepared_id": prepared_id, "options": {},
                                      "models": [{"key": m, "model_id": m, "params": {"epochs": 20} if m == "fc_gru" else {}} for m in models]})
    wait(job["job_id"])
    return job["job_id"], call("GET", f"/jobs/{job['job_id']}/result")


print("sets:", list(call("GET", "/datasets/timeseries-sets")))
ds = call("POST", "/datasets/timeseries-set", {"name": "store_sales"})
prof = call("GET", f"/datasets/{ds['id']}/profile")
print("profile:", prof["freq"], prof["season"], prof["n_series"], prof["columns_roles"], "acf7=", prof["acf"][6], [c["title"] for c in prof["coach"]])
rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"task": "forecasting", "modality": "timeseries", "target": None}, "model_ids": []})
print("prepared:", rep["splits"], rep["horizon"], rep["n_features"], [f["name"] for f in rep["features_explained"]])
models = ["fc_seasonal_naive", "fc_holt_winters", "fc_linear", "fc_gbm", "fc_gru"]
jid, res = train(rep["prepared_id"], models)
for r in res["leaderboard"]:
    m = res["models"][r["key"]]["metrics"]["test"]
    print(f"   {r['rank']} {r['label']:38s} mae={m.get('mae')} mase={m.get('mase')} 1step={m.get('one_step_mae')}")
print("coach:", [s["title"] for s in res["coach"]])
fc = res["models"]["fc_gbm"]["forecast"]
print("forecast payload:", fc["split"], len(fc["series"]), len(fc["series"][0]["forecast"]), fc["importance"][:3], fc["mase_by_step"][:3])
for key in ("fc_gbm", "fc_gru"):
    m = call("POST", "/library/save", {"job_id": jid, "key": key, "name": f"sales {key}"})
    out = call("POST", f"/library/{m['id']}/forecast", {"series": "Store B", "horizon": 14, "exog": {"promo": [1] * 5}})
    print(f"library {key}:", out["series"], len(out["forecast"]), out["forecast"][0], [e["name"] for e in out["exog"]])
# lesson
proj = call("POST", "/lessons/no_peeking/start")
ds_id = proj["dataset_id"]
for label, pipe in [("naive", {"split": {"method": "random"}}), ("solution", {"split": {"method": "time"}, "forecast": {"exog": ["promo"]}})]:
    rep = call("POST", f"/datasets/{ds_id}/prepare", {"pipeline": {"task": "forecasting", "modality": "timeseries", **pipe}, "model_ids": []})
    jid, res = train(rep["prepared_id"], ["fc_random_forest"])
    chk = call("POST", "/lessons/no_peeking/check", {"job_id": jid, "key": "fc_random_forest"})
    print(f"lesson {label}: passed={chk['passed']}", [(g["metric"], g["value"]) for g in chk["goals"]], chk.get("real_world"))
