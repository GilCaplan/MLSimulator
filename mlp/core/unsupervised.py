"""Unsupervised learning: clustering, dimensionality reduction and anomaly detection on tabular data.

Preparation reuses the tabular pipeline with a hidden row-id target so every row keeps its identity (used to look up
raw values and an optional "truth" column that is never shown to the models). Torch-free.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd

from ..util.jsonable import r

UNSUPERVISED_TASKS = {"clustering", "reduction", "anomaly"}
ROW = "__row__"


# ----------------------------------------------------------------------------- preparation
def prepare_unsupervised(df: pd.DataFrame, spec: dict, dataset_id: str):
    from .pipeline import prepare
    task = spec["task"]
    truth = spec.get("truth") or None
    if truth is not None and truth not in df.columns:
        truth = None
    df2 = df.copy()
    df2[ROW] = np.arange(len(df2), dtype=float)
    holdout = float((spec.get("unsupervised") or {}).get("holdout", 0.0))
    s2 = {**spec, "task": "regression", "target": ROW, "target_transform": "none", "target_filter": {"enabled": False},
          "resample": {"mode": "none"}, "drop_columns": list(spec.get("drop_columns") or []) + ([truth] if truth else []),
          "split": {**(spec.get("split") or {}), "method": "random", "test_size": max(holdout, 0.0001) if holdout else 0.0001, "val_size": 0.0}}
    fs = (s2.get("feature_select") or {}).get("method", "none")
    if fs not in ("none", "variance"):
        s2["feature_select"] = {"method": "none"}  # target-based selection makes no sense without a target
    p = prepare(df2, s2, dataset_id)
    if not holdout:
        # fold the tiny technical test split back into training
        p.X_train = np.vstack([p.X_train, p.X_test]).astype(np.float32)
        p.y_train = np.concatenate([p.y_train, p.y_test])
        p.X_test, p.y_test = p.X_train[:0], p.y_train[:0]
    rows_tr, rows_te = p.y_train.astype(int), p.y_test.astype(int)
    p.task = task
    p.spec = {**spec, "target": None}
    p.preprocessor.task = task
    p.classes = None
    p.X_train_orig, p.y_train_orig = p.X_train, p.y_train
    t_all = df[truth].astype(str).to_numpy() if truth else None
    raw_cols = [c for c in df.columns if c != truth]
    p.payload = {"rows_train": rows_tr.tolist(), "rows_test": rows_te.tolist(), "truth": truth,
                 "truth_train": t_all[rows_tr].tolist() if truth else None, "truth_test": t_all[rows_te].tolist() if truth else None,
                 "raw_train": df.iloc[rows_tr[:5000]][raw_cols].reset_index(drop=True)}
    from .profile import project_2d
    P, pca = project_2d(p.X_train)
    p.pca = pca
    rng = np.random.default_rng(0)
    idx = np.arange(len(rows_tr)) if len(rows_tr) <= 1200 else np.sort(rng.choice(len(rows_tr), 1200, replace=False))
    rep = p.report
    rep.update({"task": task, "classes": None, "truth": truth, "class_counts_before": None, "class_counts_after": None,
                "class_counts_test": None, "splits": {"train": int(len(rows_tr)), "train_before_resample": int(len(rows_tr)),
                                                      "val": 0, "test": int(len(rows_te))},
                "before_points": [{"id": f"o{i}", "x": r(P[i, 0], 3), "y": r(P[i, 1], 3), "label": t_all[rows_tr[i]] if truth else None} for i in idx],
                "after_points": []})
    rep["after_points"] = rep["before_points"]
    rep.pop("target_hist_train", None)
    return p


# ----------------------------------------------------------------------------- model wrappers
class UnsupervisedModel:
    """Fitted unsupervised estimator + what's needed to assign new rows (picklable, sklearn-only)."""

    def __init__(self, task, model_id, est, X_ref, labels_ref=None, threshold=None, pca=None):
        self.task, self.model_id, self.est = task, model_id, est
        self.X_ref, self.labels_ref, self.threshold, self.pca = X_ref, labels_ref, threshold, pca
        self.centers = None
        if task == "clustering" and labels_ref is not None:
            ks = sorted(set(int(k) for k in labels_ref if k >= 0))
            self.centers = np.array([X_ref[labels_ref == k].mean(0) for k in ks]) if ks else None
            self.center_ids = ks

    # clustering: estimator predict when available, otherwise nearest labelled training row
    def cluster(self, X):
        if hasattr(self.est, "predict") and self.model_id not in ("dbscan", "agglomerative"):
            return np.asarray(self.est.predict(X))
        from sklearn.neighbors import KNeighborsClassifier
        mask = self.labels_ref >= 0
        if mask.sum() == 0:
            return -np.ones(len(X), int)
        knn = KNeighborsClassifier(n_neighbors=1).fit(self.X_ref[mask], self.labels_ref[mask])
        lab = knn.predict(X)
        if self.model_id == "dbscan":  # points far from every core sample are noise
            eps = float(self.est.get_params()["eps"])
            d, _ = knn.kneighbors(X, n_neighbors=1)
            lab = np.where(d[:, 0] <= eps, lab, -1)
        return lab

    def score(self, X):
        """Anomaly score: higher = more unusual."""
        if self.model_id == "lof":
            return -self.est.score_samples(X)
        return -self.est.score_samples(X)

    def embed(self, X):
        if self.model_id == "pca":
            return self.est.transform(X)[:, :2]
        if self.pca is not None:
            return self.pca.transform(X)
        return X[:, :2] if X.shape[1] >= 2 else np.hstack([X, np.zeros_like(X)])

    def predict(self, X):
        if self.task == "clustering":
            return self.cluster(X)
        if self.task == "anomaly":
            return (self.score(X) >= self.threshold).astype(int)
        return self.embed(X)

    def assign(self, X) -> dict:
        out: dict = {}
        if self.task == "clustering":
            lab = self.cluster(X)
            out["cluster"] = [int(v) for v in lab]
            if self.centers is not None:
                d = np.sqrt(((X[:, None, :] - self.centers[None]) ** 2).sum(-1))
                out["distances"] = np.round(d, 3).tolist()
                out["center_ids"] = self.center_ids
        elif self.task == "anomaly":
            s = self.score(X)
            out.update({"score": np.round(s, 4).tolist(), "anomaly": (s >= self.threshold).astype(int).tolist(), "threshold": r(self.threshold, 4)})
        if self.pca is not None or self.model_id == "pca":
            out["coords"] = np.round(self.embed(X), 3).tolist()
        return out


