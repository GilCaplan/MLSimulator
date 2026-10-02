"""A dependency-free graph convolutional network over a k-NN graph of the samples.

Training is inductive: the graph is built among training rows; any other rows
(validation, test, new data) attach to their k nearest *training* rows. Train
rows never point at other rows, so their representations are unaffected and the
same code path serves evaluation and saved-model prediction.
Aggregation is the mean over {self} ∪ neighbours (row-normalised adjacency).
"""
from __future__ import annotations

import numpy as np
import torch
from torch import nn

from .builder import act


class GCN(nn.Module):
    def __init__(self, n_features: int, n_out: int, hidden=(64, 32), activation="relu", dropout=0.3):
        super().__init__()
        dims = [n_features, *[max(1, int(h)) for h in (hidden or [])], n_out]
        self.layers = nn.ModuleList(nn.Linear(a, b) for a, b in zip(dims[:-1], dims[1:]))
        self.act = act(activation)
        self.dropout = nn.Dropout(float(dropout))

    def forward(self, x, adj):
        h = x
        for i, lin in enumerate(self.layers):
            h = torch.sparse.mm(adj, lin(h))
            if i < len(self.layers) - 1:
                h = self.dropout(self.act(h))
        return h


def _row_norm_sparse(rows, cols, n_rows, n_cols):
    rows = np.asarray(rows)
    cols = np.asarray(cols)
    deg = np.bincount(rows, minlength=n_rows).astype(np.float32)
    vals = 1.0 / deg[rows]
    idx = torch.tensor(np.vstack([rows, cols]), dtype=torch.long)
    return torch.sparse_coo_tensor(idx, torch.tensor(vals, dtype=torch.float32), (n_rows, n_cols), check_invariants=False).coalesce()


def train_graph(X_train: np.ndarray, k: int):
    """Symmetric k-NN graph among training rows (+ self loops), row-normalised."""
    from sklearn.neighbors import NearestNeighbors
    n = len(X_train)
    k = max(1, min(int(k), n - 1))
    nn_ = NearestNeighbors(n_neighbors=k + 1).fit(X_train)
    _, ind = nn_.kneighbors(X_train)
    edges = set()
    for i in range(n):
        for j in ind[i, 1:]:
            edges.add((i, int(j)))
            edges.add((int(j), i))
    for i in range(n):
        edges.add((i, i))
    e = np.array(sorted(edges))
    return _row_norm_sparse(e[:, 0], e[:, 1], n, n), nn_


def combined_graph(train_edges: torch.Tensor, nn_index, X_new: np.ndarray, n_train: int, k: int):
    """Graph over [train ; new]: train rows keep their edges; new rows link to self + k nearest train rows."""
    m = len(X_new)
    k = max(1, min(int(k), n_train))
    _, ind = nn_index.kneighbors(X_new, n_neighbors=k)
    te = train_edges.indices().numpy()
    rows = [te[0], np.repeat(np.arange(m) + n_train, k), np.arange(m) + n_train]
    cols = [te[1], ind.reshape(-1), np.arange(m) + n_train]
    return _row_norm_sparse(np.concatenate(rows), np.concatenate(cols), n_train + m, n_train + m)
