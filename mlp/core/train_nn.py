"""PyTorch training loop for the visual network builder."""
from __future__ import annotations

import copy
import math
import time

import numpy as np
import torch
from torch import nn

from ..util.jsonable import r
from .nn.builder import build
from .train_classic import Cancelled


def pick_device(kind: str, n_rows: int, n_features: int) -> torch.device:
    if kind == "gcn":
        return torch.device("cpu")  # sparse ops are CPU-only on Apple Silicon
    big = kind in ("cnn2d", "tiny_resnet", "ft_transformer") and n_rows * n_features > 2e5 or n_rows * n_features > 2e6
    if big and torch.cuda.is_available():
        return torch.device("cuda")  # NVIDIA GPU (Linux / Windows)
    if big and torch.backends.mps.is_available():
        return torch.device("mps")  # Apple GPU
    return torch.device("cpu")


class TorchModel:
    """sklearn-like wrapper around a trained network (picklable: stores the state dict, rebuilds lazily)."""

    def __init__(self, arch, n_features, n_out, task, image_shape, state, y_mean=0.0, y_std=1.0, graph=None):
        self.arch, self.n_features, self.n_out, self.task = arch, n_features, n_out, task
        self.image_shape, self.state = image_shape, state
        self.y_mean, self.y_std = y_mean, y_std
        self.graph = graph  # GCN: {"X_train", "edges", "nn_index", "k"}
        self._module = None

    def __getstate__(self):
        d = dict(self.__dict__)
        d["_module"] = None
        return d

    def module(self):
        if self._module is None:
            m, _ = build(self.arch, self.n_features, self.n_out, self.image_shape)
            m.load_state_dict(self.state)
            m.eval()
            self._module = m
        return self._module

    def _raw(self, X) -> np.ndarray:
        X = np.asarray(X, dtype=np.float32)
        m = self.module()
        with torch.no_grad():
            if self.arch.get("kind") == "gcn":
                from .nn.gcn import combined_graph
                g = self.graph
                Xt = g["X_train"]
                edges = torch.sparse_coo_tensor(torch.tensor(g["edges"]), torch.ones(g["edges"].shape[1]), (len(Xt), len(Xt)), check_invariants=False).coalesce()
                outs = []
                for s in range(0, len(X), 4000):
                    chunk = X[s:s + 4000]
                    adj = combined_graph(edges, g["nn_index"], chunk, len(Xt), g["k"])
                    o = m(torch.from_numpy(np.vstack([Xt, chunk])), adj)[len(Xt):]
                    outs.append(o.numpy())
                return np.vstack(outs)
            outs = [m(torch.from_numpy(X[s:s + 4096])).numpy() for s in range(0, len(X), 4096)]
            return np.vstack(outs) if outs else np.zeros((0, self.n_out))

    def predict(self, X):
        out = self._raw(X)
        if self.task == "classification":
            return out.argmax(1)
        return out[:, 0] * self.y_std + self.y_mean

    def predict_proba(self, X):
        out = self._raw(X)
        e = np.exp(out - out.max(1, keepdims=True))
        return e / e.sum(1, keepdims=True)


def _weights_snapshot(model) -> list:
    """Small sample of weight matrices so the UI can animate connections."""
    snaps = []
    for mod in model.modules():
        if isinstance(mod, nn.Linear):
            W = mod.weight.detach().cpu().numpy()
            snaps.append([[r(v, 3) for v in row[:8]] for row in W[:8]])
    return snaps[:6]


