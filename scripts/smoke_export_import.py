"""API smoke test: export a model bundle (architecture + weights + signed manifest) and import it back,
including the tamper check and the 'trust this file' gate for bundles from elsewhere."""
import io, json, sys, urllib.request, uuid, zipfile

BASE = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else 8765}/api"


def call(method, path, body=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read() if raw else json.loads(r.read())


def upload(data: bytes, trust=False):
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"m.zip\"\r\nContent-Type: application/zip\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(BASE + "/library/import" + ("?trust=true" if trust else ""), method="POST", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


ds = call("POST", "/datasets/sample", {"name": "iris"})
rep = call("POST", f"/datasets/{ds['id']}/prepare", {"pipeline": {"target": "species", "task": "classification"}, "model_ids": []})
job = call("POST", "/jobs/train", {"project_id": "p_x", "prepared_id": rep["prepared_id"], "options": {},
                                  "models": [{"key": "rf", "model_id": "random_forest", "params": {}},
                                             {"key": "mlp", "model_id": "mlp", "params": {"epochs": 5}}]})
with urllib.request.urlopen(BASE + f"/jobs/{job['job_id']}/events", timeout=600) as r:
    for line in r:
        if line.startswith(b"data:") and json.loads(line[5:])["type"] in ("job.finished", "job.failed"):
            break
row = {"sepal_length": 6.5, "sepal_width": 3.0, "petal_length": 5.5, "petal_width": 2.0}
for key in ("rf", "mlp"):
    m = call("POST", "/library/save", {"job_id": job["job_id"], "key": key, "name": f"iris {key}"})
    z = call("GET", f"/library/{m['id']}/export", raw=True)
    names = sorted(zipfile.ZipFile(io.BytesIO(z)).namelist())
    arch = json.loads(zipfile.ZipFile(io.BytesIO(z)).read("architecture.json"))
    print(f"{key}: bundle files {names}")
    print(f"   architecture: model_id={arch['model_id']} nn_arch={'yes' if arch['nn_arch'] else 'no'} params={list(arch['params'])[:3]}")
    st, imp = upload(z)
    print(f"   import own bundle → {st}, signed={imp.get('imported_signed')}, name={imp.get('name')}")
    pred = call("POST", "/library/" + imp["id"] + "/predict", {"rows": [row]})["predictions"]
    print(f"   predict with imported → {pred}")
# tampered: change meta.json but keep the manifest
src = zipfile.ZipFile(io.BytesIO(z))
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as out:
    for n in src.namelist():
        d = src.read(n)
        if n == "meta.json":
            d = d.replace(b'"name": "iris mlp"', b'"name": "evil"') if b'"name": "iris mlp"' in d else d + b" "
        out.writestr(n, d)
st, r = upload(buf.getvalue())
print("tampered →", st, r.get("error") or r.get("detail"))
# foreign: drop the signature (as if exported elsewhere)
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as out:
    for n in src.namelist():
        if n != "SIGNATURE":
            out.writestr(n, src.read(n))
st, r = upload(buf.getvalue())
print("unsigned →", st, r.get("needs_trust"), r.get("reason"))
st, r = upload(buf.getvalue(), trust=True)
print("unsigned + trust →", st, r.get("name"), r.get("imported_signed"))
st, r = upload(b"not a zip")
print("garbage →", st, r.get("error"))