# ----------------------------------------------------------------------------- fitting
def _projector(prepared):
    """Function mapping prepared feature rows to 2-D map coordinates (1-D data gets a small vertical jitter)."""
    if prepared.pca is not None:
        return prepared.pca.transform

    def proj(A):
        if A.shape[1] >= 2:
            return A[:, :2]
        return np.hstack([A, np.random.default_rng(0).normal(0, 0.12 * (A.std() or 1), (len(A), 1))])
    return proj


def _check(cancel):
    if cancel is not None and cancel.is_set():
        from .train_classic import Cancelled
        raise Cancelled()


def _sample_idx(n, k, seed=0):
    return np.arange(n) if n <= k else np.sort(np.random.default_rng(seed).choice(n, k, replace=False))


def fit_unsupervised(model_id, params, prepared, emit, cancel, key, seed=42):
    from sklearn import cluster as C
    from sklearn import decomposition as D
    from sklearn import ensemble as E
    from sklearn import manifold as MF
    from sklearn import mixture as MX
    from sklearn import neighbors as NB
    from sklearn import svm as SV

    from .registry import defaults
    p = {**defaults(model_id), **(params or {})}
    X = prepared.X_train
    task = prepared.task
    pca2 = prepared.pca
    proj = _projector(prepared)
    show = _sample_idx(len(X), 400, 1)
    sample_points = [[r(v, 3) for v in row] for row in proj(X[show])]
    emit("cluster.points", {"key": key, "points": sample_points})
    steps = []
    labels = None
    if model_id == "kmeans":
        k = int(p["n_clusters"])
        rng = np.random.default_rng(seed)
        # try several starting positions quickly and animate the run from the one that ends best (avoids poor local optima)
        best = None
        for t in range(5):
            init = X[rng.choice(len(X), k, replace=False)] if p.get("init") == "random" else C.kmeans_plusplus(X, k, random_state=seed + t)[0]
            fit = C.KMeans(n_clusters=k, init=init, n_init=1, max_iter=300, random_state=seed).fit(X)
            if best is None or fit.inertia_ < best[1]:
                best = (init, fit.inertia_)
        centers = best[0]
        est = None
        for it in range(int(p["max_iter"])):
            _check(cancel)
            est = C.KMeans(n_clusters=k, init=centers, n_init=1, max_iter=1, random_state=seed).fit(X)
            moved = float(np.abs(est.cluster_centers_ - centers).max())
            centers = est.cluster_centers_
            st = {"iter": it + 1, "inertia": r(est.inertia_, 2), "centroids_2d": [[r(v, 3) for v in row] for row in proj(centers)],
                  "labels": [int(v) for v in est.labels_[show]]}
            steps.append(st)
            emit("cluster.step", {"key": key, **st})
            emit("iteration", {"key": key, "i": it + 1, "n": int(p["max_iter"])})
            time.sleep(0.05)
            if moved < 1e-4:
                break
        labels = est.labels_
    elif model_id == "gmm":
        k = int(p["n_components"])
        est = MX.GaussianMixture(n_components=k, covariance_type=p["covariance_type"], max_iter=1, warm_start=True, random_state=seed)
        prev = None
        import warnings
        for it in range(int(p["max_iter"])):
            _check(cancel)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                est.fit(X)
            lab = est.predict(X)
            st = {"iter": it + 1, "inertia": r(-est.score(X) * len(X), 2), "centroids_2d": [[r(v, 3) for v in row] for row in proj(est.means_)],
                  "labels": [int(v) for v in lab[show]]}
            steps.append(st)
            emit("cluster.step", {"key": key, **st})
            emit("iteration", {"key": key, "i": it + 1, "n": int(p["max_iter"])})
            time.sleep(0.03)
            ll = est.lower_bound_
            if prev is not None and abs(ll - prev) < 1e-4:
                break
            prev = ll
        labels = est.predict(X)
    elif model_id == "dbscan":
        emit("iteration", {"key": key, "i": 0, "n": 0})
        est = C.DBSCAN(eps=float(p["eps"]), min_samples=int(p["min_samples"])).fit(X)
        labels = est.labels_
    elif model_id == "agglomerative":
        emit("iteration", {"key": key, "i": 0, "n": 0})
        Xs = X if len(X) <= 5000 else X[_sample_idx(len(X), 5000)]
        est = C.AgglomerativeClustering(n_clusters=int(p["n_clusters"]), linkage=p["linkage"]).fit(Xs)
        labels = est.labels_ if len(X) <= 5000 else None
        if labels is None:
            from sklearn.neighbors import KNeighborsClassifier
            labels = KNeighborsClassifier(1).fit(Xs, est.labels_).predict(X)
    elif model_id == "pca":
        emit("iteration", {"key": key, "i": 0, "n": 0})
        n = max(2, min(int(p["n_components"]), X.shape[1]))
        est = D.PCA(n_components=n, random_state=seed).fit(X)
    elif model_id == "tsne":
        emit("iteration", {"key": key, "i": 0, "n": 0})
        idx = _sample_idx(len(X), 2000, seed)
        est = MF.TSNE(n_components=2, perplexity=min(float(p["perplexity"]), max(5.0, len(idx) / 4)), random_state=seed,
                      init="pca", learning_rate="auto").fit(X[idx])
        est.sample_idx_ = idx
    elif model_id == "isolation_forest":
        emit("iteration", {"key": key, "i": 0, "n": 0})
        est = E.IsolationForest(n_estimators=int(p["n_estimators"]), contamination="auto", random_state=seed).fit(X)
    elif model_id == "one_class_svm":
        emit("iteration", {"key": key, "i": 0, "n": 0})
        Xs = X if len(X) <= 5000 else X[_sample_idx(len(X), 5000)]
        est = SV.OneClassSVM(nu=float(p["nu"]), kernel=p["kernel"], gamma="scale").fit(Xs)
    elif model_id == "lof":
        emit("iteration", {"key": key, "i": 0, "n": 0})
        est = NB.LocalOutlierFactor(n_neighbors=int(p["n_neighbors"]), novelty=True).fit(X)
    else:
        raise ValueError(f"Unknown unsupervised model {model_id}")
    _check(cancel)
    threshold, train_scores = None, None
    if task == "anomaly":
        # LOF's score_samples on its own training rows is biased (each point is its own neighbour); use its training factor
        train_scores = -est.negative_outlier_factor_ if model_id == "lof" else -est.score_samples(X)
        threshold = float(np.quantile(train_scores, 1 - float(p.get("contamination", 0.05))))
    ref_idx = _sample_idx(len(X), 5000, 2)
    model = UnsupervisedModel(task, model_id, est, X[ref_idx], labels[ref_idx] if labels is not None else None, threshold, pca2)
    model.labels_train = labels
    model.train_scores = train_scores
    model.steps = steps
    model.sample_points = sample_points  # the 2-D sample that `steps[].labels` refer to (exact replays)
    return model


