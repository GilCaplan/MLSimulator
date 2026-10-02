"""API smoke test: try a trained (unsaved) model — random examples by class and your own inputs (tabular, image, text)."""
import json, sys, urllib.request

BASE = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else 8765}/api"


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read()[:300]); raise


def train(prepared_id, models):
    job = call("POST", "/jobs/train", {"project_id": "p_x", "prepared_id": prepared_id, "options": {},
                                      "models": [{"key": m, "model_id": m, "params": {"epochs": 5} if m in ("cnn2d", "embedding_bag") else {}} for m in models]})
    with urllib.request.urlopen(BASE + f"/jobs/{job['job_id']}/events", timeout=600) as r:
        for line in r:
            if line.startswith(b"data:") and json.loads(line[5:])["type"] in ("job.finished", "job.failed"):
                break
    return job["job_id"]


# tabular
ds = call("POST", "/datasets/sample", {"name": "iris"})
rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"target": "species", "task": "classification"}, "model_ids": []})
jid = train(rep["prepared_id"], ["random_forest"])
ex = call("GET", f"/jobs/{jid}/models/random_forest/example?label=virginica&seed=1")
print("tabular example:", ex["truth"], "→", ex["prediction"], ex["correct"], list(ex["input"]["row"].items())[:2], len(ex["probabilities"]))
own = call("POST", f"/jobs/{jid}/models/random_forest/try", {"row": {"sepal_length": 5.0, "sepal_width": 3.4, "petal_length": 1.5, "petal_width": 0.2}})
print("tabular own:", own["prediction"], own["probabilities"])
print("schema:", [c["name"] for c in call("GET", f"/jobs/{jid}/models/random_forest/inputs")["input_schema"]])
# image
ds = call("POST", "/datasets/image-set", {"name": "shapes", "params": {"n_images": 400}})
rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"target": "label", "task": "classification", "modality": "image"}, "model_ids": []})
jid = train(rep["prepared_id"], ["logistic_regression"])
ex = call("GET", f"/jobs/{jid}/models/logistic_regression/example?label=star&seed=2")
print("image example:", ex["truth"], "→", ex["prediction"], ex["correct"], ex["input"]["image"][:30], "model_input" in ex)
own = call("POST", f"/jobs/{jid}/models/logistic_regression/try", {"image": ex["input"]["image"]})
print("image own:", own["prediction"])
# text
ds = call("POST", "/datasets/text-set", {"name": "reviews"})
rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"target": "sentiment", "task": "classification", "modality": "text"}, "model_ids": []})
jid = train(rep["prepared_id"], ["logistic_regression"])
ex = call("GET", f"/jobs/{jid}/models/logistic_regression/example?seed=3")
print("text example:", ex["input"]["text"][:50], "|", ex["truth"], "→", ex["prediction"], "tokens" in ex)
own = call("POST", f"/jobs/{jid}/models/logistic_regression/try", {"text": "not good at all, really disappointing"})
print("text own:", own["prediction"], own["tokens"][:3])
