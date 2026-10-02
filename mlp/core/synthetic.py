"""Synthetic dataset generation: custom feature distributions, presets, sample datasets, and composition."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..util.safe_expr import evaluate

DISTRIBUTIONS = {
    "normal": {"label": "Normal (bell curve)", "params": {"mean": 0.0, "std": 1.0}},
    "uniform": {"label": "Uniform (flat)", "params": {"low": 0.0, "high": 1.0}},
    "lognormal": {"label": "Log-normal (skewed)", "params": {"mean": 0.0, "sigma": 0.5}},
    "exponential": {"label": "Exponential (waiting time)", "params": {"scale": 1.0}},
    "gamma": {"label": "Gamma", "params": {"shape": 2.0, "scale": 1.0}},
    "beta": {"label": "Beta (between 0 and 1)", "params": {"a": 2.0, "b": 5.0}},
    "student_t": {"label": "Student-t (heavy tails)", "params": {"df": 3.0}},
    "poisson": {"label": "Poisson (counts)", "params": {"lam": 3.0}},
    "binomial": {"label": "Binomial (successes)", "params": {"n": 10, "p": 0.5}},
    "int_uniform": {"label": "Whole numbers in a range", "params": {"low": 0, "high": 10}},
    "bernoulli": {"label": "Yes / No (0 or 1)", "params": {"p": 0.5}},
    "categorical": {"label": "Categories", "params": {"categories": ["A", "B", "C"], "probs": [0.5, 0.3, 0.2]}},
}

PRESETS = {
    "moons": {"label": "Two Moons", "task": "classification", "params": {"n_samples": 600, "noise": 0.2}},
    "circles": {"label": "Circles", "task": "classification", "params": {"n_samples": 600, "noise": 0.08, "factor": 0.5}},
    "blobs": {"label": "Blobs", "task": "classification", "params": {"n_samples": 600, "centers": 3, "cluster_std": 1.2, "n_features": 2}},
    "spirals": {"label": "Spirals", "task": "classification", "params": {"n_samples": 600, "noise": 0.15, "turns": 1.5}},
    "xor": {"label": "XOR", "task": "classification", "params": {"n_samples": 600, "noise": 0.1}},
    "classification": {"label": "Random classification", "task": "classification",
                       "params": {"n_samples": 1000, "n_features": 8, "n_informative": 4, "n_classes": 2,
                                  "minority_share": 0.5, "class_sep": 1.0, "flip_y": 0.02}},
    "regression": {"label": "Random regression", "task": "regression",
                   "params": {"n_samples": 1000, "n_features": 6, "n_informative": 3, "noise": 10.0}},
    "friedman": {"label": "Friedman (non-linear)", "task": "regression", "params": {"n_samples": 800, "noise": 1.0}},
    "sine": {"label": "Noisy sine wave", "task": "regression", "params": {"n_samples": 400, "noise": 0.2}},
}

SAMPLES = {
    "iris": {"label": "Iris flowers", "task": "classification", "blurb": "150 flowers, 4 measurements, 3 species.", "emoji": "🌸"},
    "wine": {"label": "Wine cultivars", "task": "classification", "blurb": "178 wines, 13 chemical properties, 3 cultivars.", "emoji": "🍷"},
    "breast_cancer": {"label": "Breast cancer", "task": "classification", "blurb": "569 tumours, 30 features, benign vs malignant.", "emoji": "🩺"},
    "digits": {"label": "Handwritten digits", "task": "classification", "blurb": "1,797 tiny 8×8 images of digits 0–9. Try a CNN!", "emoji": "✍️"},
    "diabetes": {"label": "Diabetes progression", "task": "regression", "blurb": "442 patients, 10 measurements, disease progression.", "emoji": "💉"},
    "fraud": {"label": "Card fraud (imbalanced)", "task": "classification", "blurb": "Synthetic transactions where only ~4% are fraud. Great for SMOTE.", "emoji": "💳"},
    "customers": {"label": "Shopping customers", "task": "clustering", "blurb": "1,200 shoppers with spending habits — find the natural segments. A hidden 'segment' column lets you check.", "emoji": "🛍️"},
    "sensors": {"label": "Machine sensors", "task": "anomaly", "blurb": "3,000 sensor readings from a factory line; ~3% are faults. Can you spot them without labels?", "emoji": "🏭"},
    "housing": {"label": "House prices", "task": "regression", "blurb": "Synthetic homes with size, rooms, area and age → price.", "emoji": "🏡"},
}


def sample_feature(f: dict, n: int, rng: np.random.Generator):
    dist = f.get("dist", "normal")
    p = {**DISTRIBUTIONS.get(dist, {"params": {}})["params"], **(f.get("params") or {})}
    if dist == "normal":
        v = rng.normal(float(p["mean"]), max(float(p["std"]), 1e-9), n)
    elif dist == "uniform":
        lo, hi = float(p["low"]), float(p["high"])
        v = rng.uniform(min(lo, hi), max(lo, hi), n)
    elif dist == "lognormal":
        v = rng.lognormal(float(p["mean"]), max(float(p["sigma"]), 1e-9), n)
    elif dist == "exponential":
        v = rng.exponential(max(float(p["scale"]), 1e-9), n)
    elif dist == "gamma":
        v = rng.gamma(max(float(p["shape"]), 1e-6), max(float(p["scale"]), 1e-9), n)
    elif dist == "beta":
        v = rng.beta(max(float(p["a"]), 1e-3), max(float(p["b"]), 1e-3), n)
    elif dist == "student_t":
        v = rng.standard_t(max(float(p["df"]), 0.1), n)
    elif dist == "poisson":
        v = rng.poisson(max(float(p["lam"]), 0), n).astype(float)
    elif dist == "binomial":
        v = rng.binomial(max(int(p["n"]), 1), min(max(float(p["p"]), 0), 1), n).astype(float)
    elif dist == "int_uniform":
        lo, hi = int(p["low"]), int(p["high"])
        v = rng.integers(min(lo, hi), max(lo, hi) + 1, n).astype(float)
    elif dist == "bernoulli":
        v = (rng.random(n) < float(p["p"])).astype(float)
    elif dist == "categorical":
        cats = [str(c) for c in (p.get("categories") or ["A", "B"])]
        probs = np.asarray(p.get("probs") or [1] * len(cats), dtype=float)[: len(cats)]
        if len(probs) < len(cats):
            probs = np.concatenate([probs, np.ones(len(cats) - len(probs))])
        probs = np.clip(probs, 0, None)
        probs = probs / probs.sum() if probs.sum() > 0 else np.ones(len(cats)) / len(cats)
        return np.asarray(cats, dtype=object)[rng.choice(len(cats), n, p=probs)]
    else:
        raise ValueError(f"Unknown distribution '{dist}'")
    if f.get("clip"):
        lo, hi = f["clip"]
        v = np.clip(v, lo if lo is not None else -np.inf, hi if hi is not None else np.inf)
    if f.get("round") is not None and f.get("round") != "":
        v = np.round(v, int(f["round"]))
    return v


def _sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -50, 50)))


def _zs(v: np.ndarray) -> np.ndarray:
    sd = v.std()
    return (v - v.mean()) / (sd if sd > 0 else 1.0)


def _signal(rule: dict, cols: dict, n: int, rng) -> np.ndarray:
    t = rule.get("type", "linear")
    if t == "linear":
        val = np.full(n, float(rule.get("bias", 0.0)))
        for name, w in (rule.get("weights") or {}).items():
            if name not in cols or not w:
                continue
            v = cols[name]
            if v.dtype == object:
                codes = pd.factorize(pd.Series(v), sort=True)[0].astype(float)
                v = codes
            val += float(w) * _zs(np.asarray(v, dtype=float))
        if rule.get("nonlinear"):
            val = val + 0.8 * np.sin(2 * val) + 0.3 * val ** 2 - 0.3
        return val + rng.normal(0, max(float(rule.get("noise", 0.5)), 0), n)
    if t == "expression":
        return evaluate(rule.get("expr", "0"), cols, n, rng)
    if t == "random":
        return rng.normal(0, 1, n)
    raise ValueError(f"Unknown target rule '{t}'")


def generate_custom(spec: dict) -> tuple[pd.DataFrame, dict]:
    n = int(spec.get("n_samples", 1000))
    n = max(10, min(n, 500_000))
    rng = np.random.default_rng(spec.get("seed", 42))
    features = spec.get("features") or []
    if not features:
        raise ValueError("Add at least one feature.")
    cols: dict[str, np.ndarray] = {}
    for f in features:
        name = str(f.get("name") or f"x{len(cols) + 1}").strip()
        cols[name] = sample_feature(f, n, rng)

    target = spec.get("target") or {}
    tname = str(target.get("name") or "target")
    task = target.get("task", "classification")
    rule = target.get("rule") or {"type": "linear", "weights": {k: 1.0 for k in list(cols)[:2]}}
    n_classes = max(2, int(target.get("n_classes", 2)))
    class_names = target.get("class_names") or None

    if task == "classification" and rule.get("type") == "clusters":
        probs = np.asarray(rule.get("class_probs") or [1] * n_classes, dtype=float)[:n_classes]
        probs = probs / probs.sum()
        y = rng.choice(n_classes, n, p=probs)
        on = [c for c in (rule.get("on") or list(cols)) if c in cols and cols[c].dtype != object]
        sep = float(rule.get("separation", 2.0))
        centers = rng.normal(0, 1, (n_classes, len(on)))
        centers /= np.linalg.norm(centers, axis=1, keepdims=True) + 1e-9
        for j, c in enumerate(on):
            sd = cols[c].std() or 1.0
            cols[c] = cols[c] + sep * sd * centers[y, j]
    elif task == "classification" and rule.get("type") == "random":
        probs = np.asarray(rule.get("class_probs") or [1] * n_classes, dtype=float)[:n_classes]
        y = rng.choice(n_classes, n, p=probs / probs.sum())
    else:
        val = _signal(rule, cols, n, rng)
        if task == "regression":
            scale, offset = float(target.get("scale", 1.0)), float(target.get("offset", 0.0))
            y = val * scale + offset
        else:
            how = target.get("classify", "sigmoid" if n_classes == 2 else "quantile")
            if n_classes == 2 and how == "sigmoid":
                shift = float(target.get("balance_shift", 0.0))
                y = (rng.random(n) < _sigmoid(_zs(val) * 2.5 + shift)).astype(int)
            elif n_classes == 2 and how == "threshold":
                y = (val > float(target.get("threshold", np.median(val)))).astype(int)
            else:
                probs = np.asarray(target.get("class_probs") or [1] * n_classes, dtype=float)[:n_classes]
                cuts = np.quantile(val, np.cumsum(probs / probs.sum())[:-1])
                y = np.searchsorted(cuts, val)
    if task == "classification":
        y = np.asarray(y, dtype=int)
        if class_names and len(class_names) >= n_classes:
            y = np.asarray(class_names, dtype=object)[y]

    # Missing values are injected only after the target was computed from complete data.
    for f in features:
        mr = float(f.get("missing_rate") or 0)
        name = str(f.get("name"))
        if mr > 0 and name in cols:
            mask = rng.random(n) < mr
            arr = cols[name].astype(object) if cols[name].dtype == object else cols[name].astype(float)
            arr[mask] = None if arr.dtype == object else np.nan
            cols[name] = arr
    df = pd.DataFrame(cols)
    df[tname] = y
    return df, {"name": spec.get("name") or "Synthetic data", "source": "synthetic", "task_hint": task, "target_hint": tname}


def _spirals(n, noise, turns, rng):
    k = n // 2
    t = np.sqrt(rng.random(k)) * turns * 2 * np.pi
    a = np.c_[t * np.cos(t), t * np.sin(t)] / (turns * 2 * np.pi)
    b = -a
    X = np.vstack([a, b]) + rng.normal(0, noise * 0.3, (2 * k, 2))
    return X, np.r_[np.zeros(k, int), np.ones(k, int)]


def generate_preset(name: str, params: dict, seed: int = 42) -> tuple[pd.DataFrame, dict]:
    from sklearn import datasets as skd
    if name not in PRESETS:
        raise ValueError(f"Unknown preset '{name}'")
    p = {**PRESETS[name]["params"], **(params or {})}
    n = max(20, min(int(p.get("n_samples", 600)), 200_000))
    rng = np.random.default_rng(seed)
    task = PRESETS[name]["task"]
    if name == "moons":
        X, y = skd.make_moons(n, noise=float(p["noise"]), random_state=seed)
    elif name == "circles":
        X, y = skd.make_circles(n, noise=float(p["noise"]), factor=float(p["factor"]), random_state=seed)
    elif name == "blobs":
        X, y = skd.make_blobs(n, centers=int(p["centers"]), cluster_std=float(p["cluster_std"]),
                              n_features=int(p["n_features"]), random_state=seed)
    elif name == "spirals":
        X, y = _spirals(n, float(p["noise"]), float(p["turns"]), rng)
    elif name == "xor":
        X = rng.uniform(-1, 1, (n, 2))
        y = ((X[:, 0] > 0) ^ (X[:, 1] > 0)).astype(int)
        X = X + rng.normal(0, float(p["noise"]), X.shape)
    elif name == "classification":
        k = int(p["n_classes"])
        nf = max(2, int(p["n_features"]))
        ninf = max(1, min(int(p["n_informative"]), nf))
        while k * 2 > 2 ** ninf:
            ninf += 1
        nf = max(nf, ninf)
        ms = float(p.get("minority_share", 0.5))
        weights = None
        if k == 2 and ms < 0.5:
            weights = [1 - ms, ms]
        X, y = skd.make_classification(n, n_features=nf, n_informative=ninf, n_redundant=0, n_classes=k,
                                       weights=weights, class_sep=float(p["class_sep"]), flip_y=float(p["flip_y"]),
                                       random_state=seed)
    elif name == "regression":
        nf = max(1, int(p["n_features"]))
        X, y = skd.make_regression(n, n_features=nf, n_informative=max(1, min(int(p["n_informative"]), nf)),
                                   noise=float(p["noise"]), random_state=seed)
    elif name == "friedman":
        X, y = skd.make_friedman1(n, noise=float(p["noise"]), random_state=seed)
    elif name == "sine":
        X = rng.uniform(-3, 3, (n, 1))
        y = np.sin(X[:, 0] * 1.5) + rng.normal(0, float(p["noise"]), n)
    df = pd.DataFrame(X, columns=[f"x{i + 1}" for i in range(X.shape[1])])
    df["target"] = y
    return df, {"name": PRESETS[name]["label"], "source": "preset", "preset": name, "task_hint": task, "target_hint": "target"}


def load_sample(name: str, seed: int = 42) -> tuple[pd.DataFrame, dict]:
    from sklearn import datasets as skd
    meta = {"name": SAMPLES[name]["label"], "source": "sample", "sample": name, "task_hint": SAMPLES[name]["task"]}
    rng = np.random.default_rng(seed)
    if name in ("iris", "wine", "breast_cancer", "diabetes", "digits"):
        loader = getattr(skd, f"load_{name}")
        b = loader(as_frame=False)
        cols = [str(c).replace(" (cm)", "").replace(" ", "_") for c in b.feature_names]
        if name == "digits":
            cols = [f"px_{i // 8}_{i % 8}" for i in range(64)]
            meta["image_shape"] = [8, 8]
        df = pd.DataFrame(b.data, columns=cols)
        if name == "diabetes":
            df["progression"] = b.target
            meta["target_hint"] = "progression"
        else:
            names = getattr(b, "target_names", None)
            label = "species" if name == "iris" else ("diagnosis" if name == "breast_cancer" else ("cultivar" if name == "wine" else "digit"))
            if names is not None and name != "digits":
                df[label] = np.asarray(names, dtype=object)[b.target]
            else:
                df[label] = b.target
            meta["target_hint"] = label
        return df, meta
    if name == "fraud":
        n = 4000
        amount = rng.lognormal(3.5, 1.0, n)
        hour = rng.integers(0, 24, n)
        dist = rng.exponential(10, n)
        age = rng.integers(0, 3650, n)
        channel = rng.choice(["in-store", "online", "phone"], n, p=[0.55, 0.38, 0.07])
        foreign = (rng.random(n) < 0.08).astype(int)
        z = (0.9 * (np.log(amount) - 3.5) + 1.1 * ((hour < 5) | (hour > 22)) + 0.04 * dist - 0.0006 * age
             + 1.4 * (channel == "online") + 1.8 * foreign - 4.2 + rng.normal(0, 0.6, n))
        fraud = (rng.random(n) < _sigmoid(z)).astype(int)
        df = pd.DataFrame({"amount": amount.round(2), "hour": hour, "distance_km": dist.round(1),
                           "account_age_days": age, "channel": channel, "foreign": foreign, "is_fraud": fraud})
        return df, {**meta, "target_hint": "is_fraud"}
    if name == "customers":
        segs = {"bargain hunters": ([30, 25, 4, 0.8, 20], 0.30), "families": ([42, 70, 6, 0.3, 45], 0.25),
                "premium": ([48, 140, 2, 0.1, 30], 0.15), "students": ([21, 18, 10, 0.6, 70], 0.18), "occasional": ([55, 40, 1, 0.2, 10], 0.12)}
        names = list(segs)
        seg = rng.choice(len(names), 1200, p=[segs[k][1] for k in names])
        base = np.array([segs[k][0] for k in names])[seg]
        noise = rng.normal(0, 1, (1200, 5)) * np.array([5, 12, 1.5, 0.12, 8])
        X = base + noise
        df = pd.DataFrame({"age": X[:, 0].round().clip(16, 90), "avg_basket": X[:, 1].round(2).clip(3), "visits_per_month": X[:, 2].round(1).clip(0.2),
                           "discount_share": X[:, 3].round(2).clip(0, 1), "online_share_pct": X[:, 4].round().clip(0, 100),
                           "segment": np.asarray(names, dtype=object)[seg]})
        return df, {**meta, "target_hint": None, "truth_hint": "segment"}
    if name == "sensors":
        n = 3000
        temp = rng.normal(70, 4, n)
        vib = 0.02 * (temp - 70) + rng.normal(1.0, 0.15, n)
        pressure = 30 + 0.3 * (temp - 70) + rng.normal(0, 1.0, n)
        rpm = rng.normal(1500, 40, n) + 8 * (vib - 1)
        fault = rng.random(n) < 0.03
        k = fault.sum()
        temp[fault] += rng.choice([-1, 1], k) * rng.uniform(8, 16, k)
        vib[fault] *= rng.uniform(1.6, 2.6, k)
        pressure[fault] -= rng.uniform(3, 8, k)
        df = pd.DataFrame({"temperature_c": temp.round(2), "vibration_g": vib.round(3), "pressure_bar": pressure.round(2), "rpm": rpm.round(),
                           "status": np.where(fault, "fault", "normal")})
        return df, {**meta, "target_hint": None, "truth_hint": "status"}
    if name == "housing":
        n = 1500
        size = rng.normal(140, 45, n).clip(35, 400)
        rooms = np.clip(np.round(size / 35 + rng.normal(0, 0.8, n)), 1, 9)
        age = rng.integers(0, 80, n)
        area = rng.choice(["suburb", "city", "rural", "coast"], n, p=[0.45, 0.3, 0.15, 0.1])
        garage = (rng.random(n) < 0.55).astype(int)
        mult = pd.Series(area).map({"suburb": 1.0, "city": 1.35, "rural": 0.7, "coast": 1.6}).to_numpy()
        price = (2200 * size + 9000 * rooms - 900 * age + 15000 * garage) * mult + rng.normal(0, 25000, n)
        df = pd.DataFrame({"size_m2": size.round(1), "rooms": rooms.astype(int), "age_years": age, "area": area,
                           "garage": garage, "price": price.round(-2)})
        miss = rng.random(n) < 0.04
        df.loc[miss, "age_years"] = np.nan
        return df, {**meta, "target_hint": "price"}
    raise ValueError(f"Unknown sample '{name}'")


def compose(base: pd.DataFrame, add_features: list[dict], add_rows: int, jitter: float, seed: int = 42,
            target: str | None = None) -> pd.DataFrame:
    """Append synthetic columns and/or bootstrap-with-jitter rows to an existing dataset."""
    rng = np.random.default_rng(seed)
    df = base.copy()
    for f in add_features or []:
        df[str(f.get("name") or f"syn_{df.shape[1]}")] = sample_feature(f, len(df), rng)
    if add_rows and add_rows > 0:
        idx = rng.integers(0, len(df), int(add_rows))
        extra = df.iloc[idx].copy().reset_index(drop=True)
        for c in extra.columns:
            if c == target:
                continue
            if pd.api.types.is_numeric_dtype(extra[c]) and not pd.api.types.is_bool_dtype(extra[c]):
                sd = float(pd.to_numeric(df[c], errors="coerce").std() or 0)
                noise = rng.normal(0, jitter * sd, len(extra))
                vals = extra[c].astype(float) + noise
                if pd.api.types.is_integer_dtype(df[c]):
                    vals = vals.round()
                extra[c] = vals
        df = pd.concat([df, extra], ignore_index=True)
    return df


def preview(spec: dict, n: int = 400) -> dict:
    from .profile import histogram, value_counts
    s = {**spec, "n_samples": min(int(spec.get("n_samples", n)), n)}
    df, meta = generate_custom(s)
    out = {"columns": []}
    tname = meta["target_hint"]
    for c in df.columns:
        if c == tname:
            continue
        col = df[c]
        if not pd.api.types.is_numeric_dtype(col):
            out["columns"].append({"name": c, "kind": "categorical", "top": value_counts(col)})
        else:
            out["columns"].append({"name": c, "kind": "numeric", "histogram": histogram(col, 24),
                                   "mean": float(np.nanmean(col)), "std": float(np.nanstd(col))})
    t = df[tname]
    if meta["task_hint"] == "classification":
        out["target"] = {"kind": "classes", "balance": value_counts(t)}
    else:
        out["target"] = {"kind": "numeric", "histogram": histogram(t, 24)}
    from .profile import numeric_matrix, project_2d
    X, _ = numeric_matrix(df, exclude=[tname])
    P, _ = project_2d(X)
    lab = t.astype(str).tolist() if meta["task_hint"] == "classification" else [round(float(v), 3) for v in t]
    out["scatter"] = [{"x": round(float(P[i, 0]), 3), "y": round(float(P[i, 1]), 3), "label": lab[i]} for i in range(min(len(df), 400))]
    return out
