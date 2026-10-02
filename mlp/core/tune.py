"""Hyperparameter search (grid / random) with per-trial events. Runs inside a classic worker process."""
from __future__ import annotations

import itertools
import math

import numpy as np

from ..util.jsonable import r
from .registry import MODEL_INDEX
from .train_classic import Cancelled, cross_validate


def _values(spec: dict, hp: dict, n: int, rng) -> list:
    if hp["type"] == "choice":
        return list(spec.get("values") or hp.get("options") or [hp["default"]])
    if hp["type"] == "bool":
        return [True, False]
    lo = float(spec.get("min", hp.get("min", 0)))
    hi = float(spec.get("max", hp.get("max", 1)))
    log = spec.get("log", hp.get("log", False)) and lo > 0
    if log:
        vals = np.geomspace(lo, hi, n)
    else:
        vals = np.linspace(lo, hi, n)
    if hp["type"] == "int":
        return sorted(set(int(round(v)) for v in vals))
    return [float(f"{v:.4g}") for v in vals]


def _sample(spec: dict, hp: dict, rng):
    if hp["type"] == "choice":
        opts = spec.get("values") or hp.get("options")
        return opts[rng.integers(len(opts))]
    if hp["type"] == "bool":
        return bool(rng.integers(2))
    lo = float(spec.get("min", hp.get("min", 0)))
    hi = float(spec.get("max", hp.get("max", 1)))
    if spec.get("log", hp.get("log", False)) and lo > 0:
        v = math.exp(rng.uniform(math.log(lo), math.log(hi)))
    else:
        v = rng.uniform(lo, hi)
    return int(round(v)) if hp["type"] == "int" else float(f"{v:.4g}")


def run_tune(payload: dict, prepared, emit, cancel) -> dict:
    model_id = payload["model_id"]
    spec = MODEL_INDEX[model_id]
    hps = {p["name"]: p for p in spec["params"]}
    space = {k: v for k, v in (payload.get("space") or {}).items() if k in hps}
    if not space:
        raise ValueError("Pick at least one setting to search over.")
    base = dict(payload.get("params") or {})
    n_iter = max(2, min(int(payload.get("n_iter", 20)), 200))
    folds = max(2, min(int(payload.get("cv", 3)), 10))
    seed = int(payload.get("seed", 42))
    scoring = payload.get("scoring")
    rng = np.random.default_rng(seed)
    if payload.get("search", "random") == "grid":
        per = max(2, int(round(n_iter ** (1 / len(space)))))
        grids = {k: _values(v, hps[k], per, rng) for k, v in space.items()}
        combos = [dict(zip(grids, vals)) for vals in itertools.product(*grids.values())][:200]
    else:
        combos = [{k: _sample(v, hps[k], rng) for k, v in space.items()} for _ in range(n_iter)]
    trials = []
    best = None
    quiet = lambda *_: None  # noqa: E731
    for i, combo in enumerate(combos):
        if cancel is not None and cancel.is_set():
            raise Cancelled()
        params = {**base, **combo}
        try:
            cv = cross_validate(model_id, params, prepared, folds, quiet, cancel, "tune", seed, scoring)
            t = {"i": i + 1, "params": combo, "score": cv["mean"], "std": cv["std"]}
        except Cancelled:
            raise
        except Exception as e:  # noqa: BLE001
            t = {"i": i + 1, "params": combo, "score": None, "error": str(e)[:200]}
        trials.append(t)
        if t["score"] is not None and (best is None or t["score"] > best["score"]):
            best = t
        emit("tune.trial", {**t, "n": len(combos), "best": best})
    if best is None:
        raise RuntimeError("No trial succeeded.")
    baseline = cross_validate(model_id, base, prepared, folds, quiet, cancel, "tune", seed, scoring)
    return {"model_id": model_id, "best": best, "best_params": {**base, **best["params"]}, "trials": trials,
            "baseline": {"score": baseline["mean"], "std": baseline["std"]}, "metric": scoring or ("accuracy" if prepared.task == "classification" else "r2"),
            "space": space, "improvement": r((best["score"] or 0) - (baseline["mean"] or 0))}
