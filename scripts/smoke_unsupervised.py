"""API smoke test for unsupervised learning: clustering, maps (PCA / t-SNE), anomaly detection, k sweep, assign."""
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
    types = {}
    with urllib.request.urlopen(BASE + f"/jobs/{jid}/events", timeout=900) as r:
        for line in r:
            if line.startswith(b"data:"):
                ev = json.loads(line[5:])
                types[ev["type"]] = types.get(ev["type"], 0) + 1
                if ev["type"] in ("model.failed", "job.failed"):
                    print("  ", ev["type"], ev["data"])
                if ev["type"] in ("job.finished", "job.failed", "job.cancelled"):
                    return types


def run(sample, task, truth, models, extra=None):
    ds = call("POST", "/datasets/sample", {"name": sample})
    rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"task": task, "target": None, "truth": truth, **(extra or {})}, "model_ids": models})
    print(f"{task}: prepared {rep['splits']} features={rep['n_features']} truth={rep.get('truth')} points={len(rep['before_points'])}")
    job = call("POST", "/jobs/train", {"project_id": "p_x", "prepared_id": rep["prepared_id"], "options": {},
                                      "models": [{"key": m, "model_id": m, "params": {}} for m in models]})
    print("  events", wait(job["job_id"]))
    res = call("GET", f"/jobs/{job['job_id']}/result")
    for r in res["leaderboard"]:
        m = res["models"][r["key"]]
        extras = [k for k in ("clusters", "reduction", "anomaly") if m.get(k)]
        print(f"   {r['rank']} {r['label']:24s} {r['metric']}={r['score']}  test={m['metrics']['test']}  {extras}")
    print("  coach", [s["title"] for s in res["coach"]])
    return ds, rep, job, res


ds, rep, job, res = run("customers", "clustering", "segment", ["kmeans", "gmm", "dbscan", "agglomerative"], {"scale": {"method": "standard"}})
c = res["models"]["kmeans"]["clusters"]
print("  kmeans steps", len(c["steps"]), "profiles", [(p["cluster"], p["top"][0]["feature"], p["top"][0]["z"]) for p in c["profiles"]][:3], "contingency", c["contingency"]["rows"])
sw = call("POST", "/jobs/sweep", {"prepared_id": rep["prepared_id"], "model_id": "kmeans", "k_min": 2, "k_max": 8})
wait(sw["job_id"])
sr = call("GET", f"/jobs/{sw['job_id']}/result")
print("  sweep best_k", sr["best_k"], [(r["k"], r["silhouette"], r["ari"]) for r in sr["rows"]])
m = call("POST", "/library/save", {"job_id": job["job_id"], "key": "kmeans", "name": "segments"})
print("  assign", call("POST", f"/library/{m['id']}/assign", {"rows": [{"age": 22, "avg_basket": 18, "visits_per_month": 10, "discount_share": 0.6, "online_share_pct": 72}]}))
run("customers", "reduction", "segment", ["pca", "tsne"], {"scale": {"method": "standard"}})
ds, rep, job, res = run("sensors", "anomaly", "status", ["isolation_forest", "one_class_svm", "lof"], {"scale": {"method": "standard"}})
a = res["models"]["isolation_forest"]["anomaly"]
print("  top anomaly", a["top"]["rows"][0], "surface", bool(a.get("surface")))
m = call("POST", "/library/save", {"job_id": job["job_id"], "key": "isolation_forest", "name": "faults"})
print("  assign", call("POST", f"/library/{m['id']}/assign", {"rows": [{"temperature_c": 90, "vibration_g": 2.5, "pressure_bar": 22, "rpm": 1510}]}))