def augment_batch(x, shape, cfg):
    """Random flips / rotation / shift / brightness / cutout on a flat image batch (B, C*H*W), on the batch's device."""
    import torch.nn.functional as F
    c, h, w = shape
    B = x.shape[0]
    x = x.reshape(B, c, h, w)
    dev = x.device
    if cfg.get("flip_h"):
        m = (torch.rand(B, device=dev) < 0.5)[:, None, None, None]
        x = torch.where(m, x.flip(3), x)
    if cfg.get("flip_v"):
        m = (torch.rand(B, device=dev) < 0.5)[:, None, None, None]
        x = torch.where(m, x.flip(2), x)
    rot, shift = float(cfg.get("rotate") or 0), float(cfg.get("shift") or 0)
    if rot or shift:
        a = (torch.rand(B, device=dev) * 2 - 1) * math.radians(rot)
        tx, ty = [(torch.rand(B, device=dev) * 2 - 1) * shift * 2 for _ in range(2)]
        theta = torch.stack([torch.stack([a.cos(), -a.sin(), tx], 1), torch.stack([a.sin(), a.cos(), ty], 1)], 1)
        grid = F.affine_grid(theta, list(x.shape), align_corners=False)
        # half the batch stays untouched: warping smooths pixel texture, so seeing only warped images makes real ones
        # look systematically different and the network learns the warping instead of the shapes
        warped = F.grid_sample(x, grid, mode=cfg.get("interp", "bilinear"), padding_mode="border", align_corners=False)
        keep = (torch.rand(B, device=dev) < float(cfg.get("p_identity", 0.5)))[:, None, None, None]
        x = torch.where(keep, x, warped)
    b = float(cfg.get("brightness") or 0)
    if b:
        x = (x * (1 + (torch.rand(B, 1, 1, 1, device=dev) * 2 - 1) * b) + (torch.rand(B, 1, 1, 1, device=dev) * 2 - 1) * b * 0.25).clamp(0, 1)
    if cfg.get("cutout"):
        s_ = max(2, h // 4)
        ys = torch.randint(0, h - s_ + 1, (B, 1, 1), device=dev)
        xs = torch.randint(0, w - s_ + 1, (B, 1, 1), device=dev)
        yy = torch.arange(h, device=dev)[None, :, None]
        xx = torch.arange(w, device=dev)[None, None, :]
        hole = ((yy >= ys) & (yy < ys + s_) & (xx >= xs) & (xx < xs + s_))[:, None]
        x = torch.where(hole, x.mean(dim=(1, 2, 3), keepdim=True), x)
    return x.reshape(B, -1)


def _optimizer(name, params, lr, wd):
    if name == "sgd":
        return torch.optim.SGD(params, lr=lr, momentum=0.9, weight_decay=wd)
    if name == "rmsprop":
        return torch.optim.RMSprop(params, lr=lr, weight_decay=wd)
    if name == "adam":
        return torch.optim.Adam(params, lr=lr, weight_decay=wd)
    return torch.optim.AdamW(params, lr=lr, weight_decay=wd)


def train_nn(model_id, params, arch, prepared, emit, cancel, key, seed=42):
    from .registry import MODEL_INDEX, defaults
    p = {**defaults(model_id), **(params or {})}
    label = MODEL_INDEX[model_id]["label"]
    torch.manual_seed(seed)
    np.random.seed(seed)
    task = prepared.task
    arch = copy.deepcopy(arch or {})
    arch.setdefault("kind", {"mlp": "mlp", "cnn1d": "cnn1d", "cnn2d": "cnn2d", "ft_transformer": "ft_transformer", "gcn": "gcn",
                             "tiny_resnet": "tiny_resnet", "embedding_bag": "embedding_bag", "gru": "gru",
                             "text_transformer": "text_transformer"}[model_id])
    kind = arch["kind"]
    X, y = prepared.X_train, prepared.y_train
    Xv, yv = prepared.X_val, prepared.y_val
    if len(yv) == 0:  # carve a monitoring split so early stopping has something to watch
        rng = np.random.default_rng(seed)
        idx = rng.permutation(len(y))
        cut = max(1, len(y) // 10)
        Xv, yv, X, y = X[idx[:cut]], y[idx[:cut]], X[idx[cut:]], y[idx[cut:]]
    n_features = X.shape[1]
    n_out = len(prepared.classes) if task == "classification" else 1
    y_mean, y_std = 0.0, 1.0
    if task == "regression":
        y_mean, y_std = float(np.mean(y)), float(np.std(y) or 1.0)

    model, _ = build(arch, n_features, n_out, prepared.image_shape)
    device = pick_device(kind, len(X), n_features)
    model.to(device)
    lr, epochs = float(p["lr"]), int(p["epochs"])
    opt = _optimizer(p["optimizer"], model.parameters(), lr, float(p["weight_decay"]))
    sched = None
    if p["scheduler"] == "plateau":
        sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5, patience=max(2, int(p["patience"]) // 3 or 3))
    elif p["scheduler"] == "cosine":
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, epochs))

    if task == "classification":
        weight = None
        if p.get("class_weight") == "balanced":
            cnt = np.bincount(y, minlength=n_out).astype(float)
            weight = torch.tensor(len(y) / (n_out * np.maximum(cnt, 1)), dtype=torch.float32, device=device)
        loss_fn = nn.CrossEntropyLoss(weight=weight)
        yt = torch.tensor(y, dtype=torch.long)
        yvt = torch.tensor(yv, dtype=torch.long)
    else:
        loss_fn = nn.MSELoss()
        yt = torch.tensor((y - y_mean) / y_std, dtype=torch.float32).unsqueeze(1)
        yvt = torch.tensor((yv - y_mean) / y_std, dtype=torch.float32).unsqueeze(1)
    Xt = torch.tensor(X, dtype=torch.float32)
    Xvt = torch.tensor(Xv, dtype=torch.float32)

    graph = None
    if kind == "gcn":
        from .nn.gcn import combined_graph, train_graph
        k = int(arch.get("k", 10))
        adj_tr, nn_index = train_graph(X, k)
        adj_val = combined_graph(adj_tr, nn_index, Xv, len(X), k)
        Xall_v = torch.cat([Xt, Xvt])
        graph = {"X_train": X.astype(np.float32), "edges": adj_tr.indices().numpy(), "nn_index": nn_index, "k": k}

    def metric(out, target):
        if task == "classification":
            return float((out.argmax(1) == target).float().mean())
        ss_res = float(((out - target) ** 2).sum())
        ss_tot = float(((target - target.mean()) ** 2).sum()) or 1.0
        return 1 - ss_res / ss_tot

    patience = int(p["patience"])
    best, best_state, best_epoch, bad = math.inf, None, 0, 0
    points, notes = [], {}
    bs = max(8, int(p.get("batch_size", 64)))
    last = 0.0
    n_batches = max(1, math.ceil(len(X) / bs))
    aug = (prepared.payload or {}).get("augment") if getattr(prepared, "modality", "tabular") == "image" else None
    aug = aug if aug and any(aug.values()) else None
    img_shape = list(prepared.image_shape) if prepared.image_shape and len(prepared.image_shape) == 3 else None
    emit("nn.start", {"key": key, "device": str(device), "epochs": epochs, "weights": _weights_snapshot(model)})
    for epoch in range(1, epochs + 1):
        if cancel is not None and cancel.is_set():
            raise Cancelled()
        model.train()
        t0 = time.time()
        if kind == "gcn":
            opt.zero_grad()
            out = model(Xt.to(device), adj_tr)
            loss = loss_fn(out, yt.to(device))
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            train_loss = float(loss.detach())
        else:
            perm = torch.randperm(len(Xt))
            total = 0.0
            for b in range(n_batches):
                idx = perm[b * bs:(b + 1) * bs]
                if len(idx) < 2 and len(Xt) > 1:
                    continue
                xb, yb = Xt[idx].to(device), yt[idx].to(device)
                if aug and img_shape:
                    xb = augment_batch(xb, img_shape, aug)
                opt.zero_grad()
                loss = loss_fn(model(xb), yb)
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 5.0)
                opt.step()
                total += float(loss.detach()) * len(idx)
                now = time.time()
                if now - last > 0.12:
                    last = now
                    emit("batch", {"key": key, "epoch": epoch, "pct": r((b + 1) / n_batches, 3)})
                    if cancel is not None and cancel.is_set():
                        raise Cancelled()
            train_loss = total / len(Xt)

        model.eval()
        with torch.no_grad():
            if kind == "gcn":
                out_tr = model(Xt, adj_tr)
                out_v = model(Xall_v, adj_val)[len(Xt):]
            else:
                sub = slice(0, min(len(Xt), 3000))
                out_tr = torch.cat([model(Xt[sub][s:s + 2048].to(device)).cpu() for s in range(0, len(Xt[sub]), 2048)])
                out_v = torch.cat([model(Xvt[s:s + 2048].to(device)).cpu() for s in range(0, len(Xvt), 2048)])
            ytr_sub = yt[: len(out_tr)]
            val_loss = float(loss_fn(out_v.to(device), yvt.to(device)))
            tr_metric, va_metric = metric(out_tr.cpu(), ytr_sub), metric(out_v.cpu(), yvt)

        if not math.isfinite(train_loss) or not math.isfinite(val_loss):
            notes["diverged"] = True
            emit("log", {"level": "warn", "message": f"{label}: loss became NaN/inf at epoch {epoch} — the learning rate is probably too high."})
            break
        if sched is not None:
            sched.step(val_loss) if isinstance(sched, torch.optim.lr_scheduler.ReduceLROnPlateau) else sched.step()
        cur_lr = opt.param_groups[0]["lr"]
        pt = {"step": epoch, "train_loss": r(train_loss), "val_loss": r(val_loss), "train_score": r(tr_metric),
              "val_score": r(va_metric), "lr": r(cur_lr, 6)}
        points.append(pt)
        payload = {"key": key, "epoch": epoch, "epochs": epochs, **pt, "secs": r(time.time() - t0, 3)}
        if epoch == 1 or epoch % max(1, epochs // 30) == 0:
            payload["weights"] = _weights_snapshot(model)
        emit("epoch", payload)

        if val_loss < best - 1e-5:
            best, best_epoch, bad = val_loss, epoch, 0
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if patience and bad >= patience:
                notes["early_stopped"] = epoch
                emit("log", {"level": "info", "message": f"{label}: early stopping at epoch {epoch} (best was epoch {best_epoch})."})
                break

    if best_state is None:
        best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    notes["best_epoch"] = best_epoch
    notes["device"] = str(device)
    if points:
        first, lastp = points[0], points[-1]
        notes["plateau"] = bool(len(points) >= 8 and lastp["train_loss"] is not None and first["train_loss"]
                                and lastp["train_loss"] > 0.95 * first["train_loss"])
        notes["val_rising"] = bool(best_epoch and len(points) - best_epoch >= max(3, patience // 2))
    wrapper = TorchModel(arch, n_features, n_out, task, prepared.image_shape, best_state, y_mean, y_std, graph)
    curve = {"x_label": "epochs", "loss": "cross-entropy" if task == "classification" else "MSE (scaled)",
             "score": "accuracy" if task == "classification" else "r2", "points": points, "best_epoch": best_epoch}
    return wrapper, curve, notes