# ----------------------------------------------------------------------------- evaluation
def _purity(truth, labels):
    ct = pd.crosstab(pd.Series(labels), pd.Series(truth))
    return float(ct.max(axis=1).sum() / ct.values.sum())


def _cluster_metrics(X, labels, truth=None, seed=0) -> dict:
    from sklearn import metrics as M
    m: dict = {}
    mask = labels >= 0
    ks = set(labels[mask].tolist())
    m["n_clusters"] = len(ks)
    m["noise_share"] = r(1 - mask.mean())
    if len(ks) >= 2 and mask.sum() > len(ks):
        idx = np.where(mask)[0]
        idx = idx if len(idx) <= 2000 else np.random.default_rng(seed).choice(idx, 2000, replace=False)
        m["silhouette"] = r(M.silhouette_score(X[idx], labels[idx]))
        m["davies_bouldin"] = r(M.davies_bouldin_score(X[mask], labels[mask]))
        m["calinski_harabasz"] = r(M.calinski_harabasz_score(X[mask], labels[mask]), 2)
    if truth is not None:
        m["ari"] = r(M.adjusted_rand_score(truth, labels))
        m["nmi"] = r(M.normalized_mutual_info_score(truth, labels))
        m["purity"] = r(_purity(truth, labels))
    return m


