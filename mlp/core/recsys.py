"""Recommendation systems on user–item–rating data (numpy/sklearn only).

Split: for every user with enough ratings, their most recent `test_k` interactions are held out (leave-last-out).
Ranking metrics count held-out items rated ≥ the positive threshold that appear in the top-k recommendations,
excluding items the user already rated in training.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd

from ..util.jsonable import r

GENRES = ["Action", "Comedy", "Drama", "Sci-Fi", "Romance", "Horror", "Documentary", "Animation"]
_ADJ = ["Silent", "Last", "Red", "Hidden", "Electric", "Lost", "Golden", "Broken", "Midnight", "Wild", "Paper", "Iron", "Blue", "Quiet"]
_NOUN = ["Harbor", "Signal", "Garden", "Empire", "Echo", "River", "Machine", "Promise", "Planet", "Mirror", "Kingdom", "Storm", "Letter", "Road"]


# ----------------------------------------------------------------------------- synthetic ratings
def gen_movies(n_users=800, n_items=400, seed=42, popularity_skew=1.1, min_r=15, max_r=70):
    rng = np.random.default_rng(seed)
    k = len(GENRES)
    item_genre = rng.integers(0, k, n_items)
    item_quality = rng.normal(0, 0.5, n_items)
    pop = (np.arange(1, n_items + 1) ** -popularity_skew)[rng.permutation(n_items)]
    taste = rng.dirichlet(np.ones(k) * 0.6, n_users)
    titles = [f"The {rng.choice(_ADJ)} {rng.choice(_NOUN)}" + (f" {rng.integers(2, 4)}" if rng.random() < 0.08 else "") for _ in range(n_items)]
    rows = []
    for u in range(n_users):
        n = int(rng.integers(min_r, max_r))
        aff = taste[u][item_genre]
        w = pop * (0.15 + aff * 3)
        items = rng.choice(n_items, min(n, n_items), replace=False, p=w / w.sum())
        t0 = rng.integers(0, 300)
        for j, i in enumerate(items):
            score = 3.0 + 2.4 * (aff[i] - 1 / k) * k / 2 + item_quality[i] + rng.normal(0, 0.6)
            rows.append({"user": f"u{u:04d}", "item": f"m{i:04d}", "rating": int(np.clip(round(score), 1, 5)), "day": int(t0 + j * rng.integers(1, 6))})
    ratings = pd.DataFrame(rows)
    items = pd.DataFrame({"item": [f"m{i:04d}" for i in range(n_items)], "title": titles, "genre": np.asarray(GENRES)[item_genre]})
    return ratings, items


RATINGS_SETS = {"movies": {"label": "Movie ratings", "emoji": "🎬", "blurb": "800 viewers rating 400 films 1–5 stars, with genres, blockbusters and a long tail of niche titles.",
                           "params": {"n_users": 800, "n_items": 400}}}


def generate(name="movies", params=None, seed=42):
    p = {**RATINGS_SETS[name]["params"], **(params or {})}
    ratings, items = gen_movies(int(p["n_users"]), int(p["n_items"]), seed=seed)
    return ratings, items, {"name": RATINGS_SETS[name]["label"], "source": "ratings_set", "modality": "ratings",
                            "columns": {"user": "user", "item": "item", "rating": "rating", "time": "day"}, "task_hint": "recommendation"}


# ----------------------------------------------------------------------------- preparation
class RatingsIndex:
    """Maps raw user/item ids ↔ matrix indices; carries item metadata. Duck-types the preprocessor slot."""

    def __init__(self, users, items, item_meta=None, positive=4.0):
        self.users, self.items = list(users), list(items)
        self.u_index = {u: i for i, u in enumerate(self.users)}
        self.i_index = {it: i for i, it in enumerate(self.items)}
        self.item_meta = item_meta or {}
        self.positive = float(positive)
        self.task, self.modality, self.target, self.classes = "recommendation", "ratings", "rating", None
        self.input_schema: list = []
        self.feature_names_out: list = []
        self.fe_steps: list = []

    def transform(self, x):
        return x

    def decode_y(self, y):
        return y


def prepare_ratings(df: pd.DataFrame, spec: dict, dataset_id: str, item_df: pd.DataFrame | None = None):
    from .pipeline import Prepared
    from .store import new_id
    cols = {"user": "user", "item": "item", "rating": "rating", "time": None, **(spec.get("columns") or {})}
    rc = {"min_user": 5, "min_item": 2, "positive": 4, "test_k": 3, "split": "leave_last_out", **(spec.get("recsys") or {})}
    for k in ("user", "item", "rating"):
        if cols[k] not in df.columns:
            raise ValueError(f"Choose the {k} column.")
    d = df[[cols["user"], cols["item"], cols["rating"]] + ([cols["time"]] if cols.get("time") in df.columns else [])].dropna().copy()
    d.columns = ["user", "item", "rating"] + (["time"] if cols.get("time") in df.columns else [])
    d["rating"] = pd.to_numeric(d["rating"], errors="coerce")
    d = d.dropna(subset=["rating"]).drop_duplicates(["user", "item"], keep="last")
    n0 = len(d)
    for _ in range(3):  # iterative filtering
        uc, ic = d["user"].value_counts(), d["item"].value_counts()
        d = d[d["user"].isin(uc[uc >= int(rc["min_user"])].index) & d["item"].isin(ic[ic >= int(rc["min_item"])].index)]
    if d["user"].nunique() < 10 or d["item"].nunique() < 10:
        raise ValueError("Too few users or items left after filtering — lower the minimum interaction counts.")
    users, items = sorted(d["user"].astype(str).unique()), sorted(d["item"].astype(str).unique())
    meta = {}
    if item_df is not None and "item" in item_df.columns:
        for _, row in item_df.iterrows():
            meta[str(row["item"])] = {k: (str(v) if not isinstance(v, (int, float)) else v) for k, v in row.items() if k != "item"}
    idx = RatingsIndex(users, items, meta, rc["positive"])
    d["u"] = d["user"].astype(str).map(idx.u_index)
    d["i"] = d["item"].astype(str).map(idx.i_index)
    rng = np.random.default_rng(int((spec.get("split") or {}).get("seed", 42)))
    test_k = int(rc["test_k"])
    is_test = np.zeros(len(d), bool)
    order_col = "time" if "time" in d.columns and rc["split"] == "leave_last_out" else None
    d = d.reset_index(drop=True)
    for u, g in d.groupby("u"):
        if len(g) <= test_k + 2:
            continue
        sel = g.sort_values(order_col).index[-test_k:] if order_col else rng.choice(g.index, test_k, replace=False)
        is_test[sel] = True
    tr, te = d[~is_test], d[is_test]
    triplets = lambda x: np.c_[x["u"].to_numpy(), x["i"].to_numpy(), x["rating"].to_numpy()].astype(np.float32)  # noqa: E731
    counts = tr["i"].value_counts().reindex(range(len(items)), fill_value=0).to_numpy()
    report = {
        "modality": "ratings", "task": "recommendation", "classes": None,
        "splits": {"train": int(len(tr)), "train_before_resample": int(len(tr)), "val": 0, "test": int(len(te))},
        "n_users": len(users), "n_items": len(items), "removed": int(n0 - len(d)),
        "sparsity": r(1 - len(d) / (len(users) * len(items)), 4),
        "rating_hist": {"labels": [str(v) for v in sorted(d["rating"].unique())], "counts": d["rating"].value_counts().sort_index().tolist()},
        "per_user_hist": np.histogram(tr["u"].value_counts(), bins=20)[0].tolist(),
        "long_tail": [int(c) for c in np.sort(counts)[::-1]],
        "positive": rc["positive"], "test_k": test_k, "warnings": [], "before_points": [], "after_points": [],
        "feature_names_out": [], "n_features": 0, "image_shape": None, "split_info": {"method": rc["split"]},
        "class_counts_before": None, "class_counts_after": None, "class_counts_test": None, "added": 0, "outliers_removed": 0,
        "numeric_columns": [], "categorical_columns": [], "duplicates_found": 0, "features_created": [],
    }
    z = np.zeros((0, 0), np.float32)
    p = Prepared(id=new_id("pr"), task="recommendation", target="rating", dataset_id=dataset_id, spec=spec, preprocessor=idx,
                 X_train=z, y_train=np.zeros(0), X_val=z, y_val=np.zeros(0), X_test=z, y_test=np.zeros(0), feature_names=[],
                 classes=None, report=report, modality="ratings",
                 payload={"train": triplets(tr), "test": triplets(te), "n_users": len(users), "n_items": len(items), "positive": float(rc["positive"])})
    report["prepared_id"] = p.id
    return p


# ----------------------------------------------------------------------------- models
class Recommender:
    """Common interface: score(u_idx) → item scores; predict(u, i) → rating; for_new(ratings) → scores."""

    def __init__(self, model_id, n_users, n_items, train, index: RatingsIndex):
        self.model_id, self.n_users, self.n_items, self.index = model_id, n_users, n_items, index
        self.R = np.zeros((n_users, n_items), np.float32)
        self.M = np.zeros((n_users, n_items), bool)
        u, i, v = train[:, 0].astype(int), train[:, 1].astype(int), train[:, 2]
        self.R[u, i], self.M[u, i] = v, True
        self.mu = float(v.mean()) if len(v) else 3.0
        cnt = self.M.sum(0)
        self.item_mean = np.where(cnt > 0, (self.R.sum(0) + 5 * self.mu) / (cnt + 5), self.mu)
        pos = (self.R >= index.positive) & self.M
        self.popularity = pos.sum(0).astype(float)
        self.fallback = None  # cold-start fallback model id

    def user_scores(self, u: int) -> np.ndarray:
        return self.popularity

    def scores_for_ratings(self, rated: dict[int, float]) -> np.ndarray:
        return self.popularity

    def predict_rating(self, u, i):
        return self.item_mean[i]

    def recommend(self, u: int | None = None, k: int = 10, rated: dict[int, float] | None = None, exclude=None):
        if u is not None:
            s = self.user_scores(u).astype(float).copy()
            seen = self.M[u]
            n_known = int(seen.sum())
        else:
            s = self.scores_for_ratings(rated or {}).astype(float).copy()
            seen = np.zeros(self.n_items, bool)
            for i in (rated or {}):
                seen[i] = True
            n_known = len(rated or {})
        if self.fallback == "popularity" and n_known < getattr(self, "fallback_min", 5):
            s = self.popularity.astype(float).copy()
        s[seen] = -np.inf
        if exclude is not None:
            s[exclude] = -np.inf
        top = np.argsort(-s)[:k]
        return top, s[top]


class Popularity(Recommender):
    pass


class ItemKNN(Recommender):
    def fit(self, k_neighbors=30, shrink=10):
        C = np.where(self.M, self.R - self.R.sum(1, keepdims=True) / np.maximum(self.M.sum(1, keepdims=True), 1), 0)
        norms = np.sqrt((C ** 2).sum(0)) + 1e-9
        co = self.M.astype(np.float32).T @ self.M.astype(np.float32)
        S = (C.T @ C) / np.outer(norms, norms) * (co / (co + shrink))
        np.fill_diagonal(S, 0)
        if k_neighbors < self.n_items:
            thr = -np.sort(-S, axis=1)[:, k_neighbors - 1: k_neighbors]
            S = np.where(S >= thr, S, 0)
        self.S = S.astype(np.float32)
        return self

    def scores_for_ratings(self, rated):
        if not rated:
            return self.popularity
        idx = np.array(list(rated))
        vals = np.array([rated[i] for i in idx]) - np.mean(list(rated.values()))
        vals = np.where(vals == 0, 0.5, vals)  # all-equal ratings still signal interest
        return self.S[:, idx] @ vals + 1e-3 * self.popularity / (self.popularity.max() + 1e-9)

    def user_scores(self, u):
        idx = np.where(self.M[u])[0]
        return self.scores_for_ratings({int(i): float(self.R[u, i]) for i in idx})

    def because(self, rated: dict[int, float], item: int) -> int | None:
        if not rated:
            return None
        idx = list(rated)
        contrib = self.S[item, idx] * (np.array([rated[i] for i in idx]) - 2.5)
        return int(idx[int(np.argmax(contrib))]) if contrib.max() > 0 else None

    def predict_rating(self, u, i):
        idx = np.where(self.M[u])[0]
        w = self.S[i, idx]
        if np.abs(w).sum() < 1e-6:
            return self.item_mean[i]
        return float(self.item_mean[i] + (w @ (self.R[u, idx] - self.item_mean[idx])) / (np.abs(w).sum() + 1e-9))


class UserKNN(Recommender):
    def fit(self, k_neighbors=40):
        C = np.where(self.M, self.R - self.R.sum(1, keepdims=True) / np.maximum(self.M.sum(1, keepdims=True), 1), 0)
        n = np.sqrt((C ** 2).sum(1)) + 1e-9
        self.C, self.cn = C, n
        self.k = int(k_neighbors)
        return self

    def _neighbors(self, vec, vnorm, exclude_self=None):
        sims = (self.C @ vec) / (self.cn * vnorm + 1e-9)
        if exclude_self is not None:
            sims[exclude_self] = -1
        nb = np.argsort(-sims)[: self.k]
        return nb, sims[nb]

    def user_scores(self, u):
        nb, w = self._neighbors(self.C[u], self.cn[u], u)
        w = np.clip(w, 0, None)
        return (w[:, None] * self.C[nb]).sum(0) + 1e-3 * self.popularity / (self.popularity.max() + 1e-9)

    def scores_for_ratings(self, rated):
        if not rated:
            return self.popularity
        vec = np.zeros(self.n_items, np.float32)
        m = np.mean(list(rated.values()))
        for i, v in rated.items():
            vec[i] = (v - m) if v != m else 0.5
        nb, w = self._neighbors(vec, np.sqrt((vec ** 2).sum()) + 1e-9)
        return (np.clip(w, 0, None)[:, None] * self.C[nb]).sum(0)


class MatrixFactorization(Recommender):
    """Biased matrix factorisation fitted with alternating least squares (explicit ratings)."""

    def fit(self, factors=16, reg=0.1, iterations=12, emit=None, key=None, cancel=None, test=None):
        rng = np.random.default_rng(0)
        k = int(factors)
        self.P = rng.normal(0, 0.1, (self.n_users, k)).astype(np.float32)
        self.Q = rng.normal(0, 0.1, (self.n_items, k)).astype(np.float32)
        self.bu = np.zeros(self.n_users, np.float32)
        self.bi = np.zeros(self.n_items, np.float32)
        lam = float(reg) * 10
        I = np.eye(k + 1, dtype=np.float32) * lam
        self.curve = []
        for it in range(int(iterations)):
            if cancel is not None and cancel.is_set():
                from .train_classic import Cancelled
                raise Cancelled()
            # users: solve for [p_u, b_u] given items
            Qa = np.c_[self.Q, np.ones(self.n_items, np.float32)]
            for u in range(self.n_users):
                m = self.M[u]
                if not m.any():
                    continue
                A = Qa[m]
                y = self.R[u, m] - self.mu - self.bi[m]
                sol = np.linalg.solve(A.T @ A + I, A.T @ y)
                self.P[u], self.bu[u] = sol[:k], sol[k]
            Pa = np.c_[self.P, np.ones(self.n_users, np.float32)]
            for i in range(self.n_items):
                m = self.M[:, i]
                if not m.any():
                    continue
                A = Pa[m]
                y = self.R[m, i] - self.mu - self.bu[m]
                sol = np.linalg.solve(A.T @ A + I, A.T @ y)
                self.Q[i], self.bi[i] = sol[:k], sol[k]
            tr = self._rmse(np.argwhere(self.M), self.R[self.M])
            te = self._rmse(test[:, :2].astype(int), test[:, 2]) if test is not None and len(test) else None
            pt = {"step": it + 1, "train_loss": r(tr), "val_loss": r(te) if te is not None else None}
            self.curve.append(pt)
            if emit:
                emit("iteration", {"key": key, "i": it + 1, "n": int(iterations), "train_loss": tr, **({"val_loss": te} if te is not None else {})})
            time.sleep(0.02)
        return self

    def _rmse(self, ui, y):
        if len(ui) == 0:
            return 0.0
        p = self.mu + self.bu[ui[:, 0]] + self.bi[ui[:, 1]] + (self.P[ui[:, 0]] * self.Q[ui[:, 1]]).sum(1)
        return float(np.sqrt(np.mean((np.clip(p, 1, 5) - y) ** 2)))

    def user_scores(self, u):
        return self.mu + self.bu[u] + self.bi + self.Q @ self.P[u]

    def predict_rating(self, u, i):
        return float(np.clip(self.mu + self.bu[u] + self.bi[i] + self.P[u] @ self.Q[i], 1, 5))

    def scores_for_ratings(self, rated):
        """Fold in a new user by solving their factors from the few items they rated."""
        if not rated:
            return self.mu + self.bi
        idx = np.array(list(rated))
        A = np.c_[self.Q[idx], np.ones(len(idx))]
        y = np.array([rated[i] for i in idx]) - self.mu - self.bi[idx]
        k = self.Q.shape[1]
        sol = np.linalg.solve(A.T @ A + np.eye(k + 1) * 1.0, A.T @ y)
        return self.mu + sol[k] + self.bi + self.Q @ sol[:k]


class SVDRec(MatrixFactorization):
    def fit(self, factors=16, **_):
        from sklearn.decomposition import TruncatedSVD
        C = np.where(self.M, self.R - self.item_mean, 0)
        svd = TruncatedSVD(n_components=min(int(factors), min(C.shape) - 1), random_state=0).fit(C)
        self.Q = svd.components_.T.astype(np.float32)
        self.P = (C @ self.Q).astype(np.float32)
        self.bu = np.zeros(self.n_users, np.float32)
        self.bi = (self.item_mean - self.mu).astype(np.float32)
        self.curve = []
        return self


def fit_recsys(model_id, params, prepared, emit, cancel, key, seed=42):
    from .registry import defaults
    p = {**defaults(model_id), **(params or {})}
    pl = prepared.payload
    cls = {"popularity": Popularity, "item_knn": ItemKNN, "user_knn": UserKNN, "svd": SVDRec, "mf_als": MatrixFactorization}[model_id]
    m = cls(model_id, pl["n_users"], pl["n_items"], pl["train"], prepared.preprocessor)
    emit("iteration", {"key": key, "i": 0, "n": 0})
    if model_id == "item_knn":
        m.fit(int(p["k_neighbors"]), float(p["shrink"]))
    elif model_id == "user_knn":
        m.fit(int(p["k_neighbors"]))
    elif model_id == "svd":
        m.fit(int(p["factors"]))
    elif model_id == "mf_als":
        m.fit(int(p["factors"]), float(p["reg"]), int(p["iterations"]), emit, key, cancel, pl["test"])
    if p.get("cold_start") == "popularity":
        m.fallback, m.fallback_min = "popularity", int(p.get("cold_start_min", 5))
    return m


# ----------------------------------------------------------------------------- evaluation
def rank_metrics(model: Recommender, test: np.ndarray, positive: float, k=10, users=None, rated_override=None) -> dict:
    by_user: dict[int, list] = {}
    for u, i, v in test:
        by_user.setdefault(int(u), []).append((int(i), float(v)))
    prec, rec, ndcg, hit = [], [], [], []
    recommended = set()
    pop_pct = []
    order = np.argsort(np.argsort(-model.popularity)) / max(1, model.n_items - 1)  # 0 = most popular
    for u, rows in by_user.items():
        pos = {i for i, v in rows if v >= positive}
        if not pos:
            continue
        if rated_override is not None:
            top, _ = model.recommend(None, k, rated=rated_override[u])
        else:
            top, _ = model.recommend(u, k)
        recommended.update(int(t) for t in top)
        hits = [1 if t in pos else 0 for t in top]
        prec.append(sum(hits) / k)
        rec.append(sum(hits) / len(pos))
        dcg = sum(h / np.log2(j + 2) for j, h in enumerate(hits))
        idcg = sum(1 / np.log2(j + 2) for j in range(min(len(pos), k)))
        ndcg.append(dcg / idcg)
        hit.append(1.0 if any(hits) else 0.0)
        pop_pct.append(float(np.mean(order[top])))
    n = len(rec)
    return {f"precision_at_{k}": r(np.mean(prec)) if n else None, f"recall_at_{k}": r(np.mean(rec)) if n else None,
            f"ndcg_at_{k}": r(np.mean(ndcg)) if n else None, "hit_rate": r(np.mean(hit)) if n else None,
            "coverage": r(len(recommended) / model.n_items), "novelty": r(np.mean(pop_pct)) if n else None, "users_evaluated": n}


def evaluate_recsys(model: Recommender, prepared, seed=0) -> dict:
    pl = prepared.payload
    test = pl["test"]
    idx: RatingsIndex = prepared.preprocessor
    m = rank_metrics(model, test, pl["positive"])
    if len(test):
        pred = np.array([model.predict_rating(int(u), int(i)) for u, i, _ in test])
        m["rmse"] = r(float(np.sqrt(np.mean((np.clip(pred, 1, 5) - test[:, 2]) ** 2))))
        m["mae"] = r(float(np.mean(np.abs(np.clip(pred, 1, 5) - test[:, 2]))))
    out: dict = {"metrics": {"test": m, "train": {}}}
    rng = np.random.default_rng(seed)

    def item_info(i):
        it = idx.items[int(i)]
        meta = idx.item_meta.get(it, {})
        return {"item": it, "title": meta.get("title", it), "genre": meta.get("genre"), "popularity": int(model.popularity[int(i)])}

    examples = []
    for u in rng.choice(model.n_users, min(6, model.n_users), replace=False):
        hist = np.where(model.M[u])[0]
        liked = hist[np.argsort(-model.R[u, hist])][:6]
        top, sc = model.recommend(int(u), 10)
        held = [int(i) for uu, i, v in test if int(uu) == u and v >= pl["positive"]]
        rated = {int(i): float(model.R[u, i]) for i in hist}
        recs = []
        for t, s in zip(top, sc):
            info = {**item_info(t), "score": r(s, 3), "hit": int(t) in held}
            if isinstance(model, ItemKNN):
                b = model.because(rated, int(t))
                info["because"] = item_info(b)["title"] if b is not None else None
            recs.append(info)
        examples.append({"user": idx.users[int(u)], "liked": [{**item_info(i), "rating": float(model.R[u, i])} for i in liked], "recs": recs})
    out["recsys"] = {"examples": examples}
    if hasattr(model, "Q"):
        from sklearn.decomposition import PCA
        Q = model.Q
        P2 = PCA(2, random_state=0).fit_transform(Q - Q.mean(0)) if Q.shape[1] >= 2 else np.c_[Q, np.zeros_like(Q)]
        show = np.argsort(-model.popularity)[:300]
        out["recsys"]["item_map"] = [{"x": r(P2[i, 0], 3), "y": r(P2[i, 1], 3), **item_info(i)} for i in show]
    counts = np.sort(model.popularity)[::-1]
    rec_counts = np.zeros(model.n_items)
    for u in range(min(model.n_users, 400)):
        top, _ = model.recommend(u, 10)
        rec_counts[top] += 1
    order = np.argsort(-model.popularity)
    out["recsys"]["long_tail"] = {"popularity": [int(c) for c in counts], "recommended": [int(rec_counts[i]) for i in order]}
    if getattr(model, "curve", None):
        out["curve"] = {"x_label": "ALS iterations", "loss": "RMSE", "points": model.curve}
    return out


def lesson_eval(model: Recommender, hidden: pd.DataFrame, seeds: pd.DataFrame | None, k: int = 10) -> dict:
    """Rank metrics for hidden interactions given raw ids; brand-new users are described by their seed ratings."""
    idx: RatingsIndex = model.index
    h = hidden[hidden["item"].astype(str).isin(idx.i_index)]
    if seeds is None:
        h = h[h["user"].astype(str).isin(idx.u_index)]
        trip = np.c_[h["user"].astype(str).map(idx.u_index), h["item"].astype(str).map(idx.i_index), h["rating"]].astype(np.float32)
        return rank_metrics(model, trip, idx.positive, k)
    users = sorted(h["user"].astype(str).unique())
    local = {u: j for j, u in enumerate(users)}
    trip = np.c_[h["user"].astype(str).map(local), h["item"].astype(str).map(idx.i_index), h["rating"]].astype(np.float32)
    override = {local[u]: {} for u in users}
    for _, row in seeds.iterrows():
        u, it = str(row["user"]), str(row["item"])
        if u in local and it in idx.i_index:
            override[local[u]][idx.i_index[it]] = float(row["rating"])
    return rank_metrics(model, trip, idx.positive, k, rated_override=override)
