"""API smoke test for vision: image sets → prepare (with augmentation) → train CNN/ResNet/classic → save → predict image."""
import base64, io, json, sys, urllib.request

BASE = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else 8765}/api"


def call(method, path, body=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            data = r.read()
            return data if raw else json.loads(data)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read()[:400]); raise


def wait(jid):
    with urllib.request.urlopen(BASE + f"/jobs/{jid}/events", timeout=900) as r:
        for line in r:
            if line.startswith(b"data:"):
                ev = json.loads(line[5:])
                if ev["type"] in ("model.failed", "job.failed"):
                    print("  ", ev["type"], ev["data"])
                if ev["type"] in ("job.finished", "job.failed", "job.cancelled"):
                    return


print("problems:", [p["id"] for p in call("GET", "/problems") if p["enabled"]])
print("image models:", [m["id"] for m in call("GET", "/models/registry?task=classification&modality=image")])
for name, task, target, models in [("shapes", "classification", "label", ["cnn2d", "tiny_resnet", "logistic_regression", "random_forest"]),
                                   ("count_dots", "regression", "value", ["cnn2d", "random_forest"])]:
    ds = call("POST", "/datasets/image-set", {"name": name, "params": {"n_images": 1200}})
    print(name, ds["n_rows"], ds["image_shape"], ds["modality"])
    png = call("GET", f"/datasets/{ds['id']}/image/0?size=64", raw=True); print("  thumbnail bytes", len(png))
    prof = call("GET", f"/datasets/{ds['id']}/profile?target={target}"); print("  profile", list(prof.keys()), len(prof["projection"]))
    rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"task": task, "target": target, "image": {"size": 32, "augment": {"flip_h": True, "rotate": 15, "shift": 0.1}}}, "model_ids": models})
    print("  prepared", rep["splits"], rep["image_shape"], len(rep["augment_preview"]))
    cfg = [{"key": m, "model_id": m, "params": {"epochs": 25} if m in ("cnn2d", "tiny_resnet") else {}} for m in models]
    job = call("POST", "/jobs/train", {"project_id": "p_x", "prepared_id": rep["prepared_id"], "models": cfg, "options": {}})
    wait(job["job_id"])
    res = call("GET", f"/jobs/{job['job_id']}/result")
    for r in res["leaderboard"]:
        v = res["models"][r["key"]].get("vision") or {}
        print(f"   {r['rank']} {r['label']:28s} {r['metric']}={r['score']} vision={sorted(v.keys())}")
    m = call("POST", "/library/save", {"job_id": job["job_id"], "key": "cnn2d", "name": f"{name} cnn"})
    from PIL import Image
    buf = io.BytesIO(); Image.new("RGB", (50, 40), (200, 30, 30)).save(buf, "PNG")
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    out = call("POST", f"/library/{m['id']}/predict-image", {"images": [uri]})
    print("  predict-image:", out["predictions"], "saliency" in out, out.get("classes"))
