"""API smoke test for Labs: GAN, autoencoder map (+ decode), transfer learning."""
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


def run(lab, params):
    jid = call("POST", f"/labs/{lab}/run", {"params": params})["job_id"]
    frames = 0
    with urllib.request.urlopen(BASE + f"/jobs/{jid}/events", timeout=900) as r:
        for line in r:
            if line.startswith(b"data:"):
                ev = json.loads(line[5:])
                frames += ev["type"] == "lab.frame"
                if ev["type"] == "job.failed":
                    print("  failed", ev["data"])
                if ev["type"] in ("job.finished", "job.failed", "job.cancelled"):
                    break
    return frames, call("GET", f"/jobs/{jid}/result")


print("labs:", list(call("GET", "/labs")["labs"]))
n, g = run("gan", {"target": "moons", "steps": 1500})
print("gan frames", n, "coverage", g["coverage"], "precision", g["precision"])
n, v = run("vae", {"mode": "vae", "epochs": 40})
print("vae frames", n, "grid", v["grid"]["n"], "extent", v["extent"])
dec = call("POST", "/labs/vae/decode", {"run_id": v["run_id"], "z": [[0, 0], [1, -1]]})
print("decoded", len(dec["images"]), len(dec["images"][0]))
n, t = run("transfer", {"per_class": 5, "epochs": 30})
print("transfer frames", n, {k: x["final_acc"] for k, x in t["runs"].items()})
