"""Check a new file against a saved model's inputs before predicting, and apply the learner's fixes.

Fixes (all optional, keyed by the model's column names):
  mapping  {model_col: file_col}   use this file column for that input (or for the answer column)
  fill     {model_col: value}      fill a missing column, or the blanks of an existing one, with a value
  clean    [model_col]             numbers: strip symbols like $ , % before reading them;
                                   categories: trim spaces and match known values ignoring case
"""
from __future__ import annotations

import difflib
import pickle
import re
import time

import pandas as pd

from ..config import DATA_DIR
from .store import new_id

STAGE = DATA_DIR / "downloads"
KEEP_S = 6 * 3600
MAX_CATS = 50  # input_schema lists at most this many categories; above it, "unseen" can't be told apart


# ----------------------------------------------------------------------------- staging the upload
def stage(df: pd.DataFrame) -> str:
    """Keep the uploaded frame on disk for a few hours so it can be re-checked and predicted without re-uploading."""
    now = time.time()
    for p in STAGE.glob("up_*.pkl"):
        if now - p.stat().st_mtime > KEEP_S:
            p.unlink(missing_ok=True)
    uid = new_id("up")
    with open(STAGE / f"{uid}.pkl", "wb") as f:
        pickle.dump(df, f)
    return uid


def load(uid: str) -> pd.DataFrame:
    if not uid.replace("_", "").isalnum():
        raise KeyError("Bad upload id.")
    p = STAGE / f"{uid}.pkl"
    if not p.exists():
        raise KeyError("That upload has expired — drop the file again.")
    with open(p, "rb") as f:
        return pickle.load(f)


# ----------------------------------------------------------------------------- fixes
def _norm(s: str) -> str:
    return re.sub(r"[^0-9a-z]", "", str(s).lower())


