"""Smoke test: train every model family on small datasets.

Like the app, PyTorch and XGBoost/LightGBM run in separate interpreters (their OpenMP runtimes clash on macOS).

    PYTHONPATH=. .venv/bin/python scripts/smoke_models.py            # both families
    PYTHONPATH=. .venv/bin/python scripts/smoke_models.py classic    # one family
"""
import os
import subprocess
import sys
import time


def run_classic():
    import lightgbm, xgboost  # noqa: F401,E401  (load OpenMP before anything else)
    import mlp  # noqa: F401
    from mlp.core.evaluate import evaluate
    from mlp.core.pipeline import prepare
    from mlp.core.registry import MODELS
    from mlp.core.synthetic import generate_preset, load_sample
    from mlp.core.train_classic import cross_validate, fit_classic
    emit = lambda t, d: None  # noqa: E731
    df, _ = generate_preset("moons", {})
    p = prepare(df, {"target": "target", "task": "classification"}, "d")
    for mm in MODELS:
        if mm.get("nn") or "classification" not in mm["tasks"]:
            continue
        t = time.time()
        est, curve = fit_classic(mm["id"], {}, p, emit, None, mm["id"])
        e = evaluate(est, p)
        assert e["mistakes"] is not None and e["calibration"] is not None, mm["id"]
        print(f"{mm['id']:24s} acc={e['metrics']['test']['accuracy']} curve={bool(curve)} ece={e['calibration']['ece']} {time.time() - t:.1f}s", flush=True)
    est, _ = fit_classic("logistic_regression", {}, p, emit, None, "cal", calibrate="isotonic")
    print("calibrated logistic ece", evaluate(est, p)["calibration"]["ece"])
    print("cv", cross_validate("random_forest", {}, p, 5, emit, None, "rf"))
    df, _ = load_sample("housing")
    p = prepare(df, {"target": "price", "task": "regression"}, "d")
    for mid in ["baseline", "linear_regression", "xgboost", "lightgbm", "svr", "gradient_boosting", "random_forest"]:
        est, _ = fit_classic(mid, {}, p, emit, None, mid)
        e = evaluate(est, p)
        print(f"{mid:24s} r2={e['metrics']['test']['r2']} slices={len(e['slices'])}", flush=True)


def run_torch():
    import pickle

    import mlp  # noqa: F401
    from mlp.core.evaluate import evaluate
    from mlp.core.pipeline import prepare
    from mlp.core.registry import MODEL_INDEX
    from mlp.core.synthetic import generate_preset, load_sample
    from mlp.core.train_nn import train_nn
    emit = lambda t, d: None  # noqa: E731
    df, _ = generate_preset("moons", {})
    p = prepare(df, {"target": "target", "task": "classification"}, "d")
    for mid in ["mlp", "cnn1d", "ft_transformer", "gcn"]:
        t = time.time()
        w, c, n = train_nn(mid, {"epochs": 30}, MODEL_INDEX[mid]["default_arch"], p, emit, None, mid)
        e = evaluate(w, p)
        print(f"{mid:16s} acc={e['metrics']['test']['accuracy']} surface={e['surface']['kind'] if e['surface'] else None} {time.time() - t:.1f}s", flush=True)
    df, m = load_sample("digits")
    p = prepare(df, {"target": "digit", "task": "classification"}, "d", image_shape=m["image_shape"])
    w, c, n = train_nn("cnn2d", {"epochs": 15}, MODEL_INDEX["cnn2d"]["default_arch"], p, emit, None, "c")
    print("cnn2d digits acc", evaluate(w, p)["metrics"]["test"]["accuracy"])
    df, _ = load_sample("housing")
    p = prepare(df, {"target": "price", "task": "regression"}, "d")
    for mid in ["mlp", "gcn"]:
        w, c, n = train_nn(mid, {"epochs": 60}, MODEL_INDEX[mid]["default_arch"], p, emit, None, mid)
        print(f"{mid} regression r2", evaluate(w, p)["metrics"]["test"]["r2"])
    pickle.loads(pickle.dumps(w)).predict(p.X_test[:5])
    print("pickle round-trip ok")


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    if which == "classic":
        run_classic()
    elif which == "torch":
        run_torch()
    else:
        env = {**os.environ, "PYTHONPATH": os.environ.get("PYTHONPATH", ".")}
        codes = [subprocess.call([sys.executable, "-W", "ignore", __file__, fam], env=env) for fam in ("classic", "torch")]
        print("\nALL MODEL FAMILIES OK" if not any(codes) else f"\nFAILED (exit codes {codes})")
        sys.exit(1 if any(codes) else 0)
