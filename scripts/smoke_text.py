"""API smoke test for text classification: text set → prepare → classic + torch text models → save → predict text."""
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


print("text models:", [m["id"] for m in call("GET", "/models/registry?task=classification&modality=text")])
ds = call("POST", "/datasets/text-set", {"name": "reviews"})
prof = call("GET", f"/datasets/{ds['id']}/profile?target=sentiment")
print("profile:", prof["text_column"], [(t["class"], [w["t"] for w in t["words"][:5]]) for t in prof["top_words"]])
models = ["logistic_regression", "multinomial_nb", "embedding_bag", "gru", "text_transformer"]
for ngram in (1, 2):
    rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"task": "classification", "target": "sentiment", "modality": "text", "text": {"ngram_max": ngram}}, "model_ids": models})
    job = call("POST", "/jobs/train", {"project_id": "p_x", "prepared_id": rep["prepared_id"], "options": {},
                                      "models": [{"key": m, "model_id": m, "params": {}} for m in models]})
    wait(job["job_id"])
    res = call("GET", f"/jobs/{job['job_id']}/result")
    print(f"ngram={ngram} features={rep['n_features']} vocab={rep['vocab_size']}")
    for r in res["leaderboard"]:
        t = res["models"][r["key"]].get("text") or {}
        print(f"   {r['rank']} {r['label']:28s} acc={r['score']}  text={sorted(t.keys())}")
ex = res["models"]["logistic_regression"]["text"]["examples"][0]
print("example attribution:", ex["text"], [(w["t"], w["w"]) for w in ex["tokens"]][:8])
for key in ("logistic_regression", "gru"):
    m = call("POST", "/library/save", {"job_id": job["job_id"], "key": key, "name": f"reviews {key}"})
    out = call("POST", f"/library/{m['id']}/predict-text", {"texts": ["the battery is not good at all", "the screen is not bad"]})
    print(key, out["predictions"], [(w["t"], w["w"]) for w in out["tokens"]])
