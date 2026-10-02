"""Column profiling, histograms, class balance and 2-D projections for charts."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..util.jsonable import r


def column_role(s: pd.Series) -> str:
    n = len(s)
    nunique = s.nunique(dropna=True)
    if pd.api.types.is_bool_dtype(s):
        return "categorical"
    if pd.api.types.is_numeric_dtype(s):
        if n > 50 and nunique == n and pd.api.types.is_integer_dtype(s) and str(s.name).lower() in ("id", "index", "row", "rowid"):
            return "id"
        return "numeric"
    sample = s.dropna().astype(str).head(200)
    if len(sample) >= 5 and sample.str.contains(r"\d{4}-\d{1,2}-\d{1,2}|\d{1,2}/\d{1,2}/\d{2,4}|\d{1,2}:\d{2}", regex=True).mean() > 0.9:
        try:
            if pd.to_datetime(sample, errors="coerce", format="mixed").notna().mean() > 0.9:
                return "datetime"
        except (ValueError, TypeError):
            pass
    if n > 20 and nunique / max(n, 1) > 0.95:
        try:
            if s.dropna().astype(str).str.len().mean() > 30:
                return "text"
        except Exception:
            pass
        return "id"
    return "categorical"


def histogram(values, bins: int = 20) -> dict:
    v = pd.to_numeric(pd.Series(values), errors="coerce").dropna().to_numpy(dtype=float)
    if len(v) == 0:
        return {"edges": [], "counts": []}
    lo, hi = float(np.min(v)), float(np.max(v))
    if lo == hi:
        lo, hi = lo - 0.5, hi + 0.5
    counts, edges = np.histogram(v, bins=bins, range=(lo, hi))
    return {"edges": [r(e) for e in edges], "counts": counts.tolist()}


def value_counts(s: pd.Series, top: int = 15) -> dict:
    vc = s.astype("object").where(s.notna(), None).value_counts(dropna=True)
    labels = [str(x) for x in vc.index[:top]]
    counts = vc.values[:top].tolist()
    other = int(vc.values[top:].sum()) if len(vc) > top else 0
    return {"labels": labels, "counts": counts, "other": other}


def column_summary(df: pd.DataFrame, name: str) -> dict:
    s = df[name]
    role = column_role(s)
    out = {"name": name, "dtype": str(s.dtype), "role": role, "missing": int(s.isna().sum()),
           "unique": int(s.nunique(dropna=True))}
    if role == "numeric":
        v = pd.to_numeric(s, errors="coerce")
        out["stats"] = {"mean": r(v.mean()), "std": r(v.std()), "min": r(v.min()), "max": r(v.max()),
                        "median": r(v.median()), "q1": r(v.quantile(0.25)), "q3": r(v.quantile(0.75)),
                        "skew": r(v.skew()) if v.notna().sum() > 2 else 0}
        out["histogram"] = histogram(v)
        out["is_integer"] = bool(pd.api.types.is_integer_dtype(s) or (v.dropna() % 1 == 0).all())
    else:
        out["top"] = value_counts(s)
        if role in ("categorical", "id") and n_rows_per_value(s) >= 2 and out["unique"] >= 20:
            out["repeats"] = round(n_rows_per_value(s), 2)
    return out


def n_rows_per_value(s: pd.Series) -> float:
    u = s.nunique(dropna=True)
    return float(s.notna().sum() / u) if u else 0.0


def summarize(df: pd.DataFrame, meta: dict) -> dict:
    return {**meta, "n_rows": int(len(df)), "n_cols": int(df.shape[1]), "n_duplicates": int(df.duplicated().sum()),
            "columns": [column_summary(df, c) for c in df.columns],
            "preview": preview_rows(df, 8)}


def preview_rows(df: pd.DataFrame, n: int) -> dict:
    head = df.head(n)
    return {"columns": [str(c) for c in df.columns],
            "rows": head.astype("object").where(head.notna(), None).values.tolist()}


def guess_task(s: pd.Series) -> str:
    if not pd.api.types.is_numeric_dtype(s) or pd.api.types.is_bool_dtype(s):
        return "classification"
    nunique = s.nunique(dropna=True)
    if nunique <= 10 and (s.dropna() % 1 == 0).all():
        return "classification"
    return "regression"


def numeric_matrix(df: pd.DataFrame, exclude: list[str] = (), max_cat: int = 12) -> tuple[np.ndarray, list[str]]:
    """Quick numeric encoding (impute + standardise + small one-hot) used for projections only."""
    parts, names = [], []
    for c in df.columns:
        if c in exclude:
            continue
        s = df[c]
        role = column_role(s)
        if role == "numeric":
            v = pd.to_numeric(s, errors="coerce").astype(float)
            v = v.fillna(v.median() if v.notna().any() else 0.0).to_numpy()
            sd = v.std() or 1.0
            parts.append(((v - v.mean()) / sd)[:, None])
            names.append(str(c))
        elif role == "categorical":
            top = s.astype("object").value_counts().index[:max_cat]
            for t in top:
                parts.append((s.astype("object") == t).to_numpy(dtype=float)[:, None])
                names.append(f"{c}={t}")
    if not parts:
        return np.zeros((len(df), 1)), ["const"]
    return np.hstack(parts), names


def project_2d(X: np.ndarray, pca=None):
    from sklearn.decomposition import PCA
    X = np.asarray(X, dtype=float)
    if X.shape[1] == 1:
        return np.hstack([X, np.zeros_like(X)]), None
    if X.shape[1] == 2 and pca is None:
        return X.copy(), None
    if pca is None:
        pca = PCA(n_components=2, random_state=0).fit(X)
    return pca.transform(X), pca


def dataset_profile(df: pd.DataFrame, target: str | None, max_points: int = 1500) -> dict:
    out: dict = {"n_rows": int(len(df))}
    rng = np.random.default_rng(0)
    idx = np.arange(len(df))
    if len(df) > max_points:
        idx = np.sort(rng.choice(len(df), max_points, replace=False))
    sub = df.iloc[idx]
    X, _ = numeric_matrix(sub, exclude=[target] if target else [])
    P, _ = project_2d(X)
    labels = None
    if target and target in df.columns:
        t = df[target]
        task = guess_task(t)
        out["task_guess"] = task
        if task == "classification":
            out["class_balance"] = value_counts(t, top=30)
            labels = sub[target].astype("object").astype(str).tolist()
        else:
            out["target_hist"] = histogram(t)
            labels = [r(v, 3) for v in pd.to_numeric(sub[target], errors="coerce")]
        # correlations of numeric columns with the target
        corr = []
        tnum = pd.to_numeric(t, errors="coerce") if task == "regression" else pd.Series(pd.factorize(t)[0], index=t.index).astype(float)
        for c in df.columns:
            if c == target or column_role(df[c]) != "numeric":
                continue
            v = pd.to_numeric(df[c], errors="coerce")
            cc = v.corr(tnum)
            if pd.notna(cc):
                corr.append({"feature": str(c), "r": r(cc, 3)})
        out["target_correlations"] = sorted(corr, key=lambda d: -abs(d["r"]))[:25]
    out["projection"] = [{"x": r(P[i, 0], 3), "y": r(P[i, 1], 3), "label": labels[i] if labels else None, "i": int(idx[i])}
                         for i in range(len(idx))]
    # numeric correlation matrix (top 12 columns)
    num_cols = [c for c in df.columns if column_role(df[c]) == "numeric"][:12]
    if len(num_cols) >= 2:
        cm = df[num_cols].apply(pd.to_numeric, errors="coerce").corr().fillna(0).to_numpy()
        out["correlation_matrix"] = {"columns": [str(c) for c in num_cols], "matrix": [[r(v, 2) for v in row] for row in cm]}
    return out
