"""Time-series forecasting (numpy/pandas; sklearn and torch are imported lazily inside the worker processes).

Data: a time column, a value column, optionally a series-id column (several series side by side) and extra columns that
are known in advance (promotions, a temperature forecast).

Features are built *causally*: the value at step t is predicted from values up to t-1 only (lags, rolling means), plus
calendar parts, a trend counter, the extra columns at t and a one-hot of the series. Each series is put on a common scale
(optional log, then standardised with its training mean/std) so one model can learn from all of them.

Split
  "time"   — the last `horizon` steps of every series are the test, the `horizon` steps before them validation.
             The test score is a genuine *recursive multi-step forecast*: from the start of the test block the model
             predicts step 1, feeds that guess back in as a lag, predicts step 2, … exactly as it would in real life.
  "random" — random rows become the test (the classic leak: the model has seen the days around every test day, and the
             test only asks for one step ahead with the true values as lags). Scores look great and mean little.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd

from ..util.jsonable import r

FREQ_SEASON = {"hour": 24, "day": 7, "week": 52, "month": 12, "quarter": 4, "year": 1, "step": 1}
FREQ_UNIT = {"hour": "hour", "day": "day", "week": "week", "month": "month", "quarter": "quarter", "year": "year", "step": "step"}
SEASON_NAME = {"hour": "day", "day": "week", "week": "year", "month": "year", "quarter": "year"}
_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ----------------------------------------------------------------------------- synthetic series
def gen_store_sales(n_days=730, n_stores=3, seed=42, start="2023-04-01"):
    """Daily sales for a few shops: growth, a weekly rhythm, a yearly swing, promotions and the Christmas rush."""
    rng = np.random.default_rng(seed)
    t = pd.date_range(start, periods=n_days, freq="D")
    dow, doy = t.dayofweek.to_numpy(), t.dayofyear.to_numpy()
    weekly = np.array([0.82, 0.78, 0.84, 0.93, 1.12, 1.38, 1.13])
    yearly = 1 + 0.12 * np.sin(2 * np.pi * (doy - 80) / 365.25)
    holiday = np.ones(n_days)
    for i, d in enumerate(t):
        if d.month == 12 and 10 <= d.day <= 24:
            holiday[i] = 1 + 0.03 * (d.day - 9)
        elif d.month == 12 and d.day in (25, 26):
            holiday[i] = 0.3
        elif d.month == 1 and d.day == 1:
            holiday[i] = 0.4
    rows = []
    for s in range(n_stores):
        base, growth = rng.uniform(150, 420), rng.uniform(0.0002, 0.0008)
        promo = np.zeros(n_days, int)
        i = 0
        while i < n_days:
            if rng.random() < 0.035:
                L = int(rng.integers(3, 8))
                promo[i:i + L] = 1
                i += L + 7
            i += 1
        lift = rng.uniform(0.22, 0.38)
        noise = rng.lognormal(0, 0.07, n_days)
        sales = base * (1 + growth * np.arange(n_days)) * weekly[dow] * yearly * (1 + lift * promo) * holiday * noise
        name = f"Store {chr(65 + s)}"
        rows.append(pd.DataFrame({"date": t.strftime("%Y-%m-%d"), "store": name, "sales": np.round(sales).astype(int), "promo": promo}))
    return pd.concat(rows, ignore_index=True)


def gen_energy(n_hours=24 * 56, seed=42, start="2024-01-08"):
    """Hourly electricity demand: morning and evening peaks, quieter weekends, more heating when it's cold."""
    rng = np.random.default_rng(seed)
    t = pd.date_range(start, periods=n_hours, freq="h")
    h, dow = t.hour.to_numpy(), t.dayofweek.to_numpy()
    days = n_hours // 24 + 1
    weather = np.repeat(np.cumsum(rng.normal(0, 1.4, days)) * 0.6, 24)[:n_hours]
    weather = np.convolve(np.r_[np.full(12, weather[0]), weather, np.full(11, weather[-1])], np.ones(24) / 24, "valid")[:n_hours]
    temp = 6 + 5 * np.sin(2 * np.pi * (h - 9) / 24) + weather + rng.normal(0, 0.6, n_hours)
    profile = 430 + 170 * np.exp(-((h - 8) ** 2) / 6) + 240 * np.exp(-((h - 19) ** 2) / 8) - 90 * np.exp(-((h - 3) ** 2) / 6)
    weekend = np.where(dow >= 5, 0.86, 1.0)
    demand = profile * weekend + 11 * np.clip(16 - temp, 0, None) + rng.normal(0, 14, n_hours)
    return pd.DataFrame({"time": t.strftime("%Y-%m-%d %H:%M"), "demand": np.round(demand, 1), "temperature": np.round(temp, 1)})


def gen_airline(n_months=144, seed=42, start="2012-01-01"):
    """Monthly passengers: steady growth and a summer peak that grows with the business (multiplicative)."""
    rng = np.random.default_rng(seed)
    t = pd.date_range(start, periods=n_months, freq="MS")
    m = t.month.to_numpy()
    level = 120 * np.exp(0.0095 * np.arange(n_months))
    season = 1 + 0.16 * np.sin(2 * np.pi * (m - 4) / 12) + 0.12 * np.isin(m, [7, 8]) - 0.06 * np.isin(m, [11, 2])
    y = level * season * rng.lognormal(0, 0.025, n_months)
    return pd.DataFrame({"month": t.strftime("%Y-%m-%d"), "passengers": np.round(y).astype(int)})


def gen_web_traffic(n_days=540, seed=42, start="2024-01-01", shift_at=400):
    """Daily website visits: busy weekdays, a slow climb, a jump after a redesign launch, and a few viral days."""
    rng = np.random.default_rng(seed)
    t = pd.date_range(start, periods=n_days, freq="D")
    dow = t.dayofweek.to_numpy()
    weekly = np.array([1.12, 1.15, 1.13, 1.08, 0.98, 0.74, 0.8])
    level = 2000 * (1 + 0.0006 * np.arange(n_days)) * np.where(np.arange(n_days) >= shift_at, 1.55, 1.0)
    spikes = np.ones(n_days)
    for d in rng.choice(n_days, 6, replace=False):
        spikes[d] *= rng.uniform(2.2, 3.5)
        if d + 1 < n_days:
            spikes[d + 1] *= 1.4
    y = level * weekly[dow] * spikes * rng.lognormal(0, 0.06, n_days)
    return pd.DataFrame({"date": t.strftime("%Y-%m-%d"), "visits": np.round(y).astype(int)})


