"""Code that runs inside child processes (training jobs and the per-family prediction servers)."""
from __future__ import annotations

import os
import time
import traceback
import warnings


def _setup(family: str):
    os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
    warnings.filterwarnings("ignore")
    if family == "classic":
        try:
            import lightgbm  # noqa: F401
            import xgboost  # noqa: F401
        except Exception:  # noqa: BLE001
            pass


# ----------------------------------------------------------------------------- training
def train_entry(payload: dict, q, cancel):
    _setup(payload["family"])
    import joblib

    from .store import prepared_store
    from .train_classic import Cancelled
    emit = lambda t, d: q.put(("event", t, d))  # noqa: E731
    try:
        prepared = prepared_store.get(payload["prepared_id"])
        if payload.get("op") == "tune":
            from .tune import run_tune
            q.put(("result", run_tune(payload, prepared, emit, cancel)))
            return
        if payload.get("op") == "sweep":
            from .unsupervised import run_sweep
            q.put(("result", run_sweep(payload, prepared, emit, cancel)))
            return
        from .evaluate import evaluate
        from .registry import MODEL_INDEX, is_nn
        m = payload["model"]
        key, model_id = m["key"], m["model_id"]
        seed = int(payload.get("options", {}).get("seed", 42))
        t0 = time.time()
        notes = {}
        if MODEL_INDEX[model_id].get("trainer") == "unsupervised":
            from .unsupervised import evaluate_unsupervised, fit_unsupervised
            est = fit_unsupervised(model_id, m.get("params"), prepared, emit, cancel, key, seed)
            fit_time = time.time() - t0
            emit("model.evaluating", {"key": key})
            result = evaluate_unsupervised(est, prepared, seed)
            joblib.dump(est, payload["model_path"], compress=3)
            q.put(("result", {**result, "curve": None, "notes": {}, "cv": None, "fit_time_s": round(fit_time, 3), "n_params": None}))
            return
        if is_nn(model_id):
            from .train_nn import train_nn
            arch = m.get("nn_arch") or MODEL_INDEX[model_id]["default_arch"]
            est, curve, notes = train_nn(model_id, m.get("params"), arch, prepared, emit, cancel, key, seed)
        else:
            from .train_classic import fit_classic
            est, curve = fit_classic(model_id, m.get("params"), prepared, emit, cancel, key, seed,
                                     calibrate=payload.get("options", {}).get("calibrate"))
        fit_time = time.time() - t0
        emit("model.evaluating", {"key": key})
        result = evaluate(est, prepared, seed)
        cv = None
        folds = int(payload.get("options", {}).get("cv_folds") or 0)
        if folds >= 2 and not is_nn(model_id):
            from .train_classic import cross_validate
            emit("log", {"level": "info", "message": f"{MODEL_INDEX[model_id]['label']}: {folds}-fold cross-validation…"})
            cv = cross_validate(model_id, m.get("params"), prepared, folds, emit, cancel, key, seed,
                                payload.get("options", {}).get("cv_scoring"))
        joblib.dump(est, payload["model_path"], compress=3)
        q.put(("result", {**result, "curve": curve, "notes": notes, "cv": cv, "fit_time_s": round(fit_time, 3),
                          "n_params": _n_params(est)}))
    except Cancelled:
        q.put(("cancelled", None))
    except Exception as e:  # noqa: BLE001
        q.put(("error", f"{type(e).__name__}: {e}", traceback.format_exc()))


def _n_params(est):
    try:
        mod = est.module()
        return int(sum(p.numel() for p in mod.parameters()))
    except Exception:  # noqa: BLE001
        return None