def evaluate_unsupervised(model: UnsupervisedModel, prepared, seed=0) -> dict:
    task = prepared.task
    X = prepared.X_train
    pl = prepared.payload or {}
    truth = np.asarray(pl["truth_train"]) if pl.get("truth_train") else None
    raw = pl.get("raw_train")
    out: dict = {"metrics": {}}
    proj = _projector(prepared)
    show = _sample_idx(len(X), 1200, 3)
    P = proj(X[show])
    if task == "clustering":
        labels = model.labels_train
        mtr = _cluster_metrics(X, labels, truth, seed)
        if getattr(model.est, "inertia_", None) is not None:
            mtr["inertia"] = r(model.est.inertia_, 2)
        if hasattr(model.est, "bic"):
            mtr["bic"] = r(model.est.bic(X), 1)
        mte = mtr
        if len(prepared.y_test):
            lt = model.cluster(prepared.X_test)
            tt = np.asarray(pl["truth_test"]) if pl.get("truth_test") else None
            mte = _cluster_metrics(prepared.X_test, lt, tt, seed)
        out["metrics"] = {"train": mtr, "test": mte}
        sizes = pd.Series(labels).value_counts().sort_index()
        cl = {"points": [{"x": r(P[j, 0], 3), "y": r(P[j, 1], 3), "c": int(labels[i]), **({"truth": str(truth[i])} if truth is not None else {})}
                         for j, i in enumerate(show)],
              "sizes": {str(int(k)): int(v) for k, v in sizes.items()},
              "steps": model.steps, "sample_points": getattr(model, "sample_points", None)}
        if model.centers is not None:
            cl["centroids_2d"] = [[r(v, 3) for v in row] for row in proj(model.centers)]
            cl["center_ids"] = model.center_ids
        if truth is not None:
            ct = pd.crosstab(pd.Series(truth, name="truth"), pd.Series(labels, name="cluster"))
            cl["contingency"] = {"rows": [str(x) for x in ct.index], "cols": [int(c) for c in ct.columns], "matrix": ct.values.tolist()}
        if raw is not None and len(raw):
            lab_raw = labels[:len(raw)]
            num = raw.select_dtypes("number")
            prof = []
            if num.shape[1]:
                mu, sd = num.mean(), num.std().replace(0, 1)
                for k in sorted(set(lab_raw.tolist())):
                    g = num[lab_raw == k]
                    z = ((g.mean() - mu) / sd).sort_values(key=np.abs, ascending=False)
                    prof.append({"cluster": int(k), "size": int(len(g)),
                                 "top": [{"feature": str(f), "z": r(z[f], 2), "mean": r(g[f].mean(), 3), "overall": r(mu[f], 3)} for f in z.index[:5]]})
            cl["profiles"] = prof
        out["clusters"] = cl
    elif task == "reduction":
        if model.model_id == "pca":
            est = model.est
            emb = est.transform(X[show])
            ev = est.explained_variance_ratio_
            names = prepared.feature_names
            loadings = []
            for c in range(min(4, est.n_components_)):
                w = est.components_[c]
                o = np.argsort(-np.abs(w))[:6]
                loadings.append({"component": c + 1, "top": [{"feature": names[i], "w": r(w[i], 3)} for i in o]})
            recon = []
            from sklearn.decomposition import PCA
            full = PCA(n_components=min(X.shape[1], 30), random_state=0).fit(X[_sample_idx(len(X), 3000)])
            tot = float(((X - X.mean(0)) ** 2).sum(1).mean())
            for kk in range(1, min(X.shape[1], 30) + 1):
                recon.append({"k": kk, "kept": r(float(np.sum(full.explained_variance_ratio_[:kk])), 3)})
            red = {"explained": [r(v, 4) for v in ev], "cumulative": [r(v, 4) for v in np.cumsum(ev)], "loadings": loadings,
                   "kept_curve": recon}
            out["metrics"] = {"test": {"explained_2d": r(float(ev[:2].sum())), "explained_all": r(float(ev.sum())), "n_components": int(est.n_components_)}}
        else:
            idx = model.est.sample_idx_
            emb = model.est.embedding_
            show = idx[:1200]
            emb = emb[:1200]
            red = {"kl_divergence": r(model.est.kl_divergence_, 3)}
            out["metrics"] = {"test": {}}
        from sklearn.manifold import trustworthiness
        sub = _sample_idx(len(emb), 800, 4)
        tw = trustworthiness(X[show][sub], emb[sub], n_neighbors=10)
        out["metrics"]["test"]["trustworthiness"] = r(tw)
        out["metrics"]["train"] = out["metrics"]["test"]
        red["points"] = [{"x": r(emb[j, 0], 3), "y": r(emb[j, 1], 3), **({"truth": str(truth[i])} if truth is not None else {})}
                         for j, i in enumerate(show)]
        out["reduction"] = red
    else:  # anomaly
        s = model.train_scores if getattr(model, "train_scores", None) is not None else model.score(X)
        thr = model.threshold
        flagged = s >= thr
        m = {"flagged_share": r(flagged.mean()), "threshold": r(thr, 4)}
        hist_edges = np.histogram_bin_edges(s, bins=30)
        an = {"threshold": r(thr, 4), "hist": {"edges": [r(v, 4) for v in hist_edges], "counts": np.histogram(s, hist_edges)[0].tolist()}}
        if truth is not None:
            from sklearn import metrics as M
            pos_label = _anomaly_label(truth)
            yt = (truth == pos_label).astype(int)
            if 0 < yt.sum() < len(yt):
                m["roc_auc"] = r(M.roc_auc_score(yt, s))
                m["avg_precision"] = r(M.average_precision_score(yt, s))
                m["precision"] = r(M.precision_score(yt, flagged.astype(int), zero_division=0))
                m["recall"] = r(M.recall_score(yt, flagged.astype(int), zero_division=0))
                an["hist_true"] = np.histogram(s[yt == 1], hist_edges)[0].tolist()
                an["positive_label"] = str(pos_label)
        out["metrics"] = {"train": m, "test": m}
        order = np.argsort(-s)[:25]
        if raw is not None and len(raw):
            cols = list(raw.columns)[:12]
            an["top"] = {"columns": [str(c) for c in cols],
                         "rows": [{"score": r(s[i], 4), "values": [_cell(raw.iloc[i][c]) for c in cols], **({"truth": str(truth[i])} if truth is not None else {})}
                                  for i in order if i < len(raw)]}
        an["points"] = [{"x": r(P[j, 0], 3), "y": r(P[j, 1], 3), "score": r(s[i], 3), "flag": bool(flagged[i]),
                         **({"truth": str(truth[i])} if truth is not None else {})} for j, i in enumerate(show)]
        if prepared.pca is not None:
            (x0, y0), (x1, y1) = P.min(0), P.max(0)
            res = 40
            gx, gy = np.linspace(x0, x1, res), np.linspace(y0, y1, res)
            G = np.array([[a, b] for b in gy for a in gx])
            sg = model.score(prepared.pca.inverse_transform(G).astype(np.float32))
            an["surface"] = {"nx": res, "ny": res, "x": [r(x0), r(x1)], "y": [r(y0), r(y1)], "grid": [r(v, 3) for v in sg]}
        out["anomaly"] = an
    return out