FORECAST_SETS = {
    "store_sales": {"label": "Shop sales", "emoji": "🛒", "gen": gen_store_sales, "horizon": 28,
                    "blurb": "Two years of daily sales for 3 shops — weekends, promotions, a yearly swing and the Christmas rush.",
                    "columns": {"time": "date", "value": "sales", "series": "store"}, "exog": ["promo"]},
    "energy": {"label": "Electricity demand", "emoji": "⚡", "gen": gen_energy, "horizon": 48,
               "blurb": "8 weeks of hourly demand with morning and evening peaks, quiet weekends and a temperature column.",
               "columns": {"time": "time", "value": "demand"}, "exog": ["temperature"]},
    "airline": {"label": "Airline passengers", "emoji": "✈️", "gen": gen_airline, "horizon": 12,
                "blurb": "12 years of monthly passengers — growth plus a summer peak that grows with it (try the log transform).",
                "columns": {"time": "month", "value": "passengers"}, "exog": []},
    "web_traffic": {"label": "Website visits", "emoji": "🌐", "gen": gen_web_traffic, "horizon": 28,
                    "blurb": "18 months of daily visits with busy weekdays, a jump after a redesign and a few viral days.",
                    "columns": {"time": "date", "value": "visits"}, "exog": []},
}


def generate(name="store_sales", params=None, seed=42):
    s = FORECAST_SETS[name]
    df = s["gen"](seed=seed, **(params or {}))
    return df, {"name": s["label"], "source": "timeseries_set", "modality": "timeseries", "task_hint": "forecasting",
                "columns": dict(s["columns"]), "exog": list(s["exog"]), "horizon": s["horizon"]}


def public_sets() -> dict:
    return {k: {kk: vv for kk, vv in v.items() if kk != "gen"} for k, v in FORECAST_SETS.items()}


# ----------------------------------------------------------------------------- time helpers
def parse_times(col: pd.Series) -> tuple[pd.Series, bool]:
    """Datetimes if the column looks like dates, else integer steps. Returns (values, is_datetime)."""
    if pd.api.types.is_numeric_dtype(col):
        return pd.to_numeric(col, errors="coerce"), False
    t = pd.to_datetime(col, errors="coerce", format="mixed")
    if t.notna().mean() < 0.9:
        raise ValueError(f"Couldn't read “{col.name}” as dates or step numbers.")
    return t, True


def infer_freq(t: pd.Series, is_dt: bool) -> str:
    if not is_dt:
        return "step"
    u = np.sort(pd.Series(t.dropna().unique()))
    if len(u) < 3:
        return "day"
    d = pd.Series(np.diff(u)).median() / pd.Timedelta(hours=1)
    if d <= 1.5:
        return "hour"
    if d <= 36:
        return "day"
    if d <= 8 * 24:
        return "week"
    if d <= 32 * 24:
        return "month"
    if d <= 100 * 24:
        return "quarter"
    return "year"


def step_offset(freq: str):
    return {"hour": pd.Timedelta(hours=1), "day": pd.Timedelta(days=1), "week": pd.Timedelta(weeks=1),
            "month": pd.DateOffset(months=1), "quarter": pd.DateOffset(months=3), "year": pd.DateOffset(years=1)}.get(freq)


def future_times(last, freq: str, n: int, is_dt: bool) -> list:
    if not is_dt:
        return [last + i for i in range(1, n + 1)]
    off = step_offset(freq)
    out, cur = [], pd.Timestamp(last)
    for _ in range(n):
        cur = cur + off
        out.append(cur)
    return out


def fmt_time(t, freq: str, is_dt: bool) -> str | float:
    if not is_dt:
        return float(t)
    t = pd.Timestamp(t)
    return t.strftime("%Y-%m-%d %H:%M") if freq == "hour" else t.strftime("%Y-%m-%d")


def calendar(times, freq: str, is_dt: bool) -> tuple[np.ndarray, list[str]]:
    """One-hot calendar parts suited to the data's rhythm."""
    n = len(times)
    if not is_dt or freq in ("step", "year"):
        return np.zeros((n, 0), np.float32), []
    t = pd.DatetimeIndex(times)
    cols, names = [], []
    if freq == "hour":
        cols.append(np.eye(24)[t.hour.to_numpy()])
        names += [f"hour_{h:02d}" for h in range(24)]
    if freq in ("hour", "day"):
        cols.append(np.eye(7)[t.dayofweek.to_numpy()])
        names += [f"dow_{d}" for d in _DOW]
    if freq in ("day", "week", "month"):
        cols.append(np.eye(12)[t.month.to_numpy() - 1])
        names += [f"month_{m}" for m in _MON]
    if freq == "quarter":
        cols.append(np.eye(4)[t.quarter.to_numpy() - 1])
        names += [f"Q{q}" for q in range(1, 5)]
    return np.hstack(cols).astype(np.float32), names


# ----------------------------------------------------------------------------- preparation
class ForecastIndex:
    """Everything needed to rebuild features and forecast from the end of each series. Duck-types the preprocessor slot."""

    def __init__(self, series: list[dict], cfg: dict, freq: str, is_dt: bool, season: int, horizon: int, exog: list[str],
                 cal_names: list[str], cols: dict):
        self.series, self.cfg, self.freq, self.is_dt = series, cfg, freq, is_dt
        self.season, self.horizon, self.exog, self.cal_names, self.cols = season, horizon, exog, cal_names, cols
        self.task, self.modality, self.target, self.classes = "forecasting", "timeseries", cols["value"], None
        self.input_schema: list = []
        self.fe_steps: list = []
        self.names = [s["name"] for s in series]

    @property
    def feature_names_out(self):
        return feature_names(self.cfg, self.cal_names, self.exog, self.names)

    def transform(self, x):
        return x

    def decode_y(self, y):
        return y

    # value transforms -------------------------------------------------
    def to_z(self, s: dict, y):
        y = np.asarray(y, float)
        if self.cfg["log"]:
            y = np.log1p(np.clip(y, -0.999, None))
        return (y - s["mu"]) / s["sd"]

    def from_z(self, s: dict, z):
        y = np.asarray(z, float) * s["sd"] + s["mu"]
        return np.expm1(y) if self.cfg["log"] else y

    def exog_z(self, s: dict, ex):
        ex = np.asarray(ex, float).reshape(len(ex), len(self.exog)) if len(self.exog) else np.zeros((len(ex), 0))
        return (ex - s["ex_mu"]) / s["ex_sd"]


def feature_names(cfg: dict, cal_names: list[str], exog: list[str], series_names: list[str], seq_window: int = 0) -> list[str]:
    names = [f"lag_{k}" for k in (range(seq_window, 0, -1) if seq_window else cfg["lags"])]
    if not seq_window:
        names += [f"mean_{w}" for w in cfg["windows"]]
    if cfg["calendar"]:
        names += cal_names
    if cfg["trend"]:
        names.append("trend")
    names += list(exog)
    if len(series_names) > 1:
        names += [f"series_{n}" for n in series_names]
    return names


