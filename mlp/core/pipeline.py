"""Preprocessing: pipeline spec -> fitted Preprocessor + train/val/test matrices + resampling report.

Spec (all keys optional except target/task):
{
  "target": "y", "task": "classification",
  "drop_columns": ["id"],
  "impute": {"numeric": "median|mean|most_frequent|zero|drop_rows", "categorical": "most_frequent|constant"},
  "encode": {"method": "onehot|ordinal", "max_categories": 20},
  "outliers": {"enabled": false, "method": "iqr|zscore", "factor": 1.5},
  "split": {"test_size": 0.2, "val_size": 0.1, "stratify": true, "seed": 42},
  "scale": {"method": "none|standard|minmax|robust"},
  "feature_select": {"method": "none|kbest|mutual_info|variance|model", "k": 10, "threshold": 0.0},
  "resample": {"mode": "none|oversample|undersample|middle|custom", "over": "random|smote|borderline_smote|adasyn|svm_smote",
               "under": "random|nearmiss|cluster_centroids", "clean": "none|tomek|enn", "target_counts": {"cls": n},
               "k_neighbors": 5},
  "target_transform": "none|log1p"
}
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..util.jsonable import r
from .features import apply_bins, apply_stateless, engineer, fit_bins, parse_dates
from .profile import column_role, project_2d
from .store import new_id

DEFAULT_SPEC = {
    "drop_columns": [],
    "impute": {"numeric": "median", "categorical": "most_frequent"},
    "encode": {"method": "onehot", "max_categories": 20},
    "outliers": {"enabled": False, "method": "iqr", "factor": 1.5},
    "split": {"test_size": 0.2, "val_size": 0.1, "stratify": True, "seed": 42, "method": "random", "group_column": None, "time_column": None},
    "dedupe": {"enabled": False},
    "features": [],
    "reduce": {"method": "none", "n_components": 5},
    "scale": {"method": "standard"},
    "feature_select": {"method": "none", "k": 10},
    "resample": {"mode": "none", "over": "smote", "under": "random", "clean": "none", "k_neighbors": 5},
    "target_transform": "none",
    "target_filter": {"enabled": False, "min": None, "max": None},
}


def merged_spec(spec: dict) -> dict:
    out = {}
    for k, v in DEFAULT_SPEC.items():
        sv = spec.get(k)
        out[k] = {**v, **sv} if isinstance(v, dict) and isinstance(sv, dict) else (sv if sv is not None else v)
    out["target"] = spec["target"]
    out["task"] = spec["task"]
    return out


class Preprocessor:
    """Fitted transformation from raw rows (DataFrame) to the model's numeric matrix."""

    def __init__(self):
        self.input_columns: list[str] = []
        self.numeric_cols: list[str] = []
        self.categorical_cols: list[str] = []
        self.num_imputer = None
        self.cat_imputer = None
        self.encoder = None
        self.encode_method = "onehot"
        self.scaler = None
        self.selected: np.ndarray | None = None
        self.feature_names_out: list[str] = []
        self.encoded_names: list[str] = []
        self.onehot_groups: list[list[int]] = []
        self.label_encoder = None
        self.target_transform = "none"
        self.input_schema: list[dict] = []
        self.task = "classification"
        self.target = "target"
        self.fe_steps: list[dict] = []
        self.reducer = None
        self.bin_edges: dict = {}

    # -- transforms --
    def _encode(self, df: pd.DataFrame) -> np.ndarray:
        df = df.copy()
        if len(df) == 0:
            return np.zeros((0, len(self.encoded_names)))
        if getattr(self, "fe_steps", None):
            df = engineer(df, self.fe_steps, self.bin_edges)
        for c in self.input_columns:
            if c not in df.columns:
                df[c] = np.nan
        parts = []
        if self.numeric_cols:
            num = df[self.numeric_cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)
            parts.append(self.num_imputer.transform(num))
        if self.categorical_cols:
            cat = df[self.categorical_cols].astype("object").where(df[self.categorical_cols].notna(), np.nan)
            cat = cat.map(lambda v: np.nan if pd.isna(v) else str(v)).to_numpy(dtype=object)
            cat = self.cat_imputer.transform(cat)
            enc = self.encoder.transform(cat)
            parts.append(np.asarray(enc, dtype=float))
        return np.hstack(parts) if parts else np.zeros((len(df), 0))

    def _finish(self, X: np.ndarray) -> np.ndarray:
        if len(X) == 0:
            n = len(self.selected) if self.selected is not None else X.shape[1]
            if getattr(self, "reducer", None) is not None:
                n = self.reducer.n_components_
            return np.zeros((0, n), dtype=np.float32)
        if self.scaler is not None:
            X = self.scaler.transform(X)
        if self.selected is not None:
            X = X[:, self.selected]
        if getattr(self, "reducer", None) is not None:
            X = self.reducer.transform(X)
        return X.astype(np.float32)

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        return self._finish(self._encode(df))

    def encode_y(self, y):
        y = pd.Series(y)
        if self.task == "classification":
            return self.label_encoder.transform(y.astype(str)).astype(np.int64)
        v = pd.to_numeric(y, errors="coerce").to_numpy(dtype=float)
        return np.log1p(np.clip(v, 0, None)) if self.target_transform == "log1p" else v

    def decode_y(self, y):
        y = np.asarray(y)
        if self.task == "classification":
            return self.label_encoder.inverse_transform(y.astype(int))
        return np.expm1(y) if self.target_transform == "log1p" else y

    @property
    def classes(self):
        return [str(c) for c in self.label_encoder.classes_] if self.label_encoder is not None else None