def _anomaly_label(truth: np.ndarray) -> str:
    """The rarer truth value is the 'anomaly' class."""
    vals, cnt = np.unique(truth, return_counts=True)
    return vals[np.argmin(cnt)]


def _cell(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (np.floating, float)):
        return r(v, 4)
    if isinstance(v, np.integer):
        return int(v)
    return v if isinstance(v, (int, bool)) else str(v)


# ----------------------------------------------------------------------------- k sweep
def run_sweep(payload, prepared, emit, cancel) -> dict:
    from sklearn import cluster as C
    from sklearn import mixture as MX
    model_id = payload.get("model_id", "kmeans")
    kmin, kmax = int(payload.get("k_min", 2)), int(payload.get("k_max", 10))
    X = prepared.X_train
    truth = np.asarray(prepared.payload["truth_train"]) if (prepared.payload or {}).get("truth_train") else None
    rows = []
    for k in range(max(2, kmin), max(kmin, kmax) + 1):
        _check(cancel)
        if model_id == "gmm":
            est = MX.GaussianMixture(k, random_state=42).fit(X)
            lab, extra = est.predict(X), {"bic": r(est.bic(X), 1)}
        elif model_id == "agglomerative":
            Xs = X[_sample_idx(len(X), 4000)]
            lab = C.AgglomerativeClustering(k).fit_predict(Xs)
            X_eval = Xs
            extra = {}
        else:
            est = C.KMeans(k, n_init=4, random_state=42).fit(X)
            lab, extra = est.labels_, {"inertia": r(est.inertia_, 2)}
        Xe = X_eval if model_id == "agglomerative" else X
        m = _cluster_metrics(Xe, lab, truth[:len(Xe)] if truth is not None else None)
        row = {"k": k, **{kk: m.get(kk) for kk in ("silhouette", "davies_bouldin", "ari", "nmi")}, **extra}
        rows.append(row)
        emit("sweep.k", row)
    best = max(rows, key=lambda x: x.get("silhouette") or -1)
    return {"model_id": model_id, "rows": rows, "best_k": best["k"], "metric": "silhouette", "has_truth": truth is not None}