def build_rows(z: np.ndarray, pos: np.ndarray, cal: np.ndarray, ex: np.ndarray, sidx: int, n_series: int, n_ref: int, cfg: dict,
               seq_window: int = 0) -> np.ndarray:
    """Design-matrix rows for target positions `pos`, using only z[:pos] (strictly the past)."""
    pos = np.asarray(pos, int)
    parts = []
    lags = list(range(seq_window, 0, -1)) if seq_window else cfg["lags"]
    if lags:
        parts.append(np.stack([z[pos - k] for k in lags], 1))
    if not seq_window and cfg["windows"]:
        cs = np.r_[0.0, np.cumsum(z)]
        parts.append(np.stack([(cs[pos] - cs[pos - w]) / w for w in cfg["windows"]], 1))
    if cfg["calendar"] and cal.shape[1]:
        parts.append(cal[pos])
    if cfg["trend"]:
        parts.append((pos / max(1, n_ref))[:, None])
    if ex.shape[1]:
        parts.append(ex[pos])
    if n_series > 1:
        oh = np.zeros((len(pos), n_series))
        oh[:, sidx] = 1
        parts.append(oh)
    return np.hstack(parts).astype(np.float32) if parts else np.zeros((len(pos), 0), np.float32)


def _auto_lags(season: int, n: int) -> list[int]:
    lags = [1, 2, 3] + ([season] if season > 3 else []) + ([2 * season] if season > 1 and 2 * season < n / 4 else [])
    return sorted({k for k in lags if k < n / 4})