@dataclass
class Prepared:
    id: str
    task: str
    target: str
    dataset_id: str
    spec: dict
    preprocessor: Preprocessor
    X_train: np.ndarray
    y_train: np.ndarray
    X_val: np.ndarray
    y_val: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    feature_names: list[str]
    classes: list[str] | None
    image_shape: list[int] | None = None
    report: dict = field(default_factory=dict)
    pca: object = None
    # pre-resampling training data (used for honest train metrics and coach)
    X_train_orig: np.ndarray | None = None
    y_train_orig: np.ndarray | None = None
    resample_groups: list = field(default_factory=list)
    raw_test: pd.DataFrame | None = None
    modality: str = "tabular"
    payload: dict = field(default_factory=dict)
    resample_lohi: tuple | None = None


def _input_schema(df: pd.DataFrame, numeric: list[str], categorical: list[str], dates: list[str] = ()) -> list[dict]:
    out = []
    for c in dates:
        ex = df[c].dropna()
        out.append({"name": c, "type": "datetime", "example": str(ex.iloc[0]) if len(ex) else ""})
    for c in numeric:
        v = pd.to_numeric(df[c], errors="coerce")
        is_int = bool(v.dropna().size and (v.dropna() % 1 == 0).all())
        out.append({"name": c, "type": "numeric", "min": r(v.min()), "max": r(v.max()), "median": r(v.median()),
                    "mean": r(v.mean()), "std": r(v.std()), "integer": is_int,
                    "binary": bool(set(v.dropna().unique()).issubset({0, 1}))})
    for c in categorical:
        vc = df[c].astype("object").dropna().astype(str).value_counts()
        out.append({"name": c, "type": "categorical", "categories": vc.index[:50].tolist(),
                    "mode": vc.index[0] if len(vc) else None})
    return out


def _counts(y: np.ndarray, classes: list[str]) -> dict:
    vals, cnt = np.unique(y, return_counts=True)
    d = {classes[int(v)]: int(c) for v, c in zip(vals, cnt)}
    return {c: d.get(c, 0) for c in classes}


def _make_over(name: str, strategy, k: int, seed: int):
    from imblearn import over_sampling as os_
    if name == "random":
        return os_.RandomOverSampler(sampling_strategy=strategy, random_state=seed)
    if name == "smote":
        return os_.SMOTE(sampling_strategy=strategy, k_neighbors=k, random_state=seed)
    if name == "borderline_smote":
        return os_.BorderlineSMOTE(sampling_strategy=strategy, k_neighbors=k, m_neighbors=max(k, 2) * 2, random_state=seed)
    if name == "adasyn":
        return os_.ADASYN(sampling_strategy=strategy, n_neighbors=k, random_state=seed)
    if name == "svm_smote":
        return os_.SVMSMOTE(sampling_strategy=strategy, k_neighbors=k, random_state=seed)
    raise ValueError(f"Unknown oversampler {name}")