def _clean_numbers(s: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(s):
        return s
    t = s.astype("object").map(lambda v: v if pd.isna(v) else str(v).strip())
    neg = t.map(lambda v: isinstance(v, str) and v.startswith("(") and v.endswith(")"))
    t = t.map(lambda v: v if pd.isna(v) else re.sub(r"[^0-9eE.+-]", "", v))
    out = pd.to_numeric(t, errors="coerce")
    return out.where(~neg, -out)


def _tidy_categories(s: pd.Series, known: list[str]) -> pd.Series:
    lookup = {k.strip().lower(): k for k in known}
    return s.map(lambda v: v if pd.isna(v) else lookup.get(str(v).strip().lower(), str(v).strip()))


def apply_fixes(df: pd.DataFrame, meta: dict, fixes: dict | None) -> pd.DataFrame:
    fixes = fixes or {}
    schema = {s["name"]: s for s in meta.get("input_schema") or []}
    wanted = list(schema) + ([meta["target"]] if meta.get("target") else [])
    df = df.copy()
    mapping = {m: f for m, f in (fixes.get("mapping") or {}).items() if m in wanted and f in df.columns and m != f}
    sources = list(mapping.values())
    # rename in place where a file column feeds exactly one input (keeps the file's column order); copy otherwise
    renames = {f: m for m, f in mapping.items() if sources.count(f) == 1 and f not in wanted and m not in df.columns}
    for m, f in mapping.items():
        if f not in renames:
            df[m] = df[f]
    df = df.rename(columns=renames)
    df = df.drop(columns=[f for f in set(sources) if f not in wanted and f in df.columns])
    for m in fixes.get("clean") or []:
        if m in df.columns and m in schema:
            if schema[m]["type"] == "numeric":
                df[m] = _clean_numbers(df[m])
            elif schema[m]["type"] == "categorical":
                df[m] = _tidy_categories(df[m], schema[m].get("categories") or [])
    for m, v in (fixes.get("fill") or {}).items():
        if m not in schema or v is None or v == "":
            continue
        if schema[m]["type"] == "numeric":
            v = pd.to_numeric(v, errors="coerce")
            if pd.isna(v):
                continue
        if m in df.columns:
            df[m] = df[m].where(df[m].notna(), v)
        else:
            df[m] = v
    return df


# ----------------------------------------------------------------------------- the check
def _suggest(name: str, free: list[str]) -> list[str]:
    """File columns that are probably this input, best first."""
    n = _norm(name)
    exact = [f for f in free if _norm(f) == n]
    if exact:
        return exact
    normed = {_norm(f): f for f in free}
    close = difflib.get_close_matches(n, list(normed), n=3, cutoff=0.6)
    contains = [f for f in free if n and (n in _norm(f) or (_norm(f) and _norm(f) in n)) and f not in close]
    return ([normed[c] for c in close] + contains)[:3]


def auto_mapping(df: pd.DataFrame, meta: dict) -> dict:
    """Map inputs the file lacks to file columns that only differ in case/spacing/punctuation (e.g. 'Monthly Income' -> 'monthly_income')."""
    wanted = [s["name"] for s in meta.get("input_schema") or []] + ([meta["target"]] if meta.get("target") else [])
    free = [c for c in df.columns if c not in wanted]
    out = {}
    for w in wanted:
        if w in df.columns:
            continue
        hits = [f for f in free if _norm(f) == _norm(w) and f not in out.values()]
        if len(hits) == 1:
            out[w] = hits[0]
    return out


def _examples(vals) -> list[str]:
    return [str(v) for v in list(vals)[:4]]


def _check_column(spec: dict, s: pd.Series, n_rows: int) -> dict:
    t = spec["type"]
    issues: list[dict] = []
    blanks = int(s.isna().sum())
    if t == "numeric":
        num = pd.to_numeric(s, errors="coerce")
        bad = s.notna() & num.isna()
        n_bad = int(bad.sum())
        if n_bad:
            rescued = int((bad & _clean_numbers(s).notna()).sum())
            issues.append({"kind": "not_numbers", "level": "error" if n_bad > 0.5 * max(1, s.notna().sum()) else "warn", "rows": n_bad,
                           "examples": _examples(s[bad].astype(str).unique()), "fixable": rescued,
                           "text": f"{n_bad:,} value{'s are' if n_bad != 1 else ' is'} not a number, so the model would treat {'them' if n_bad != 1 else 'it'} as blank."})
        lo, hi = spec.get("min"), spec.get("max")
        if lo is not None and hi is not None:
            out = (num < lo) | (num > hi)
            n_out = int(out.sum())
            if n_out:
                issues.append({"kind": "out_of_range", "level": "warn", "rows": n_out, "examples": _examples(num[out].unique()),
                               "text": f"{n_out:,} value{'s are' if n_out != 1 else ' is'} outside what the model saw in training ({lo:g} to {hi:g}) — predictions there are educated guesses."})
    elif t == "categorical":
        known = [str(c) for c in spec.get("categories") or []]
        if known and len(known) < MAX_CATS:
            sv = s.dropna().astype(str)
            unseen = sv[~sv.isin(known)]
            if len(unseen):
                vc = unseen.value_counts()
                lower = {k.strip().lower() for k in known}
                fixable = int(unseen.map(lambda v: v.strip().lower() in lower).sum())
                issues.append({"kind": "unseen", "level": "warn", "rows": len(unseen), "examples": _examples(vc.index), "fixable": fixable,
                               "text": f"{len(unseen):,} row{'s use' if len(unseen) != 1 else ' uses'} a value the model never saw in training — it can't use that information."})
    elif t == "datetime":
        parsed = pd.to_datetime(s, errors="coerce", format="mixed")
        bad = s.notna() & parsed.isna()
        if int(bad.sum()):
            issues.append({"kind": "not_dates", "level": "warn", "rows": int(bad.sum()), "examples": _examples(s[bad].astype(str).unique()),
                           "text": f"{int(bad.sum()):,} value{'s' if int(bad.sum()) != 1 else ''} can't be read as a date."})
    if blanks:
        issues.append({"kind": "blanks", "level": "warn" if blanks > 0.2 * n_rows else "info", "rows": blanks,
                       "text": f"{blanks:,} blank{'s' if blanks != 1 else ''} — the model fills {'them' if blanks != 1 else 'it'} in with a typical value."})
    level = "error" if any(i["level"] == "error" for i in issues) else "warn" if any(i["level"] == "warn" for i in issues) else "ok"
    return {"status": level, "issues": issues, "blanks": blanks, "examples": _examples(s.dropna().astype(str).unique())}


def check(raw: pd.DataFrame, meta: dict, fixes: dict | None) -> dict:
    """Column-by-column report on how well this file (after fixes) matches what the model expects."""
    fixes = fixes or {}
    df = apply_fixes(raw, meta, fixes)
    schema = meta.get("input_schema") or []
    target = meta.get("target")
    names = [s["name"] for s in schema]
    mapping = fixes.get("mapping") or {}
    fill = {k: v for k, v in (fixes.get("fill") or {}).items() if v is not None and v != ""}
    used = set(mapping.values()) | set(names) | {target}
    free = [c for c in raw.columns if c not in used]
    n = len(df)
    cols = []
    for spec in schema:
        name = spec["name"]
        src = mapping.get(name) if mapping.get(name) in raw.columns else (name if name in raw.columns else None)
        row = {"name": name, "type": spec["type"], "source": src, "filled": name in fill}
        if src is None and name not in fill:
            row.update(status="missing", issues=[{"kind": "missing", "level": "error",
                                                  "text": "Not in your file. Pick the column that holds it, or fill it with one value for every row."}],
                       suggestions=_suggest(name, free), blanks=n)
        else:
            row.update(_check_column(spec, df[name], n))
            if src is None:
                row["issues"] = [{"kind": "filled", "level": "info", "text": f"Every row gets {fill[name]!r}."}]
                row["status"] = "ok"
        cols.append(row)
    tgt = None
    if target:
        tsrc = mapping.get(target) if mapping.get(target) in raw.columns else (target if target in raw.columns else None)
        tgt = {"name": target, "source": tsrc, "suggestions": [] if tsrc else _suggest(target, free)}
        if tsrc is not None and meta.get("classes"):
            y = df[target].dropna().astype(str)
            unknown = y[~y.isin([str(c) for c in meta["classes"]])]
            tgt["labelled"] = len(y)
            tgt["unknown"] = {"rows": len(unknown), "examples": _examples(unknown.value_counts().index)} if len(unknown) else None
        elif tsrc is not None:
            tgt["labelled"] = int(pd.to_numeric(df[target], errors="coerce").notna().sum())
    counts = {k: sum(c["status"] == k for c in cols) for k in ("ok", "warn", "error", "missing")}
    return {"n_rows": n, "columns": cols, "extra": [c for c in raw.columns if c not in used], "target": tgt,
            "counts": counts, "ready": n > 0 and counts["missing"] == 0,
            "file_columns": [str(c) for c in raw.columns]}


def warnings_of(report: dict) -> list[str]:
    """One plain sentence per problem left in the file, to show next to the results."""
    out = []
    for c in report["columns"]:
        for i in c["issues"]:
            if i["level"] in ("warn", "error") and i["kind"] != "missing":
                out.append(f"{c['name']}: {i['text']}")
    t = report.get("target") or {}
    if t.get("unknown"):
        out.append(f"{t['name']}: {t['unknown']['rows']:,} rows have an answer the model doesn't know, so they're left out of the score.")
    return out


def preview_rows(df: pd.DataFrame, k: int = 5) -> pd.DataFrame:
    """A few rows with something in them, for the 'what the model sees' view."""
    full = df.dropna(how="any")
    return (full if len(full) >= k else df).head(k)