def prepare_forecast(df: pd.DataFrame, spec: dict, dataset_id: str, meta: dict | None = None):
    from .pipeline import Prepared
    from .store import new_id
    meta = meta or {}
    cols = {"time": None, "value": None, "series": None, **(meta.get("columns") or {}),
            **{k: v for k, v in (spec.get("columns") or {}).items() if v is not None}}
    if cols.get("series") in ("", "none"):
        cols["series"] = None
    for k in ("time", "value"):
        if not cols.get(k) or cols[k] not in df.columns:
            raise ValueError(f"Choose the {k} column.")
    fc = {"horizon": meta.get("horizon") or 14, "lags": None, "windows": None, "calendar": True, "trend": False, "diff": False,
          "log": False, "exog": meta.get("exog") or [], "season": None, **(spec.get("forecast") or {})}
    method = (spec.get("split") or {}).get("method", "time")
    method = method if method in ("time", "random") else "time"
    seed = int((spec.get("split") or {}).get("seed", 42))
    exog = [c for c in (fc["exog"] or []) if c in df.columns and c not in (cols["time"], cols["value"], cols["series"])]

    d = df.copy()
    t, is_dt = parse_times(d[cols["time"]])
    d["__t"] = t
    d["__y"] = pd.to_numeric(d[cols["value"]], errors="coerce")
    d["__s"] = d[cols["series"]].astype(str) if cols.get("series") and cols["series"] in d.columns else "all"
    for c in exog:
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d = d.dropna(subset=["__t"])
    freq = infer_freq(d["__t"], is_dt)
    season = int(fc["season"] or FREQ_SEASON[freq])
    if fc["log"] and (d["__y"].min() <= -1):
        raise ValueError("log(1+y) needs every value above −1.")

    raw_series, filled = [], 0
    for name, g in d.groupby("__s", sort=True):
        g = g.groupby("__t", sort=True)[["__y"] + exog].mean()
        if is_dt and freq in ("hour", "day") and len(g) > 2:
            full = pd.date_range(g.index.min(), g.index.max(), freq="h" if freq == "hour" else "D")
            if len(full) <= 1.5 * len(g):  # fill small gaps; leave very irregular data alone
                g = g.reindex(full)
        filled += int(g["__y"].isna().sum())
        g["__y"] = g["__y"].interpolate(limit_direction="both")
        for c in exog:
            g[c] = g[c].ffill().bfill().fillna(0)
        raw_series.append((str(name), g))
    raw_series = [(n, g) for n, g in raw_series if len(g) >= 30]
    if not raw_series:
        raise ValueError("Each series needs at least 30 time steps.")
    if len(raw_series) > 30:
        raise ValueError("More than 30 series — choose a series column with fewer distinct values (or none).")
    n_min = min(len(g) for _, g in raw_series)
    H = int(max(1, min(int(fc["horizon"]), n_min // 5)))
    lags = sorted({int(k) for k in (fc["lags"] if fc["lags"] is not None else _auto_lags(season, n_min)) if 0 < int(k) < n_min / 3})
    windows = sorted({int(w) for w in (fc["windows"] if fc["windows"] is not None else ([season] if season > 2 else [3])) if 1 < int(w) < n_min / 3})
    if not lags and not windows and not fc["calendar"]:
        lags = [1]
    cfg = {"lags": lags, "windows": windows, "calendar": bool(fc["calendar"]), "trend": bool(fc["trend"]), "diff": bool(fc["diff"]),
           "log": bool(fc["log"])}
    L = max(lags + windows + [1]) + (1 if cfg["diff"] else 0)

    series, cal_names = [], []
    for si, (name, g) in enumerate(raw_series):
        n = len(g)
        n_test = H
        n_val = H if n - 2 * H - L >= max(40, 3 * H) else 0
        n_train = n - n_test - n_val
        if n_train - L < 20:
            raise ValueError(f"Series “{name}” is too short for a {H}-step horizon with these lags. Shorten the horizon or the lags.")
        y = g["__y"].to_numpy(float)
        ex = g[exog].to_numpy(float) if exog else np.zeros((n, 0))
        ref = slice(0, n_train) if method == "time" else slice(0, n)
        yt = np.log1p(y) if cfg["log"] else y
        mu, sd = float(yt[ref].mean()), float(yt[ref].std() or 1.0)
        ex_mu, ex_sd = (ex[ref].mean(0), np.where(ex[ref].std(0) > 0, ex[ref].std(0), 1.0)) if exog else (np.zeros(0), np.ones(0))
        cal, cal_names = calendar(g.index, freq, is_dt)
        series.append({"name": name, "times": list(g.index), "y": y, "ex": ex, "mu": mu, "sd": sd, "ex_mu": ex_mu, "ex_sd": ex_sd,
                       "n": n, "n_train": n_train, "n_val": n_val, "n_test": n_test, "cal": cal})
    idx = ForecastIndex(series, cfg, freq, is_dt, season, H, exog, cal_names, cols)
    rng = np.random.default_rng(seed)
    for s in series:
        s["z"] = idx.to_z(s, s["y"])
        s["exz"] = idx.exog_z(s, s["ex"])
        allpos = np.arange(L, s["n"])
        if method == "time":
            s["train_pos"] = np.arange(L, s["n_train"])
            s["val_pos"] = np.arange(s["n_train"], s["n_train"] + s["n_val"])
            s["test_pos"] = np.arange(s["n_train"] + s["n_val"], s["n"])
        else:
            perm = rng.permutation(allpos)
            nt, nv = int(round(0.2 * len(perm))), int(round(0.1 * len(perm)))
            s["test_pos"], s["val_pos"], s["train_pos"] = np.sort(perm[:nt]), np.sort(perm[nt:nt + nv]), np.sort(perm[nt + nv:])

    def stack(key):
        X = [build_rows(s["z"], s[key], s["cal"], s["exz"], i, len(series), s["n_train"], cfg) for i, s in enumerate(series)]
        Y = [target_of(s["z"], s[key], cfg) for s in series]
        return np.vstack(X), np.concatenate(Y)

    X_tr, y_tr = stack("train_pos")
    X_va, y_va = stack("val_pos")
    X_te, y_te = stack("test_pos")
    names = idx.feature_names_out
    report = _report(idx, method, H, L, filled, names, X_tr, X_va, X_te)
    p = Prepared(id=new_id("pr"), task="forecasting", target=cols["value"], dataset_id=dataset_id, spec=spec, preprocessor=idx,
                 X_train=X_tr, y_train=y_tr, X_val=X_va, y_val=y_va, X_test=X_te, y_test=y_te, feature_names=names, classes=None,
                 report=report, modality="timeseries", X_train_orig=X_tr, y_train_orig=y_tr,
                 payload={"split": method, "horizon": H, "lags_needed": L})
    report["prepared_id"] = p.id
    return p


def target_of(z: np.ndarray, pos: np.ndarray, cfg: dict) -> np.ndarray:
    pos = np.asarray(pos, int)
    return z[pos] - z[pos - 1] if cfg["diff"] else z[pos]


FEATURE_HELP = {"lag": "the value {k} {unit}{s} earlier", "mean": "the average of the previous {k} {unit}s",
                "trend": "a counter that grows steadily with time (lets the model follow a trend)"}


def explain_feature(name: str, idx: ForecastIndex) -> str:
    unit = FREQ_UNIT[idx.freq]
    if name.startswith("lag_"):
        k = int(name[4:])
        return FEATURE_HELP["lag"].format(k=k, unit=unit, s="s" if k > 1 else "") + (" — same point last " + SEASON_NAME.get(idx.freq, "season") if k == idx.season else "")
    if name.startswith("mean_"):
        return FEATURE_HELP["mean"].format(k=int(name[5:]), unit=unit)
    if name == "trend":
        return FEATURE_HELP["trend"]
    if name.startswith(("hour_", "dow_", "month_", "Q")):
        return "calendar: is it " + name.split("_")[-1] + "?"
    if name.startswith("series_"):
        return "which series this row belongs to"
    return "known in advance: " + name


def _report(idx: ForecastIndex, method, H, L, filled, names, X_tr, X_va, X_te) -> dict:
    s0 = idx.series[0]
    warnings = []
    if method == "random":
        warnings.append("Random split: test days are scattered between training days, and each test only asks for one step ahead "
                        "with the true recent values. Scores will look much better than real forecasts.")
    if idx.cfg["trend"] and not idx.cfg["diff"]:
        pass
    timeline = []
    for s in idx.series[:4]:
        n = s["n"]
        step = max(1, int(np.ceil(s["n_train"] / 360)))
        keep = list(range(0, s["n_train"], step)) + list(range(s["n_train"], n))
        part = np.full(n, "train", object)
        if method == "time":
            part[s["n_train"]:s["n_train"] + s["n_val"]] = "val"
            part[s["n_train"] + s["n_val"]:] = "test"
        else:
            part[s["val_pos"]] = "val"
            part[s["test_pos"]] = "test"
            keep = list(range(0, n, max(1, int(np.ceil(n / 500)))))
        timeline.append({"series": s["name"], "points": [{"t": fmt_time(s["times"][i], idx.freq, idx.is_dt), "y": r(s["y"][i], 4), "part": part[i]} for i in keep]})
    z = s0["z"][:s0["n_train"]] if method == "time" else s0["z"]
    max_lag = int(min(len(z) // 3, max(2 * idx.season + 2, 14), 60))
    zc = z - z.mean()
    den = float((zc ** 2).sum()) or 1.0
    acf = [{"lag": k, "r": r(float((zc[k:] * zc[:-k]).sum() / den), 3)} for k in range(1, max_lag + 1)]
    prof = None
    if idx.season > 1:
        pos_in = np.arange(len(z)) % idx.season
        if idx.is_dt and idx.freq in ("hour", "day", "month"):
            tt = pd.DatetimeIndex(s0["times"][:len(z)])
            pos_in = {"hour": tt.hour, "day": tt.dayofweek, "month": tt.month - 1}[idx.freq].to_numpy()
        labels = {"hour": [f"{h:02d}h" for h in range(24)], "day": _DOW, "month": _MON}.get(idx.freq if idx.is_dt else "", [str(i) for i in range(idx.season)])
        vals = [float(z[pos_in == i].mean()) if (pos_in == i).any() else 0.0 for i in range(idx.season)]
        prof = {"labels": labels[:idx.season], "values": [r(v, 3) for v in vals], "name": SEASON_NAME.get(idx.freq, "season")}
    return {
        "modality": "timeseries", "task": "forecasting", "classes": None,
        "splits": {"train": int(len(X_tr)), "train_before_resample": int(len(X_tr)), "val": int(len(X_va)), "test": int(len(X_te))},
        "freq": idx.freq, "unit": FREQ_UNIT[idx.freq], "season": idx.season, "season_name": SEASON_NAME.get(idx.freq), "horizon": H,
        "lags_needed": L, "n_series": len(idx.series), "series_names": idx.names, "n_steps": int(sum(s["n"] for s in idx.series)),
        "filled": int(filled), "split_info": {"method": method, "horizon": H, "val_steps": int(s0["n_val"]),
                                              "test_start": fmt_time(s0["times"][s0["n_train"] + s0["n_val"]], idx.freq, idx.is_dt) if method == "time" else None},
        "forecast_config": {**idx.cfg, "exog": idx.exog}, "timeline": timeline, "acf": acf, "seasonal_profile": prof,
        "features_explained": [{"name": n, "explain": explain_feature(n, idx)} for n in names if not n.startswith(("hour_", "dow_", "month_", "series_", "Q"))]
        + ([{"name": "calendar", "explain": f"{len(idx.cal_names)} calendar flags (" + ", ".join(sorted({c.split('_')[0] for c in idx.cal_names})) + ")"}] if idx.cfg["calendar"] and idx.cal_names else []),
        "feature_names_out": names, "n_features": len(names), "image_shape": None, "warnings": warnings,
        "before_points": [], "after_points": [], "class_counts_before": None, "class_counts_after": None, "class_counts_test": None,
        "added": 0, "outliers_removed": 0, "numeric_columns": [], "categorical_columns": [], "duplicates_found": 0, "features_created": [],
    }


# ----------------------------------------------------------------------------- models
BASELINE_KINDS = ("naive", "seasonal_naive", "moving_average", "holt_winters")


class Forecaster:
    """A one-step-ahead model in the scaled space, rolled forward recursively to forecast many steps."""

    def __init__(self, model_id: str, kind: str, index: ForecastIndex, params: dict):
        self.model_id, self.kind, self.index, self.params = model_id, kind, index, params
        self.cfg = dict(index.cfg)
        self.seq = int(params.get("window", 0)) if kind == "gru" else 0
        self.est = None
        self.hw: dict = {}
        self.curve = None
        self.resid_sd: dict = {}

    # ---------------------------------------------------------- rows
    def rows(self, s: dict, sidx: int, z: np.ndarray, pos, cal=None, exz=None) -> np.ndarray:
        return build_rows(z, pos, s["cal"] if cal is None else cal, s["exz"] if exz is None else exz, sidx, len(self.index.series),
                          s["n_train"], self.cfg, self.seq)

    @property
    def need(self) -> int:
        if self.kind == "naive":
            return 1
        if self.kind == "seasonal_naive":
            return self.index.season
        if self.kind == "moving_average":
            return int(self.params.get("window", 7))
        if self.kind == "holt_winters":
            return 1
        if self.kind == "gru":
            return self.seq + (1 if self.cfg["diff"] else 0)
        return max(list(self.cfg["lags"]) + list(self.cfg["windows"]) + [self.seq, 1]) + (1 if self.cfg["diff"] else 0)

    # ---------------------------------------------------------- one step
    def step(self, s: dict, sidx: int, z: np.ndarray, pos, cal=None, exz=None) -> np.ndarray:
        """One-step predictions (scaled space) for target positions, given values z before each position."""
        pos = np.asarray(pos, int)
        if not len(pos):
            return np.zeros(0)
        if self.kind == "naive":
            return z[pos - 1]
        if self.kind == "seasonal_naive":
            m = self.index.season
            return np.where(pos >= m, z[np.maximum(pos - m, 0)], z[pos - 1])
        if self.kind == "moving_average":
            w = int(self.params.get("window", 7))
            cs = np.r_[0.0, np.cumsum(z)]
            lo = np.maximum(pos - w, 0)
            return (cs[pos] - cs[lo]) / np.maximum(pos - lo, 1)
        if self.kind == "holt_winters":
            fitted = _hw_filter(z[: pos.max()], self.index.season if self.hw[sidx]["seasonal"] else 1, **self.hw[sidx]["coef"])[0]
            return fitted[pos - 1] if len(fitted) >= pos.max() else np.full(len(pos), z[pos - 1])
        X = self.rows(s, sidx, z, pos, cal, exz)
        out = self._predict(X)
        return z[pos - 1] + out if self.cfg["diff"] else out

    def _predict(self, X):
        if self.kind == "gru":
            return gru_predict(self, X)
        return np.asarray(self.est.predict(X), float)

    # ---------------------------------------------------------- multi step
    def forecast(self, s: dict, sidx: int, z_hist: np.ndarray, H: int, cal_future: np.ndarray, exz_future: np.ndarray) -> np.ndarray:
        """Recursive H-step forecast after z_hist (scaled space). cal/exz_future cover the H future steps."""
        n0 = len(z_hist)
        if self.kind == "holt_winters":
            c = self.hw[sidx]
            return _hw_forecast(z_hist, self.index.season if c["seasonal"] else 1, H, **c["coef"])
        z = np.r_[z_hist, np.zeros(H)]
        cal = np.vstack([s["cal"][:n0] if len(s["cal"]) >= n0 else np.zeros((n0, cal_future.shape[1])), cal_future]) if cal_future.shape[1] else np.zeros((n0 + H, 0))
        exz = np.vstack([s["exz"][:n0] if len(s["exz"]) >= n0 else np.zeros((n0, exz_future.shape[1])), exz_future]) if exz_future.shape[1] else np.zeros((n0 + H, 0))
        for h in range(H):
            z[n0 + h] = self.step(s, sidx, z, [n0 + h], cal, exz)[0]
        return z[n0:]


def _hw_filter(z, m, alpha, beta, gamma, phi=1.0, trend=True):
    """Additive Holt-Winters. Returns (one-step fitted values for z[1:], level, trend, seasonals)."""
    n = len(z)
    seasonal = m > 1 and n >= 2 * m
    if seasonal:
        lvl = float(z[:m].mean())
        b = float((z[m:2 * m].mean() - z[:m].mean()) / m) if trend else 0.0
        S = list(z[:m] - lvl)
    else:
        lvl, b, S = float(z[0]), (float(z[1] - z[0]) if trend and n > 1 else 0.0), [0.0]
        m = 1
    fitted = np.zeros(n)
    for t in range(n):
        sidx = t % m
        pred = lvl + phi * b + (S[sidx] if seasonal else 0.0)
        fitted[t] = pred
        y = z[t]
        new_l = alpha * (y - (S[sidx] if seasonal else 0.0)) + (1 - alpha) * (lvl + phi * b)
        if trend:
            b = beta * (new_l - lvl) + (1 - beta) * phi * b
        if seasonal:
            S[sidx] = gamma * (y - new_l) + (1 - gamma) * S[sidx]
        lvl = new_l
    # fitted[t] is the prediction for z[t] made before seeing it; shift so fitted[i] predicts z[i+1]
    return np.r_[fitted[1:], lvl + phi * b + (S[n % m] if seasonal else 0.0)], lvl, b, S, seasonal, m


def _hw_forecast(z, m, H, alpha, beta, gamma, phi=1.0, trend=True):
    _, lvl, b, S, seasonal, m = _hw_filter(z, m, alpha, beta, gamma, phi, trend)
    n = len(z)
    out = np.zeros(H)
    damp = 0.0
    for h in range(1, H + 1):
        damp += phi ** h
        out[h - 1] = lvl + damp * b + (S[(n + h - 1) % m] if seasonal else 0.0)
    return out


def _hw_fit(z, m, trend_mode: str, seasonal: bool):
    best = None
    trend = trend_mode != "none"
    phi = 0.9 if trend_mode == "damped" else 1.0
    zz = z[-min(len(z), 30 * max(m, 1) + 200):]
    for a in (0.05, 0.15, 0.3, 0.5, 0.8):
        for b in ((0.0,) if not trend else (0.01, 0.05, 0.2)):
            for g in ((0.0,) if not seasonal else (0.05, 0.15, 0.4)):
                f = _hw_filter(zz, m if seasonal else 1, a, b, g, phi, trend)[0]
                err = float(np.mean((f[:-1] - zz[1:])[len(zz) // 5:] ** 2))
                if best is None or err < best[0]:
                    best = (err, {"alpha": a, "beta": b, "gamma": g, "phi": phi, "trend": trend})
    return best[1]


REGRESSOR_KINDS = {"fc_linear": "linear", "fc_random_forest": "random_forest", "fc_gbm": "gbm", "fc_gru": "gru",
                   "fc_naive": "naive", "fc_seasonal_naive": "seasonal_naive", "fc_moving_average": "moving_average",
                   "fc_holt_winters": "holt_winters"}


def _train_rows(f: Forecaster, which="train_pos"):
    X, Y = [], []
    for i, s in enumerate(f.index.series):
        pos = s[which][s[which] >= f.need] if len(s[which]) else s[which]
        if not len(pos):
            continue
        X.append(f.rows(s, i, s["z"], pos))
        Y.append(target_of(s["z"], pos, f.cfg))
    if not X:
        return np.zeros((0, 0), np.float32), np.zeros(0)
    return np.vstack(X), np.concatenate(Y)


def fit_forecast(model_id, params, prepared, emit, cancel, key, seed=42) -> Forecaster:
    from .registry import defaults
    p = {**defaults(model_id), **(params or {})}
    kind = REGRESSOR_KINDS[model_id]
    idx: ForecastIndex = prepared.preprocessor
    f = Forecaster(model_id, kind, idx, p)
    emit("iteration", {"key": key, "i": 0, "n": 0})
    if kind == "holt_winters":
        for i, s in enumerate(idx.series):
            end = s["n_train"] + s["n_val"] if prepared.payload.get("split") == "time" else s["n"]
            seasonal = p.get("seasonal", "additive") == "additive" and idx.season > 1 and end >= 2 * idx.season
            f.hw[i] = {"seasonal": seasonal, "coef": _hw_fit(s["z"][:s["n_train"]] if prepared.payload.get("split") == "time" else s["z"],
                                                            idx.season, p.get("trend", "damped"), seasonal)}
    elif kind in ("linear", "random_forest", "gbm"):
        X, y = _train_rows(f)
        if kind == "linear":
            from sklearn.linear_model import Ridge
            f.est = Ridge(alpha=float(p.get("alpha", 1.0))).fit(X, y)
        elif kind == "random_forest":
            from sklearn.ensemble import RandomForestRegressor
            f.est = RandomForestRegressor(n_estimators=int(p["n_estimators"]), max_depth=int(p["max_depth"]) or None,
                                          min_samples_leaf=int(p["min_samples_leaf"]), n_jobs=-1, random_state=seed).fit(X, y)
        else:
            from sklearn.ensemble import HistGradientBoostingRegressor
            f.est = HistGradientBoostingRegressor(learning_rate=float(p["learning_rate"]), max_iter=int(p["max_iter"]),
                                                  max_depth=int(p["max_depth"]) or None, random_state=seed).fit(X, y)
    elif kind == "gru":
        gru_fit(f, p, emit, cancel, key, seed)
    _residual_sd(f, prepared)
    return f


def _residual_sd(f: Forecaster, prepared):
    """Spread of one-step errors (original units) on validation — or training — rows: the basis of the forecast band."""
    idx = f.index
    for i, s in enumerate(idx.series):
        pos = s["val_pos"] if len(s["val_pos"]) >= 5 else s["train_pos"][-max(5, 3 * idx.horizon):]
        pos = pos[pos >= f.need]
        if not len(pos):
            f.resid_sd[i] = float(np.std(s["y"]) or 1.0)
            continue
        yhat = idx.from_z(s, f.step(s, i, s["z"], pos))
        f.resid_sd[i] = float(np.sqrt(np.mean((yhat - s["y"][pos]) ** 2)) or 1e-9)


# ----------------------------------------------------------------------------- GRU (torch, lazily imported)
def _gru_module(n_static, hidden, layers, dropout):
    import torch
    from torch import nn

    class Net(nn.Module):
        def __init__(self):
            super().__init__()
            self.gru = nn.GRU(1, hidden, num_layers=layers, batch_first=True, dropout=dropout if layers > 1 else 0.0)
            self.head = nn.Sequential(nn.Linear(hidden + n_static, hidden), nn.ReLU(), nn.Dropout(dropout), nn.Linear(hidden, 1))

        def forward(self, x, w):
            seq, static = x[:, :w].unsqueeze(-1), x[:, w:]
            _, h = self.gru(seq)
            return self.head(torch.cat([h[-1], static], 1)).squeeze(-1)

    return Net()


def gru_fit(f: Forecaster, p: dict, emit, cancel, key, seed):
    import torch
    from .train_classic import Cancelled
    torch.manual_seed(seed)
    X, y = _train_rows(f)
    Xv, yv = _train_rows(f, "val_pos")
    if not len(Xv):
        cut = int(len(X) * 0.85)
        X, Xv, y, yv = X[:cut], X[cut:], y[:cut], y[cut:]
    w = f.seq
    hidden, layers, dropout = int(p.get("hidden", 32)), int(p.get("layers", 1)), float(p.get("dropout", 0.1))
    net = _gru_module(X.shape[1] - w, hidden, layers, dropout)
    opt = torch.optim.Adam(net.parameters(), lr=float(p.get("learning_rate", 0.003)))
    Xt, yt, Xvt, yvt = map(lambda a: torch.tensor(a, dtype=torch.float32), (X, y, Xv, yv))
    epochs, patience = int(p.get("epochs", 60)), int(p.get("patience", 10))
    best, best_state, bad, points = 1e18, None, 0, []
    g = torch.Generator().manual_seed(seed)
    t0 = time.time()
    mae = lambda a, b: float(torch.mean(torch.abs(a - b)))  # noqa: E731
    for epoch in range(1, epochs + 1):
        if cancel is not None and cancel.is_set():
            raise Cancelled()
        net.train()
        perm = torch.randperm(len(Xt), generator=g)
        tot = 0.0
        for s_ in range(0, len(Xt), 128):
            b = perm[s_:s_ + 128]
            opt.zero_grad()
            loss = torch.mean((net(Xt[b], w) - yt[b]) ** 2)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step()
            tot += float(loss) * len(b)
        net.eval()
        with torch.no_grad():
            pv = net(Xvt, w)
            ptr = net(Xt[:3000], w)
            val_loss = float(torch.mean((pv - yvt) ** 2))
        pt = {"step": epoch, "train_loss": r(tot / len(Xt)), "val_loss": r(val_loss), "train_score": r(mae(ptr, yt[:3000])),
              "val_score": r(mae(pv, yvt)), "lr": r(opt.param_groups[0]["lr"], 6)}
        points.append(pt)
        emit("epoch", {"key": key, "epoch": epoch, "epochs": epochs, **pt, "secs": r(time.time() - t0, 3)})
        if val_loss < best - 1e-5:
            best, bad = val_loss, 0
            best_state = {k: v.detach().clone() for k, v in net.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                emit("log", {"level": "info", "message": f"GRU: stopped early at epoch {epoch} (no improvement for {patience} epochs)."})
                break
    net.load_state_dict(best_state)
    f.est = {"state": {k: v.numpy() for k, v in best_state.items()}, "n_static": X.shape[1] - w, "hidden": hidden, "layers": layers,
             "dropout": dropout}
    f.curve = {"x_label": "Epoch", "loss": "MSE (scaled)", "points": points}
    f._net = net


def gru_predict(f: Forecaster, X):
    import torch
    net = getattr(f, "_net", None)
    if net is None:
        e = f.est
        net = _gru_module(e["n_static"], e["hidden"], e["layers"], e["dropout"])
        net.load_state_dict({k: torch.tensor(v) for k, v in e["state"].items()})
        f._net = net
    net.eval()
    with torch.no_grad():
        return net(torch.tensor(np.asarray(X, np.float32)), f.seq).numpy().astype(float)


def _forecaster_getstate(self):
    d = dict(self.__dict__)
    d.pop("_net", None)
    return d


Forecaster.__getstate__ = _forecaster_getstate


# ----------------------------------------------------------------------------- evaluation
def _scale(s: dict, m: int, end: int) -> float:
    """MASE denominator: mean absolute error of the seasonal-naive forecast in the history."""
    y = s["y"][:end]
    m = m if len(y) > 2 * m else 1
    d = np.abs(y[m:] - y[:-m])
    return float(d.mean()) if len(d) and d.mean() > 0 else float(np.abs(y).mean() or 1.0)


def point_metrics(y, yhat, scale) -> dict:
    y, yhat = np.asarray(y, float), np.asarray(yhat, float)
    e = yhat - y
    scale = np.asarray(scale, float)
    den = np.abs(y) + np.abs(yhat)
    return {"mae": r(float(np.mean(np.abs(e)))), "rmse": r(float(np.sqrt(np.mean(e ** 2)))),
            "smape": r(float(np.mean(np.where(den > 0, 2 * np.abs(e) / np.where(den > 0, den, 1), 0)))),
            "mase": r(float(np.mean(np.abs(e) / scale))), "bias": r(float(np.mean(e)))}


def _future_inputs(idx: ForecastIndex, s: dict, times: list, ex_future=None):
    cal = calendar(times, idx.freq, idx.is_dt)[0]
    if not idx.exog:
        return cal, np.zeros((len(times), 0))
    ex = np.asarray(ex_future, float) if ex_future is not None else default_future_exog(idx, s, len(times))
    return cal, idx.exog_z(s, ex)


def default_future_exog(idx: ForecastIndex, s: dict, H: int, end: int | None = None) -> np.ndarray:
    """Plausible future values for the extra columns: 0/1 flags off, numbers repeat their last season."""
    ex = s["ex"][: s["n"] if end is None else end]
    out = np.zeros((H, len(idx.exog)))
    for j in range(len(idx.exog)):
        col = ex[:, j]
        if set(np.unique(col)).issubset({0.0, 1.0}):
            continue
        m = idx.season if len(col) >= idx.season > 1 else 1
        last = col[-m:]
        out[:, j] = np.resize(last, H)
    return out


def evaluate_forecast(f: Forecaster, prepared, seed=0) -> dict:
    idx: ForecastIndex = prepared.preprocessor
    split = prepared.payload.get("split", "time")
    H = idx.horizon
    ys, yh, sc, by_h, shown, one_y, one_h = [], [], [], np.zeros(H), [], [], []
    for i, s in enumerate(idx.series):
        origin = s["n_train"] + s["n_val"]
        scale = _scale(s, idx.season, origin if split == "time" else s["n"])
        tp = s["test_pos"][s["test_pos"] >= f.need]
        one = idx.from_z(s, f.step(s, i, s["z"], tp)) if len(tp) else np.zeros(0)
        one_y.append(s["y"][tp])
        one_h.append(one)
        entry = {"series": s["name"], "scale": r(scale)}
        hist_n = min(origin, max(6 * H, 3 * idx.season, 60))
        if split == "time":
            cal_f, exz_f = s["cal"][origin:], s["exz"][origin:]
            zf = f.forecast(s, i, s["z"][:origin], s["n"] - origin, cal_f, exz_f)
            yf = idx.from_z(s, zf)
            actual = s["y"][origin:]
            ys.append(actual)
            yh.append(yf)
            sc.append(np.full(len(actual), scale))
            by_h[: len(actual)] += np.abs(yf - actual) / scale
            band = 1.28 * f.resid_sd.get(i, 0.0) * np.sqrt(np.arange(1, len(yf) + 1))
            times_f = s["times"][origin:]
            entry.update({
                "history": [{"t": fmt_time(s["times"][j], idx.freq, idx.is_dt), "y": r(s["y"][j], 4)} for j in range(origin - hist_n, origin)],
                "actual": [{"t": fmt_time(t, idx.freq, idx.is_dt), "y": r(v, 4)} for t, v in zip(times_f, actual)],
                "forecast": [{"t": fmt_time(t, idx.freq, idx.is_dt), "y": r(v, 4), "lo": r(v - b, 4), "hi": r(v + b, 4)} for t, v, b in zip(times_f, yf, band)],
                "one_step": [{"t": fmt_time(s["times"][p], idx.freq, idx.is_dt), "y": r(v, 4)} for p, v in zip(tp, one)],
            })
        else:
            ys.append(s["y"][tp])
            yh.append(one)
            sc.append(np.full(len(tp), scale))
            n = s["n"]
            fut = future_times(s["times"][-1], idx.freq, H, idx.is_dt)
            cal_f, exz_f = _future_inputs(idx, s, fut)
            yf = idx.from_z(s, f.forecast(s, i, s["z"], H, cal_f, exz_f))
            band = 1.28 * f.resid_sd.get(i, 0.0) * np.sqrt(np.arange(1, H + 1))
            step = max(1, int(np.ceil(n / 400)))
            entry.update({
                "history": [{"t": fmt_time(s["times"][j], idx.freq, idx.is_dt), "y": r(s["y"][j], 4)} for j in range(0, n, step)],
                "actual": [],
                "forecast": [{"t": fmt_time(t, idx.freq, idx.is_dt), "y": r(v, 4), "lo": r(v - b, 4), "hi": r(v + b, 4)} for t, v, b in zip(fut, yf, band)],
                "one_step": [{"t": fmt_time(s["times"][p], idx.freq, idx.is_dt), "y": r(v, 4), "actual": r(s["y"][p], 4)} for p, v in zip(tp, one)],
            })
        if len(shown) < 6:
            shown.append(entry)
    test = point_metrics(np.concatenate(ys), np.concatenate(yh), np.concatenate(sc)) if ys and len(np.concatenate(ys)) else {}
    if one_y and len(np.concatenate(one_y)):
        oy, oh = np.concatenate(one_y), np.concatenate(one_h)
        test["one_step_mae"] = r(float(np.mean(np.abs(oy - oh))))
    test["horizon"] = H
    # train / validation: one step ahead with true lags
    tr_y, tr_h, tr_s, va_y, va_h, va_s = [], [], [], [], [], []
    for i, s in enumerate(idx.series):
        scale = _scale(s, idx.season, s["n_train"])
        p = s["train_pos"][s["train_pos"] >= f.need][-3000:]
        if len(p):
            tr_y.append(s["y"][p])
            tr_h.append(idx.from_z(s, f.step(s, i, s["z"], p)))
            tr_s.append(np.full(len(p), scale))
        pv = s["val_pos"][s["val_pos"] >= f.need]
        if len(pv):
            va_y.append(s["y"][pv])
            va_h.append(idx.from_z(s, f.step(s, i, s["z"], pv)))
            va_s.append(np.full(len(pv), scale))
    train = point_metrics(np.concatenate(tr_y), np.concatenate(tr_h), np.concatenate(tr_s)) if tr_y else {}
    val = point_metrics(np.concatenate(va_y), np.concatenate(va_h), np.concatenate(va_s)) if va_y else {}
    out: dict = {"metrics": {"test": test, "train": train, "val": val}}
    out["forecast"] = {
        "split": split, "horizon": H, "unit": FREQ_UNIT[idx.freq], "season": idx.season, "series": shown,
        "mase_by_step": [r(v / max(1, len(idx.series)), 4) for v in by_h] if split == "time" else [],
        "importance": _importance(f), "kind": f.kind, "value_name": idx.cols["value"],
    }
    if f.curve:
        out["curve"] = f.curve
    return out


def _importance(f: Forecaster) -> list[dict]:
    if f.kind not in ("linear", "random_forest", "gbm"):
        return []
    names = feature_names(f.cfg, f.index.cal_names, f.index.exog, f.index.names)
    if f.kind == "linear":
        imp = np.abs(np.asarray(f.est.coef_, float))
    elif f.kind == "random_forest":
        imp = np.asarray(f.est.feature_importances_, float)
    else:
        try:
            from sklearn.inspection import permutation_importance
            X, y = _train_rows(f)
            sub = np.random.default_rng(0).choice(len(X), min(len(X), 1500), replace=False)
            imp = np.clip(permutation_importance(f.est, X[sub], y[sub], n_repeats=3, random_state=0).importances_mean, 0, None)
        except Exception:  # noqa: BLE001
            return []
    if imp.sum() <= 0:
        return []
    imp = imp / imp.sum()
    order = np.argsort(-imp)[:20]
    return [{"feature": names[j], "importance": r(imp[j], 4)} for j in order if j < len(names)]


# ----------------------------------------------------------------------------- playground / lessons
def forecast_from_end(f: Forecaster, series: str | None, H: int, exog_future: dict | None = None) -> dict:
    idx = f.index
    i = idx.names.index(series) if series in idx.names else 0
    s = idx.series[i]
    H = int(max(1, min(H, 4 * idx.horizon, 500)))
    fut = future_times(s["times"][-1], idx.freq, H, idx.is_dt)
    ex = default_future_exog(idx, s, H)
    for j, name in enumerate(idx.exog):
        vals = (exog_future or {}).get(name)
        if vals is not None:
            v = np.asarray(vals, float)[:H]
            ex[: len(v), j] = v
    cal, exz = _future_inputs(idx, s, fut, ex)
    yf = idx.from_z(s, f.forecast(s, i, s["z"], H, cal, exz))
    band = 1.28 * f.resid_sd.get(i, 0.0) * np.sqrt(np.arange(1, H + 1))
    hist_n = min(s["n"], max(4 * H, 3 * idx.season, 90))
    return {"series": s["name"], "series_names": idx.names, "freq": idx.freq, "unit": FREQ_UNIT[idx.freq], "season": idx.season,
            "horizon": idx.horizon, "value_name": idx.cols["value"],
            "history": [{"t": fmt_time(s["times"][j], idx.freq, idx.is_dt), "y": r(s["y"][j], 4)} for j in range(s["n"] - hist_n, s["n"])],
            "forecast": [{"t": fmt_time(t, idx.freq, idx.is_dt), "y": r(v, 4), "lo": r(v - b, 4), "hi": r(v + b, 4)} for t, v, b in zip(fut, yf, band)],
            "exog": [{"name": n, "binary": bool(set(np.unique(s["ex"][:, j])).issubset({0.0, 1.0})), "values": [r(v, 4) for v in ex[:, j]],
                      "recent": [r(v, 4) for v in s["ex"][-hist_n:, j]]} for j, n in enumerate(idx.exog)]}


def lesson_eval(f: Forecaster, hidden: pd.DataFrame) -> dict:
    """Forecast past the end of the learner's data and score against what really happened next."""
    idx = f.index
    cols = idx.cols
    ys, yh, sc = [], [], []
    for i, s in enumerate(idx.series):
        h = hidden[hidden[cols["series"]].astype(str) == s["name"]] if cols.get("series") and cols["series"] in hidden.columns else hidden
        if not len(h):
            continue
        t, _ = parse_times(h[cols["time"]])
        h = h.assign(__t=t).sort_values("__t")
        H = len(h)
        fut = list(h["__t"])
        ex = h[idx.exog].to_numpy(float) if idx.exog else None
        cal, exz = _future_inputs(idx, s, fut, ex)
        yf = idx.from_z(s, f.forecast(s, i, s["z"], H, cal, exz))
        ys.append(h[cols["value"]].to_numpy(float))
        yh.append(yf)
        sc.append(np.full(H, _scale(s, idx.season, s["n"])))
    if not ys:
        raise ValueError("No overlap between the hidden future and the model's series.")
    out = point_metrics(np.concatenate(ys), np.concatenate(yh), np.concatenate(sc))
    out["n"] = int(len(np.concatenate(ys)))
    return out
