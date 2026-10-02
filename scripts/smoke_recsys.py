"""API smoke test for recommenders: ratings set → prepare → 5 models → save → recommend (known + new user)."""
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


ds = call("POST", "/datasets/ratings-set", {"name": "movies"})
prof = call("GET", f"/datasets/{ds['id']}/profile")
print("profile:", prof["n_users"], prof["n_items"], prof["sparsity"], prof["top_items"][0])
rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"task": "recommendation", "modality": "ratings", "target": None}, "model_ids": []})
print("prepared:", rep["splits"], rep["n_users"], rep["n_items"])
models = ["popularity", "item_knn", "user_knn", "svd", "mf_als"]
job = call("POST", "/jobs/train", {"project_id": "p_x", "prepared_id": rep["prepared_id"], "options": {},
                                  "models": [{"key": m, "model_id": m, "params": {}} for m in models]})
wait(job["job_id"])
res = call("GET", f"/jobs/{job['job_id']}/result")
for r in res["leaderboard"]:
    m = res["models"][r["key"]]["metrics"]["test"]
    print(f"   {r['rank']} {r['label']:28s} ndcg={m.get('ndcg_at_10')} recall={m.get('recall_at_10')} cov={m.get('coverage')} rmse={m.get('rmse')}")
print("coach:", [s["title"] for s in res["coach"]])
m = call("POST", "/library/save", {"job_id": job["job_id"], "key": "item_knn", "name": "movies knn"})
cat = call("GET", f"/library/{m['id']}/catalog?limit=5")
print("catalog:", [c["title"] for c in cat["items"]])
known = call("POST", f"/library/{m['id']}/recommend", {"user": cat["users"][0], "k": 5})
print("known user:", [(x["title"], x.get("because")) for x in known["items"]])
pick = {c["item"]: 5 for c in cat["items"][:2]}
new = call("POST", f"/library/{m['id']}/recommend", {"ratings": pick, "k": 5})
print("new user:", new["user_kind"], new["n_rated"], [x["title"] for x in new["items"]])
