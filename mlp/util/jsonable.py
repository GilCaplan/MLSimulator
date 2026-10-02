"""Convert numpy / pandas values into strict JSON-safe Python (NaN/inf -> None)."""
from __future__ import annotations

import datetime
import math

import numpy as np
import pandas as pd


def jsonable(o):
    if o is None or isinstance(o, (str, bool)):
        return o
    if isinstance(o, dict):
        return {str(k): jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set)):
        return [jsonable(v) for v in o]
    if isinstance(o, np.ndarray):
        return jsonable(o.tolist())
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, (int, np.integer)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        f = float(o)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(o, (pd.Timestamp, datetime.datetime, datetime.date)):
        return o.isoformat()
    if o is pd.NA or o is pd.NaT:
        return None
    if isinstance(o, pd.Series):
        return jsonable(o.tolist())
    return str(o)


def r(x, nd=4):
    """Round floats for compact payloads."""
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, nd)
