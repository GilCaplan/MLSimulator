"""Prove every lesson challenge is well-posed: the starting setup FAILS on the hidden test and the intended fix
PASSES, using only tools available in the app. Runs several seeds for robustness.

    PYTHONPATH=. .venv/bin/python scripts/validate_lessons.py [--seeds 7,11,23] [--verbose]
"""
import argparse
import copy
import sys
import warnings

import mlp  # noqa: F401
try:
    import lightgbm, xgboost  # noqa: F401,E401  (OpenMP load order; this script never imports torch)
except Exception:
    pass
from mlp.core.pipeline import prepare
from mlp.core.evaluate import cls_metrics, reg_metrics
from mlp.core.registry import build_estimator, defaults
from mlp.lessons.generators import GENERATORS
from mlp.lessons.grading import CHALLENGES, grade

warnings.filterwarnings("ignore")


def deep_merge(a: dict, b: dict) -> dict:
    out = copy.deepcopy(a)
    for k, v in (b or {}).items():
        out[k] = deep_merge(out.get(k, {}), v) if isinstance(v, dict) and isinstance(out.get(k), dict) else copy.deepcopy(v)
    return out


def run(lesson, cfg_name, seed):
    ch = CHALLENGES[lesson]
    train, hidden = GENERATORS[lesson](seed=seed)
    pipe = deep_merge({"target": ch["target"], "task": ch["task"]}, ch["preset_pipeline"])
    params = copy.deepcopy(ch.get("preset_params", {}))
    models, options = list(ch["preset_models"]), {}
    if cfg_name != "naive":
        cfg = ch[cfg_name]
        pipe = deep_merge(pipe, cfg.get("pipeline", {}))
        params = deep_merge(params, cfg.get("params", {}))
        models = cfg.get("models", models)
        options = cfg.get("options", {})
    prepared = prepare(train, pipe, "validate")
    pp = prepared.preprocessor
    baseline_value = float(train[ch["target"]].mean()) if ch["task"] == "regression" else None
    out = {}
    for mid in models:
        est = build_estimator(mid, ch["task"], {**defaults(mid), **params.get(mid, {})}, n_classes=len(prepared.classes or []), seed=42)
        if options.get("calibrate") and ch["task"] == "classification":
            from sklearn.calibration import CalibratedClassifierCV
            est = CalibratedClassifierCV(est, method=options["calibrate"], cv=3)
        est.fit(prepared.X_train, prepared.y_train)
        Xh = pp.transform(hidden)
        pred = pp.decode_y(est.predict(Xh))
        proba = est.predict_proba(Xh) if hasattr(est, "predict_proba") and ch["task"] == "classification" else None
        tp = est.predict(prepared.X_test)
        your_test = (cls_metrics(prepared.y_test, tp, None, len(prepared.classes)) if ch["task"] == "classification"
                     else reg_metrics(pp.decode_y(prepared.y_test), pp.decode_y(tp)))
        out[mid] = grade(lesson, hidden, pred, proba, prepared.classes, your_test, baseline_value)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="7,11,23")
    ap.add_argument("--only", default=None)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    seeds = [int(s) for s in args.seeds.split(",")]
    ok_all = True
    for lesson, ch in CHALLENGES.items():
        if args.only and lesson != args.only:
            continue
        for seed in seeds:
            line = [f"{lesson:12s} seed={seed:<3d}"]
            for cfg in ["naive", "solution"] + [c for c in ("partial", "alt_solution") if c in ch]:
                res = run(lesson, cfg, seed)
                passed = {m: g["passed"] for m, g in res.items()}
                vals = " ".join(f"{m}:" + ",".join(f"{x['metric']}={x['value']}" for x in g["goals"]) for m, g in res.items())
                expect_pass = cfg in ("solution", "alt_solution")
                good = any(passed.values()) if expect_pass else not any(passed.values())
                ok_all &= good
                line.append(f"{'✓' if good else '✗'} {cfg}[{vals}]" if args.verbose else f"{'✓' if good else '✗'} {cfg}")
            print("  ".join(line), flush=True)
    print("\nALL CHALLENGES VALID" if ok_all else "\nSOME CHALLENGES INVALID")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