def _make_under(name: str, strategy, seed: int):
    from imblearn import under_sampling as us
    if name == "random":
        return us.RandomUnderSampler(sampling_strategy=strategy, random_state=seed)
    if name == "nearmiss":
        return us.NearMiss(sampling_strategy=strategy, version=1)
    if name == "cluster_centroids":
        return us.ClusterCentroids(sampling_strategy=strategy, random_state=seed)
    raise ValueError(f"Unknown undersampler {name}")


def resample(X, y, cfg: dict, classes: list[str], seed: int, onehot_groups, lohi):
    """Returns X, y, origin (index into input rows, or -1 for synthetic), warnings."""
    warnings: list[str] = []
    mode = cfg.get("mode", "none")
    origin = np.arange(len(y))
    if mode == "none" and cfg.get("clean", "none") == "none":
        return X, y, origin, warnings
    counts = np.bincount(y, minlength=len(classes))
    present = [i for i in range(len(classes)) if counts[i] > 0]
    if mode == "oversample":
        target = {i: int(counts.max()) for i in present}
    elif mode == "undersample":
        target = {i: int(counts[present].min()) for i in present}
    elif mode == "middle":
        mid = int(round(np.mean(counts[present])))
        target = {i: mid for i in present}
    elif mode == "custom":
        tc = cfg.get("target_counts") or {}
        target = {i: max(1, int(tc.get(classes[i], counts[i]))) for i in present}
    else:
        target = {i: int(counts[i]) for i in present}

    dec = {i: t for i, t in target.items() if t < counts[i]}
    inc = {i: t for i, t in target.items() if t > counts[i]}

    if dec:
        under_name = cfg.get("under", "random")
        strat = {i: (t if i in dec else int(counts[i])) for i, t in target.items()}
        if under_name == "cluster_centroids":
            # ClusterCentroids synthesises centroids, so origin tracking is lost for those classes.
            s = _make_under(under_name, {i: t for i, t in dec.items()}, seed)
            Xn, yn = s.fit_resample(X, y)
            keep_mask = ~np.isin(y, list(dec))
            new_origin = np.concatenate([origin[keep_mask], -np.ones(int(np.isin(yn, list(dec)).sum()), int)])
            order = np.concatenate([np.where(~np.isin(yn, list(dec)))[0], np.where(np.isin(yn, list(dec)))[0]])
            X, y, origin = Xn[order], yn[order], new_origin
        else:
            s = _make_under(under_name, {i: t for i, t in strat.items() if i in dec}, seed)
            X, y = s.fit_resample(X, y)
            origin = origin[s.sample_indices_]

    if inc:
        over_name = cfg.get("over", "smote")
        counts_now = np.bincount(y, minlength=len(classes))
        min_c = min(counts_now[i] for i in inc)
        k = int(cfg.get("k_neighbors", 5))
        if over_name != "random":
            if min_c < 2:
                warnings.append(f"A class has only {min_c} example(s) — too few for {over_name.upper()}; used random copying instead.")
                over_name = "random"
            elif k >= min_c:
                warnings.append(f"Reduced SMOTE neighbours from {k} to {min_c - 1} because the smallest class only has {min_c} examples.")
                k = min_c - 1
        n_before = len(y)
        try:
            s = _make_over(over_name, inc, k, seed)
            Xn, yn = s.fit_resample(X, y)
        except (ValueError, RuntimeError) as e:
            warnings.append(f"{over_name} could not run ({str(e)[:120]}); fell back to SMOTE/random copying.")
            try:
                s = _make_over("smote" if min_c > 2 else "random", inc, min(k, max(1, min_c - 1)), seed)
                Xn, yn = s.fit_resample(X, y)
                over_name = "smote" if min_c > 2 else "random"
            except Exception:
                s = _make_over("random", inc, 1, seed)
                Xn, yn = s.fit_resample(X, y)
                over_name = "random"
        if over_name == "random":
            idx = s.sample_indices_
            seen = set()
            new_origin = []
            for i in idx:
                if i < n_before and i not in seen:
                    seen.add(i)
                    new_origin.append(origin[i])
                else:
                    new_origin.append(-1)  # duplicate copy
            origin = np.asarray(new_origin)
        else:
            origin = np.concatenate([origin, -np.ones(len(yn) - n_before, int)])
            # keep synthetic one-hot columns valid
            syn = slice(n_before, len(yn))
            if len(yn) > n_before:
                for g in onehot_groups:
                    if len(g) < 2:
                        continue
                    lo, hi = lohi[0][g], lohi[1][g]
                    span = np.where(hi - lo == 0, 1, hi - lo)
                    rel = (Xn[syn][:, g] - lo) / span
                    win = rel.argmax(axis=1)
                    block = np.tile(lo, (len(win), 1))
                    block[np.arange(len(win)), win] = hi[win]
                    sub = Xn[syn]
                    sub[:, g] = block
                    Xn[syn] = sub
        X, y = Xn, yn

    clean = cfg.get("clean", "none")
    if clean in ("tomek", "enn"):
        from imblearn.under_sampling import EditedNearestNeighbours, TomekLinks
        s = TomekLinks() if clean == "tomek" else EditedNearestNeighbours()
        try:
            X, y = s.fit_resample(X, y)
            origin = origin[s.sample_indices_]
        except ValueError as e:
            warnings.append(f"Cleaning step skipped: {str(e)[:120]}")
    return X, y, origin, warnings