# ----------------------------------------------------------------------------- prediction server
def serve_entry(conn, family: str):
    _setup(family)
    import numpy as np
    import pandas as pd
    cache: dict = {}

    def load(model_dir: str):
        import joblib
        mt = os.path.getmtime(os.path.join(model_dir, "model.joblib"))
        hit = cache.get(model_dir)
        if hit and hit[0] == mt:
            return hit[1], hit[2]
        pp = joblib.load(os.path.join(model_dir, "preprocessor.joblib"))
        est = joblib.load(os.path.join(model_dir, "model.joblib"))
        if len(cache) > 12:
            cache.clear()
        cache[model_dir] = (mt, pp, est)
        return pp, est

    def predict_frame(pp, est, df):
        X = pp.transform(df)
        pred = est.predict(X)
        out = {"predictions": [v.item() if hasattr(v, "item") else v for v in pp.decode_y(pred)]}
        if pp.task == "classification" and hasattr(est, "predict_proba"):
            try:
                out["probabilities"] = np.round(np.asarray(est.predict_proba(X)), 4).tolist()
            except Exception:  # noqa: BLE001
                pass
            out["classes"] = pp.classes
        return out, pred

    def handle(op, kw):
        if op == "ping":
            return {"ok": True, "family": family, "pid": os.getpid()}
        if op == "validate_arch":
            from .nn.builder import summarize
            return summarize(kw["arch"], kw["n_features"], kw["n_out"], kw.get("image_shape"))
        pp, est = load(kw["model_dir"])
        if op == "assign":
            X = pp.transform(pd.DataFrame(kw["rows"]))
            return est.assign(X)
        if op == "predict_arrays":
            X = pp.transform(np.asarray(kw["images"]))
            pred = est.predict(X)
            out = {"predictions": [v.item() if hasattr(v, "item") else v for v in pp.decode_y(pred)]}
            if pp.task == "classification" and hasattr(est, "predict_proba"):
                out["probabilities"] = np.round(np.asarray(est.predict_proba(X)), 4).tolist()
                out["classes"] = pp.classes
            return out
        if op == "predict_image":
            from .images import decode_data_uri, png_data_uri
            imgs = [decode_data_uri(u) for u in kw["images"]]
            X = pp.transform(imgs)
            pred = est.predict(X)
            out = {"predictions": [v.item() if hasattr(v, "item") else v for v in pp.decode_y(pred)]}
            if pp.task == "classification" and hasattr(est, "predict_proba"):
                out["probabilities"] = np.round(np.asarray(est.predict_proba(X)), 4).tolist()
                out["classes"] = pp.classes
            c, h, w = pp.image_shape
            seen = (X[0].reshape(c, h, w).transpose(1, 2, 0) * 255).astype(np.uint8)
            out["model_input"] = png_data_uri(seen[:, :, 0] if c == 1 else seen, 128)
            if hasattr(est, "module"):
                try:
                    import torch
                    m = est.module()
                    xt = torch.tensor(X[:1], dtype=torch.float32, requires_grad=True)
                    o = m(xt)
                    (o[0, int(o[0].argmax())] if pp.task == "classification" else o[0, 0]).backward()
                    g = xt.grad.abs().reshape(c, h, w).amax(0).numpy()
                    g = (g - g.min()) / (g.max() - g.min() + 1e-9)
                    out["saliency"] = np.round(g, 2).tolist()
                except Exception:  # noqa: BLE001
                    pass
            return out
        if op == "predict":
            out, _ = predict_frame(pp, est, pd.DataFrame(kw["rows"]))
            return out
        if op == "predict_frame":
            df = kw["frame"]
            out, pred = predict_frame(pp, est, df)
            target = pp.target
            if target in df.columns and df[target].notna().any():
                from .evaluate import cls_metrics, reg_metrics
                mask = df[target].notna().to_numpy()
                if pp.task == "classification":
                    known = df[target].astype(str).isin(pp.classes).to_numpy() & mask
                    y = pp.encode_y(df.loc[known, target])
                    proba = np.asarray(out["probabilities"])[known] if "probabilities" in out else None
                    out["metrics"] = cls_metrics(y, np.asarray(pred)[known].astype(int), proba, len(pp.classes))
                    from sklearn.metrics import confusion_matrix
                    out["confusion"] = {"labels": pp.classes, "matrix": confusion_matrix(y, np.asarray(pred)[known].astype(int), labels=list(range(len(pp.classes)))).tolist()}
                else:
                    yt = pd.to_numeric(df.loc[mask, target], errors="coerce").to_numpy(float)
                    out["metrics"] = reg_metrics(yt, np.asarray(out["predictions"], float)[mask])
            return out
        if op == "sensitivity":
            row = kw["row"]
            base = pd.DataFrame([row])
            curves = []
            for inp in pp.input_schema:
                if inp["type"] != "numeric" or inp["min"] is None or inp["max"] is None or inp["min"] == inp["max"]:
                    continue
                xs = np.linspace(inp["min"], inp["max"], 24)
                df = pd.concat([base] * len(xs), ignore_index=True)
                df[inp["name"]] = xs
                X = pp.transform(df)
                if pp.task == "classification" and hasattr(est, "predict_proba"):
                    target_cls = kw.get("class_index")
                    P = np.asarray(est.predict_proba(X))
                    ci = int(target_cls) if target_cls is not None else int(np.asarray(est.predict(pp.transform(base)))[0])
                    ys = P[:, ci]
                else:
                    ys = pp.decode_y(est.predict(X))
                curves.append({"name": inp["name"], "x": np.round(xs, 4).tolist(), "y": np.round(np.asarray(ys, float), 4).tolist()})
                if len(curves) >= 16:
                    break
            return {"curves": curves}
        raise ValueError(f"Unknown op {op}")

    while True:
        try:
            op, kw = conn.recv()
        except (EOFError, OSError):
            break
        try:
            conn.send((True, handle(op, kw)))
        except Exception as e:  # noqa: BLE001
            conn.send((False, f"{type(e).__name__}: {e}"))
