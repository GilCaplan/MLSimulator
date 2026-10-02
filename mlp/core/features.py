"""Feature engineering steps applied to raw rows (before encoding), at training and prediction time.

Step = {"op": ..., "name"?: str, "drop_source"?: bool, ...}
  date_parts {column, parts: [year, month, day, weekday, hour, dayofyear, is_weekend]}
  ratio {a, b} · product {a, b} · difference {a, b} · log {column} · power {column, p}
  bin {column, bins}  (quantile edges fitted on training rows) · formula {expr, name}
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..util.safe_expr import evaluate

DATE_PARTS = ["year", "month", "day", "weekday", "hour", "dayofyear", "is_weekend"]
OPS = {
    "date_parts": "Split a date into parts", "ratio": "A ÷ B", "product": "A × B", "difference": "A − B",
    "log": "log(1 + x)", "power": "x to a power", "bin": "Group into buckets", "formula": "Custom formula",
}


def _num(df: pd.DataFrame, c: str) -> pd.Series:
    if c not in df.columns:
        raise ValueError(f"Column '{c}' not found.")
    return pd.to_numeric(df[c], errors="coerce").astype(float)


def default_name(step: dict) -> str:
    op = step.get("op")
    a, b, c = step.get("a"), step.get("b"), step.get("column")
    return {"ratio": f"{a}_per_{b}", "product": f"{a}_x_{b}", "difference": f"{a}_minus_{b}", "log": f"log_{c}",
            "power": f"{c}_pow{step.get('p', 2)}", "bin": f"{c}_bucket", "formula": "custom_feature"}.get(op, f"{c}_{op}")


def parse_dates(s: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(s):
        return s
    return pd.to_datetime(s, errors="coerce", format="mixed")


def _claim(df: pd.DataFrame, name: str):
    if name in df.columns:
        raise ValueError(f"a column named '{name}' already exists — give this feature a different name.")


def apply_stateless(df: pd.DataFrame, steps: list[dict], strict: bool = True) -> tuple[pd.DataFrame, list[str], set[str]]:
    """Returns (df with new columns, new column names, source columns to drop). Raises ValueError on bad steps.
    `strict` refuses names that clash with existing columns (when steps are first applied); re-application overwrites."""
    df = df.copy()
    claim = _claim if strict else (lambda *_: None)
    new_cols: list[str] = []
    drop: set[str] = set()
    for i, st in enumerate(steps or []):
        op = st.get("op")
        if op == "bin":
            continue
        try:
            if op == "date_parts":
                c = st["column"]
                d = parse_dates(df[c])
                if d.notna().mean() < 0.5:
                    raise ValueError(f"'{c}' doesn't look like a date.")
                for part in st.get("parts") or ["month", "weekday", "hour"]:
                    name = f"{c}_{part}"
                    claim(df, name)
                    if part == "weekday":
                        v = d.dt.weekday
                    elif part == "is_weekend":
                        v = (d.dt.weekday >= 5).astype(float).where(d.notna())
                    else:
                        v = getattr(d.dt, part)
                    df[name] = v.astype(float)
                    new_cols.append(name)
                if st.get("drop_source", True):
                    drop.add(c)
                continue
            name = str(st.get("name") or default_name(st)).strip()
            claim(df, name)
            if op == "ratio":
                b = _num(df, st["b"])
                v = _num(df, st["a"]) / b.where(b != 0)
            elif op == "product":
                v = _num(df, st["a"]) * _num(df, st["b"])
            elif op == "difference":
                v = _num(df, st["a"]) - _num(df, st["b"])
            elif op == "log":
                v = np.log1p(_num(df, st["column"]).clip(lower=0))
            elif op == "power":
                v = _num(df, st["column"]) ** float(st.get("p", 2))
            elif op == "formula":
                env = {}
                for c in df.columns:
                    s = df[c]
                    env[str(c)] = pd.to_numeric(s, errors="coerce").to_numpy(float) if pd.api.types.is_numeric_dtype(s) else s.astype("object").to_numpy()
                v = pd.Series(evaluate(st.get("expr", "0"), env, len(df), np.random.default_rng(0)), index=df.index)
            else:
                raise ValueError(f"Unknown operation '{op}'.")
            df[name] = v.replace([np.inf, -np.inf], np.nan)
            new_cols.append(name)
            if st.get("drop_source") and op in ("log", "power"):
                drop.add(st["column"])
        except KeyError as e:
            raise ValueError(f"Feature step {i + 1} ({OPS.get(op, op)}) is missing '{e.args[0]}'.") from None
        except ValueError as e:
            raise ValueError(f"Feature step {i + 1} ({OPS.get(op, op)}): {e}") from None
    return df, new_cols, drop


def fit_bins(df_train: pd.DataFrame, steps: list[dict]) -> dict:
    edges = {}
    for st in steps or []:
        if st.get("op") != "bin":
            continue
        name = str(st.get("name") or default_name(st))
        v = _num(df_train, st["column"]).dropna()
        k = max(2, min(int(st.get("bins", 4)), 20))
        e = np.unique(np.quantile(v, np.linspace(0, 1, k + 1))) if len(v) else np.array([0.0, 1.0])
        edges[name] = [float(x) for x in e]
    return edges


def apply_bins(df: pd.DataFrame, steps: list[dict], edges: dict, strict: bool = True) -> tuple[pd.DataFrame, list[str], set[str]]:
    df = df.copy()
    new_cols, drop = [], set()
    for st in steps or []:
        if st.get("op") != "bin":
            continue
        name = str(st.get("name") or default_name(st))
        if strict and name in df.columns:
            raise ValueError(f"Feature step ({OPS['bin']}): a column named '{name}' already exists — give it a different name.")
        e = edges.get(name)
        if not e or len(e) < 2:
            continue
        v = _num(df, st["column"])
        idx = np.searchsorted(np.asarray(e[1:-1]), v.to_numpy(), side="right")
        labels = [f"{_fmt(e[i])}–{_fmt(e[i + 1])}" for i in range(len(e) - 1)]
        out = pd.Series([labels[j] if not np.isnan(x) else None for j, x in zip(idx, v.to_numpy())], index=df.index, dtype="object")
        df[name] = out
        new_cols.append(name)
        if st.get("drop_source"):
            drop.add(st["column"])
    return df, new_cols, drop


def _fmt(x: float) -> str:
    return f"{x:.3g}"


def engineer(df: pd.DataFrame, steps: list[dict], edges: dict) -> pd.DataFrame:
    """Full transform used at prediction time."""
    if not steps:
        return df
    df, _, _ = apply_stateless(df, steps, strict=False)
    df, _, _ = apply_bins(df, steps, edges, strict=False)
    return df