def prepare(df: pd.DataFrame, spec: dict, dataset_id: str, image_shape=None, max_points: int = 1200) -> Prepared:
    from sklearn.feature_selection import (SelectKBest, VarianceThreshold, f_classif, f_regression,
                                           mutual_info_classif, mutual_info_regression)
    from sklearn.impute import SimpleImputer
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import (LabelEncoder, MinMaxScaler, OneHotEncoder, OrdinalEncoder, RobustScaler,
                                       StandardScaler)

    spec = merged_spec(spec)
    task, target = spec["task"], spec["target"]
    warnings: list[str] = []
    if target not in df.columns:
        raise ValueError(f"Target column '{target}' not found.")
    seed = int(spec["split"].get("seed", 42))
    df = df.copy()
    n0 = len(df)
    df = df[df[target].notna()]
    if task == "regression":
        df = df[pd.to_numeric(df[target], errors="coerce").notna()]
    if len(df) < n0:
        warnings.append(f"Dropped {n0 - len(df)} row(s) with a missing target.")
    tf = spec.get("target_filter") or {}
    if task == "regression" and tf.get("enabled") and (tf.get("min") is not None or tf.get("max") is not None):
        t = pd.to_numeric(df[target], errors="coerce")
        keep = pd.Series(True, index=df.index)
        if tf.get("min") is not None:
            keep &= t >= float(tf["min"])
        if tf.get("max") is not None:
            keep &= t <= float(tf["max"])
        if keep.sum() < 10:
            raise ValueError("The target range filter removes almost every row — widen the range.")
        if (~keep).sum():
            warnings.append(f"Removed {int((~keep).sum())} row(s) whose target was outside the allowed range (impossible values).")
        df = df[keep]

    raw_columns = [c for c in df.columns if c != target]
    n_dup = int(df.duplicated().sum())
    if spec["dedupe"].get("enabled") and n_dup:
        df = df.drop_duplicates()
        warnings.append(f"Removed {n_dup} exact duplicate row(s).")
    fe_steps = list(spec.get("features") or [])
    fe_new: list[str] = []
    fe_drop: set = set()
    if fe_steps:
        df, fe_new, fe_drop = apply_stateless(df, fe_steps)

    sp = spec["split"]
    method = sp.get("method", "random")
    split_excluded = set()
    if method == "group" and sp.get("group_column"):
        split_excluded.add(sp["group_column"])
    if method == "time" and sp.get("time_column") and column_role(df[sp["time_column"]]) != "numeric":
        split_excluded.add(sp["time_column"])

    pp = Preprocessor()
    pp.fe_steps = fe_steps
    pp.task, pp.target = task, target
    drop = set(spec["drop_columns"] or []) | fe_drop | split_excluded
    cols = [c for c in df.columns if c != target and c not in drop]
    auto_dropped = [c for c in cols if column_role(df[c]) in ("id", "text", "datetime")]
    if auto_dropped:
        dates = [c for c in auto_dropped if column_role(df[c]) == "datetime"]
        others = [c for c in auto_dropped if c not in dates]
        if others:
            warnings.append(f"Ignored ID/text-like column(s): {', '.join(map(str, others))}.")
        if dates:
            warnings.append(f"Ignored date column(s) {', '.join(map(str, dates))} — use Create features → date parts to turn them into usable numbers.")
    cols = [c for c in cols if c not in auto_dropped]
    if not cols:
        raise ValueError("No feature columns left — keep at least one column besides the target.")
    pp.input_columns = cols
    pp.numeric_cols = [c for c in cols if column_role(df[c]) == "numeric"]
    pp.categorical_cols = [c for c in cols if c not in pp.numeric_cols]

    if spec["impute"].get("numeric") == "drop_rows":
        n1 = len(df)
        df = df.dropna(subset=cols)
        if len(df) < n1:
            warnings.append(f"Dropped {n1 - len(df)} row(s) with missing values.")
    if len(df) < 10:
        raise ValueError("Fewer than 10 usable rows — add more data.")

    # ---- target ----
    y_raw = df[target]
    if task == "classification":
        pp.label_encoder = LabelEncoder().fit(y_raw.astype(str))
        classes = pp.classes
        if len(classes) < 2:
            raise ValueError("The target has only one class — classification needs at least two.")
        if len(classes) > 50:
            raise ValueError(f"The target has {len(classes)} distinct values — that looks like a regression problem.")
    else:
        classes = None
        pp.target_transform = spec.get("target_transform", "none")
    y_all = pp.encode_y(y_raw)

    # ---- split ----
    test_size = float(sp.get("test_size", 0.2))
    val_size = float(sp.get("val_size", 0.1))
    idx = np.arange(len(df))
    va_idx = np.array([], dtype=int)
    rel = val_size / max(1e-9, 1 - test_size)
    split_info: dict = {"method": method}
    if method == "group":
        from sklearn.model_selection import GroupShuffleSplit
        gcol = sp.get("group_column")
        if not gcol or gcol not in df.columns:
            raise ValueError("Choose the column that identifies a group (e.g. patient ID) for a group split.")
        groups = df[gcol].astype(str).to_numpy()
        if len(set(groups)) < 5:
            raise ValueError(f"'{gcol}' has fewer than 5 groups — a group split needs more.")
        tr_idx, te_idx = next(GroupShuffleSplit(1, test_size=test_size, random_state=seed).split(idx, groups=groups))
        if val_size > 0:
            a, b = next(GroupShuffleSplit(1, test_size=rel, random_state=seed).split(tr_idx, groups=groups[tr_idx]))
            tr_idx, va_idx = tr_idx[a], tr_idx[b]
        split_info.update({"group_column": gcol, "groups": {"train": len(set(groups[tr_idx])), "val": len(set(groups[va_idx])),
                                                             "test": len(set(groups[te_idx]))}, "shared_groups": 0})
    elif method == "time":
        tcol = sp.get("time_column")
        if not tcol or tcol not in df.columns:
            raise ValueError("Choose the date/time column for a time-based split.")
        t = pd.to_numeric(df[tcol], errors="coerce") if column_role(df[tcol]) == "numeric" else parse_dates(df[tcol])
        if t.notna().mean() < 0.5:
            raise ValueError(f"'{tcol}' doesn't look like a date or time.")
        order = np.argsort(t.fillna(t.min()).to_numpy(), kind="stable")
        n = len(df)
        n_te, n_va = int(round(n * test_size)), int(round(n * val_size))
        te_idx, va_idx, tr_idx = order[n - n_te:], order[n - n_te - n_va:n - n_te], order[:n - n_te - n_va]
        tt = t.to_numpy()
        rng_of = lambda ix: [str(pd.Series(tt[ix]).min()), str(pd.Series(tt[ix]).max())] if len(ix) else None  # noqa: E731
        split_info.update({"time_column": tcol, "train_range": rng_of(tr_idx), "val_range": rng_of(va_idx), "test_range": rng_of(te_idx)})
    else:
        strat = y_all if (task == "classification" and sp.get("stratify", True)) else None
        if strat is not None and np.bincount(strat).min() < 3:
            strat = None
            warnings.append("Some class is too small to stratify the split; used a plain random split.")
        tr_idx, te_idx = train_test_split(idx, test_size=test_size, random_state=seed, stratify=strat)
        if val_size > 0:
            s2 = strat[tr_idx] if strat is not None else None
            tr_idx, va_idx = train_test_split(tr_idx, test_size=rel, random_state=seed, stratify=s2)
        gcol = sp.get("group_column")
        if gcol and gcol in df.columns:
            g = df[gcol].astype(str).to_numpy()
            split_info["shared_groups"] = len(set(g[tr_idx]) & set(g[te_idx]))
            split_info["group_column"] = gcol

    # quantile buckets are fitted on training rows only
    if any(st.get("op") == "bin" for st in fe_steps):
        pp.bin_edges = fit_bins(df.iloc[tr_idx], fe_steps)
        df, bin_new, bin_drop = apply_bins(df, fe_steps, pp.bin_edges)
        fe_new += bin_new
        pp.input_columns = [c for c in pp.input_columns if c not in bin_drop] + [c for c in bin_new if c not in pp.input_columns]
        pp.numeric_cols = [c for c in pp.numeric_cols if c not in bin_drop]
        pp.categorical_cols = [c for c in pp.categorical_cols if c not in bin_drop] + [c for c in bin_new if c not in pp.categorical_cols]
    df_tr, df_va, df_te = df.iloc[tr_idx], df.iloc[va_idx], df.iloc[te_idx]

    # ---- impute + encode (fit on train) ----
    num_strategy = spec["impute"].get("numeric", "median")
    num_strategy = {"zero": "constant", "drop_rows": "median"}.get(num_strategy, num_strategy)
    if pp.numeric_cols:
        pp.num_imputer = SimpleImputer(strategy=num_strategy, fill_value=0.0, keep_empty_features=True).fit(
            df_tr[pp.numeric_cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float))
    if pp.categorical_cols:
        cat_tr = df_tr[pp.categorical_cols].astype("object")
        cat_tr = cat_tr.where(cat_tr.notna(), np.nan).map(lambda v: np.nan if pd.isna(v) else str(v)).to_numpy(dtype=object)
        cs = spec["impute"].get("categorical", "most_frequent")
        pp.cat_imputer = SimpleImputer(strategy="constant" if cs == "constant" else "most_frequent",
                                       fill_value="missing", keep_empty_features=True).fit(cat_tr)
        cat_tr_i = pp.cat_imputer.transform(cat_tr)
        pp.encode_method = spec["encode"].get("method", "onehot")
        if pp.encode_method == "ordinal":
            pp.encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1).fit(cat_tr_i)
            enc_names = list(pp.categorical_cols)
        else:
            mc = int(spec["encode"].get("max_categories", 20))
            pp.encoder = OneHotEncoder(handle_unknown="infrequent_if_exist", sparse_output=False,
                                       max_categories=max(2, mc)).fit(cat_tr_i)
            enc_names = [str(n) for n in pp.encoder.get_feature_names_out(pp.categorical_cols)]
    else:
        enc_names = []
    pp.encoded_names = list(pp.numeric_cols) + enc_names
    if pp.categorical_cols and pp.encode_method == "onehot":
        off = len(pp.numeric_cols)
        groups = []
        for j, c in enumerate(pp.categorical_cols):
            members = [k for k, nm in enumerate(enc_names) if nm.startswith(f"{c}_")]
            groups.append([off + k for k in members])
        pp.onehot_groups = groups

    E_tr, E_va, E_te = pp._encode(df_tr), pp._encode(df_va), pp._encode(df_te)
    y_tr, y_va, y_te = y_all[tr_idx], y_all[va_idx], y_all[te_idx]

    # ---- outliers (train only, numeric columns) ----
    out_removed = 0
    oc = spec["outliers"]
    if oc.get("enabled") and pp.numeric_cols:
        num = E_tr[:, : len(pp.numeric_cols)]
        f = float(oc.get("factor", 1.5 if oc.get("method", "iqr") == "iqr" else 3.0))
        if oc.get("method", "iqr") == "iqr":
            q1, q3 = np.percentile(num, 25, axis=0), np.percentile(num, 75, axis=0)
            iqr = q3 - q1
            ok = ((num >= q1 - f * iqr) & (num <= q3 + f * iqr)) | (iqr == 0)
        else:
            sd = num.std(axis=0)
            sd[sd == 0] = 1
            ok = np.abs((num - num.mean(axis=0)) / sd) <= f
        keep = ok.all(axis=1)
        if keep.sum() >= max(10, 0.5 * len(keep)):
            out_removed = int((~keep).sum())
            E_tr, y_tr = E_tr[keep], y_tr[keep]
        else:
            warnings.append("Outlier removal would delete more than half of the training rows — skipped. Try a larger factor.")

    # ---- scale ----
    sm = spec["scale"].get("method", "standard")
    scaler = {"standard": StandardScaler, "minmax": MinMaxScaler, "robust": RobustScaler}.get(sm)
    pp.scaler = scaler().fit(E_tr) if scaler else None

    # ---- feature selection ----
    fs = spec["feature_select"]
    S_tr = pp.scaler.transform(E_tr) if pp.scaler else E_tr
    names = list(pp.encoded_names)
    method = fs.get("method", "none")
    if method != "none" and S_tr.shape[1] > 1:
        k = max(1, min(int(fs.get("k", 10)), S_tr.shape[1]))
        if method == "kbest":
            sel = SelectKBest(f_classif if task == "classification" else f_regression, k=k).fit(S_tr, y_tr)
            mask = sel.get_support()
        elif method == "mutual_info":
            fn = mutual_info_classif if task == "classification" else mutual_info_regression
            mi = fn(S_tr[:5000], y_tr[:5000], random_state=seed)
            mask = np.zeros(S_tr.shape[1], bool)
            mask[np.argsort(-mi)[:k]] = True
        elif method == "variance":
            sel = VarianceThreshold(float(fs.get("threshold", 0.0))).fit(S_tr)
            mask = sel.get_support()
        elif method == "model":
            from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
            m = (RandomForestClassifier if task == "classification" else RandomForestRegressor)(
                n_estimators=100, random_state=seed, n_jobs=-1).fit(S_tr[:5000], y_tr[:5000])
            mask = np.zeros(S_tr.shape[1], bool)
            mask[np.argsort(-m.feature_importances_)[:k]] = True
        else:
            mask = np.ones(S_tr.shape[1], bool)
        if not mask.any():
            mask[0] = True
        pp.selected = np.where(mask)[0]
        names = [names[i] for i in pp.selected]
    rd = spec.get("reduce") or {}
    if rd.get("method") == "pca":
        from sklearn.decomposition import PCA
        S_sel = S_tr[:, pp.selected] if pp.selected is not None else S_tr
        k = max(1, min(int(rd.get("n_components", 5)), S_sel.shape[1], len(S_sel)))
        pp.reducer = PCA(n_components=k, random_state=seed).fit(S_sel)
        warnings.append(f"PCA kept {k} components explaining {pp.reducer.explained_variance_ratio_.sum():.0%} of the variation.")
        names = [f"PC{i + 1}" for i in range(k)]
    pp.feature_names_out = names
    fe_sources = set()
    for st in fe_steps:
        for k in ("a", "b", "column"):
            if st.get(k):
                fe_sources.add(st[k])
        if st.get("op") == "formula":
            fe_sources |= {c for c in raw_columns if c in str(st.get("expr", ""))}
    raw_inputs = [c for c in raw_columns if c in df_tr.columns and (c in pp.input_columns or c in fe_sources)]
    raw_num = [c for c in raw_inputs if column_role(df_tr[c]) == "numeric"]
    raw_date = [c for c in raw_inputs if column_role(df_tr[c]) in ("datetime", "id", "text") and c in fe_sources]
    raw_cat = [c for c in raw_inputs if c not in raw_num and c not in raw_date]
    pp.input_schema = _input_schema(df_tr, raw_num, raw_cat, raw_date)

    X_tr, X_va, X_te = pp._finish(E_tr), pp._finish(E_va), pp._finish(E_te)

    # remap one-hot groups into the selected column space + compute lo/hi (scaled 0 and 1)
    groups = []
    if pp.onehot_groups:
        pos = {int(c): i for i, c in enumerate(pp.selected)} if pp.selected is not None else None
        for g in pp.onehot_groups:
            gg = [pos[c] for c in g if pos is None or c in pos] if pos is not None else g
            if len(gg) >= 2:
                groups.append(gg)
    zeros = np.zeros((1, len(pp.encoded_names)))
    ones = np.ones((1, len(pp.encoded_names)))
    lo, hi = pp._finish(zeros)[0], pp._finish(ones)[0]

    # ---- resample (train only) ----
    rs = spec["resample"]
    X_tr_orig, y_tr_orig = X_tr.copy(), y_tr.copy()
    before_counts = _counts(y_tr, classes) if classes else None
    origin = np.arange(len(y_tr))
    if task == "classification" and (rs.get("mode", "none") != "none" or rs.get("clean", "none") != "none"):
        X_tr, y_tr, origin, w = resample(X_tr, y_tr, rs, classes, seed, groups, (lo, hi))
        X_tr = X_tr.astype(np.float32)
        warnings += w
    elif task == "regression" and rs.get("mode", "none") != "none":
        warnings.append("Class rebalancing only applies to classification — skipped.")

    # ---- report + projections for the animation ----
    rng = np.random.default_rng(seed)
    P_before, pca = project_2d(X_tr_orig)
    pts_idx = np.arange(len(y_tr_orig))
    if len(pts_idx) > max_points:
        pts_idx = np.sort(rng.choice(len(pts_idx), max_points, replace=False))
    sample_set = set(pts_idx.tolist())

    def lab(v):
        return classes[int(v)] if classes else r(pp.decode_y([v])[0], 3)

    before_pts = [{"id": f"o{i}", "x": r(P_before[i, 0], 3), "y": r(P_before[i, 1], 3), "label": lab(y_tr_orig[i])}
                  for i in pts_idx]
    P_after, _ = project_2d(X_tr, pca) if pca is not None else (X_tr[:, :2] if X_tr.shape[1] >= 2 else np.hstack([X_tr, np.zeros_like(X_tr)]), None)
    kept_ids = set()
    after_pts = []
    added_idx = np.where(origin < 0)[0]
    if len(added_idx) > max_points // 2:
        added_idx = np.sort(rng.choice(added_idx, max_points // 2, replace=False))
    for i, o in enumerate(origin):
        if o >= 0 and o in sample_set and o not in kept_ids:
            kept_ids.add(int(o))
            after_pts.append({"id": f"o{o}", "x": r(P_after[i, 0], 3), "y": r(P_after[i, 1], 3), "label": lab(y_tr[i])})
    for k, i in enumerate(added_idx):
        after_pts.append({"id": f"a{k}", "x": r(P_after[i, 0], 3), "y": r(P_after[i, 1], 3), "label": lab(y_tr[i]),
                          "synthetic": True})
    n_removed = int(len(y_tr_orig) - len(set(int(o) for o in origin if o >= 0)))
    report = {
        "splits": {"train": int(len(y_tr)), "train_before_resample": int(len(y_tr_orig)), "val": int(len(y_va)),
                   "test": int(len(y_te))},
        "class_counts_before": before_counts,
        "class_counts_after": _counts(y_tr, classes) if classes else None,
        "class_counts_test": _counts(y_te, classes) if classes else None,
        "added": int((origin < 0).sum()), "removed": n_removed,
        "outliers_removed": out_removed,
        "before_points": before_pts, "after_points": after_pts,
        "feature_names_out": names, "n_features": int(X_tr.shape[1]), "n_features_before_select": len(pp.encoded_names),
        "numeric_columns": pp.numeric_cols, "categorical_columns": pp.categorical_cols,
        "warnings": warnings,
        "duplicates_found": n_dup, "features_created": fe_new, "split_info": split_info,
    }
    if task == "regression":
        report["target_hist_train"] = {"values": [r(v, 3) for v in pp.decode_y(y_tr_orig[pts_idx])]}

    img = None
    if image_shape and pp.selected is None and not pp.categorical_cols and X_tr.shape[1] == int(np.prod(image_shape)):
        img = list(image_shape)
    report["image_shape"] = img
    prepared = Prepared(id=new_id("pr"), task=task, target=target, dataset_id=dataset_id, spec=spec, preprocessor=pp,
                        X_train=X_tr, y_train=y_tr, X_val=X_va, y_val=y_va, X_test=X_te, y_test=y_te,
                        feature_names=names, classes=classes, image_shape=img, report=report, pca=pca,
                        X_train_orig=X_tr_orig, y_train_orig=y_tr_orig, resample_groups=groups, resample_lohi=(lo, hi),
                        raw_test=df_te.head(5000).reset_index(drop=True))
    report["prepared_id"] = prepared.id
    return prepared
