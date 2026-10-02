"""On-disk stores for projects, datasets and prepared (preprocessed) data."""
from __future__ import annotations

import json
import pickle
import secrets
import shutil
import threading
import time
from collections import OrderedDict
from pathlib import Path

import pandas as pd

from ..config import DATA_DIR
from ..util.jsonable import jsonable


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def now() -> float:
    return time.time()


class _LRU:
    def __init__(self, size: int):
        self.size = size
        self.d: OrderedDict = OrderedDict()

    def get(self, k):
        if k in self.d:
            self.d.move_to_end(k)
            return self.d[k]
        return None

    def put(self, k, v):
        self.d[k] = v
        self.d.move_to_end(k)
        while len(self.d) > self.size:
            self.d.popitem(last=False)

    def pop(self, k):
        self.d.pop(k, None)


class DatasetStore:
    root = DATA_DIR / "datasets"

    def __init__(self):
        self.lock = threading.RLock()
        self.cache = _LRU(8)

    def put(self, df: pd.DataFrame, meta: dict, images=None) -> str:
        with self.lock:
            did = new_id("d")
            d = self.root / did
            d.mkdir(parents=True)
            df = df.reset_index(drop=True)
            df.to_pickle(d / "frame.pkl")
            if images is not None:
                import numpy as np
                np.save(d / "images.npy", np.ascontiguousarray(images, dtype=np.uint8))
                meta = {**meta, "modality": "image", "image_shape": [int(images.shape[3]), int(images.shape[1]), int(images.shape[2])],
                        "n_images": int(len(images))}
            meta = {**meta, "id": did, "n_rows": int(len(df)), "n_cols": int(df.shape[1]), "created_at": now()}
            (d / "meta.json").write_text(json.dumps(jsonable(meta)))
            self.cache.put(did, df)
            return did

    def get(self, did: str) -> pd.DataFrame:
        with self.lock:
            df = self.cache.get(did)
            if df is None:
                p = self.root / did / "frame.pkl"
                if not p.exists():
                    raise KeyError(did)
                df = pd.read_pickle(p)
                self.cache.put(did, df)
            return df

    def images(self, did: str):
        import numpy as np
        p = self.root / did / "images.npy"
        if not p.exists():
            raise KeyError(did)
        return np.load(p, mmap_mode="r")

    def meta(self, did: str) -> dict:
        p = self.root / did / "meta.json"
        if not p.exists():
            raise KeyError(did)
        return json.loads(p.read_text())

    def list(self) -> list[dict]:
        out = []
        for d in self.root.iterdir():
            if (d / "meta.json").exists():
                try:
                    out.append(json.loads((d / "meta.json").read_text()))
                except json.JSONDecodeError:
                    pass
        return sorted(out, key=lambda m: m.get("created_at", 0), reverse=True)

    def delete(self, did: str):
        with self.lock:
            self.cache.pop(did)
            shutil.rmtree(self.root / did, ignore_errors=True)


class ProjectStore:
    root = DATA_DIR / "projects"

    def __init__(self):
        self.lock = threading.RLock()

    def _p(self, pid: str) -> Path:
        return self.root / f"{pid}.json"

    def create(self, doc: dict) -> dict:
        pid = new_id("p")
        doc = {"name": "Untitled project", "task": None, "modality": "tabular", "step": "problem", "models": [], "history": [],
               **doc, "id": pid, "created_at": now(), "updated_at": now()}
        self.save(doc)
        return doc

    def save(self, doc: dict) -> dict:
        with self.lock:
            doc = {**doc, "updated_at": now()}
            tmp = self._p(doc["id"]).with_suffix(".tmp")
            tmp.write_text(json.dumps(jsonable(doc)))
            tmp.replace(self._p(doc["id"]))
            return doc

    def get(self, pid: str) -> dict:
        p = self._p(pid)
        if not p.exists():
            raise KeyError(pid)
        return json.loads(p.read_text())

    def list(self) -> list[dict]:
        out = []
        for p in self.root.glob("*.json"):
            try:
                out.append(json.loads(p.read_text()))
            except json.JSONDecodeError:
                pass
        return sorted(out, key=lambda d: d.get("updated_at", 0), reverse=True)

    def delete(self, pid: str):
        self._p(pid).unlink(missing_ok=True)


class PreparedStore:
    root = DATA_DIR / "prepared"

    def __init__(self):
        self.lock = threading.RLock()
        self.cache = _LRU(6)

    def put(self, prepared) -> str:
        with self.lock:
            with open(self.root / f"{prepared.id}.pkl", "wb") as f:
                pickle.dump(prepared, f, protocol=pickle.HIGHEST_PROTOCOL)
            self.cache.put(prepared.id, prepared)
            return prepared.id

    def get(self, pid: str):
        with self.lock:
            v = self.cache.get(pid)
            if v is None:
                p = self.root / f"{pid}.pkl"
                if not p.exists():
                    raise KeyError(pid)
                with open(p, "rb") as f:
                    v = pickle.load(f)
                self.cache.put(pid, v)
            return v


datasets = DatasetStore()
projects = ProjectStore()
prepared_store = PreparedStore()
