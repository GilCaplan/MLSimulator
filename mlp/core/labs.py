"""Labs: free-play experiments outside the six-step wizard (run in the torch worker; torch imported lazily).

  gan     — a tiny GAN learns a 2-D shape; frames show the generator's points and the discriminator's opinion map.
  vae     — an autoencoder / VAE squeezes 8×8 handwritten digits into a 2-D map you can explore and decode.
  transfer — a CNN pre-trained on synthetic shapes vs one trained from scratch, on a handful of labelled digits.

Each lab emits `lab.frame` events while it runs and returns a result dict; labs that keep a model (vae) save it under
DATA_DIR/labs/<run id>/ so the prediction server can decode later.
"""
from __future__ import annotations

import time

import numpy as np

from ..util.jsonable import r

LABS = {
    "gan": {"label": "GAN: forger vs detective", "emoji": "🎨", "kind": "server",
            "blurb": "Two tiny networks compete: one forges points, the other spots fakes. Watch the forgeries take the shape.",
            "params": {"target": "ring8", "steps": 2000, "lr": 0.001, "hidden": 64, "d_steps": 1, "latent": 2}},
    "vae": {"label": "Autoencoder map", "emoji": "🌌", "kind": "server",
            "blurb": "Squeeze handwritten digits into a 2-D map, then click anywhere on the map to see what digit lives there.",
            "params": {"mode": "vae", "epochs": 60, "beta": 1.0, "hidden": 128}},
    "transfer": {"label": "Transfer learning", "emoji": "🎁", "kind": "server",
                 "blurb": "Re-use a network that learned edges and shapes elsewhere. With only a few labels it beats starting from zero.",
                 "params": {"per_class": 5, "epochs": 40}},
    "bandit": {"label": "Slot machines (bandits)", "emoji": "🎰", "kind": "client",
               "blurb": "Explore or exploit? Find the best machine while losing as little as possible."},
    "gridworld": {"label": "Robot in a maze (Q-learning)", "emoji": "🤖", "kind": "client",
                  "blurb": "Reward the robot for reaching the goal and watch it learn a route by trial and error."},
}

GAN_TARGETS = {"ring8": "Ring of 8 blobs", "moons": "Two moons", "spiral": "Spiral", "circle": "Circle", "grid9": "3×3 grid"}


def sample_target(name: str, n: int, rng) -> np.ndarray:
    if name == "ring8":
        k = rng.integers(0, 8, n)
        a = 2 * np.pi * k / 8
        return np.c_[2 * np.cos(a), 2 * np.sin(a)] + rng.normal(0, 0.12, (n, 2))
    if name == "moons":
        from sklearn.datasets import make_moons
        X, _ = make_moons(n, noise=0.06, random_state=int(rng.integers(1e9)))
        return (X - [0.5, 0.25]) * 1.6
    if name == "spiral":
        t = np.sqrt(rng.uniform(0, 1, n)) * 3 * np.pi
        return np.c_[t * np.cos(t), t * np.sin(t)] / 4.5 + rng.normal(0, 0.06, (n, 2))
    if name == "circle":
        a = rng.uniform(0, 2 * np.pi, n)
        return np.c_[1.8 * np.cos(a), 1.8 * np.sin(a)] + rng.normal(0, 0.05, (n, 2))
    if name == "grid9":
        g = rng.integers(-1, 2, (n, 2)) * 1.6
        return g + rng.normal(0, 0.1, (n, 2))
    raise ValueError(name)


# ----------------------------------------------------------------------------- GAN
def run_gan(p: dict, emit, cancel, seed=42) -> dict:
    import torch
    from torch import nn

    from .train_classic import Cancelled
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    target, steps, lr = p.get("target", "ring8"), int(p.get("steps", 2000)), float(p.get("lr", 1e-3))
    h, d_steps, zdim = int(p.get("hidden", 64)), int(p.get("d_steps", 1)), int(p.get("latent", 2))
    G = nn.Sequential(nn.Linear(zdim, h), nn.LeakyReLU(0.2), nn.Linear(h, h), nn.LeakyReLU(0.2), nn.Linear(h, 2))
    D = nn.Sequential(nn.Linear(2, h), nn.LeakyReLU(0.2), nn.Linear(h, h), nn.LeakyReLU(0.2), nn.Linear(h, 1))
    og = torch.optim.Adam(G.parameters(), lr=lr, betas=(0.5, 0.999))
    od = torch.optim.Adam(D.parameters(), lr=lr, betas=(0.5, 0.999))
    bce = nn.BCEWithLogitsLoss()
    real_show = sample_target(target, 500, rng)
    ext = float(np.abs(real_show).max() * 1.35)
    gx = np.linspace(-ext, ext, 25)
    grid = torch.tensor(np.array([[x, y] for y in gx for x in gx]), dtype=torch.float32)
    z_fixed = torch.randn(400, zdim)
    frames, every = [], max(1, steps // 60)
    t0 = time.time()
    for step in range(1, steps + 1):
        if cancel is not None and cancel.is_set():
            raise Cancelled()
        for _ in range(d_steps):
            real = torch.tensor(sample_target(target, 256, rng), dtype=torch.float32)
            fake = G(torch.randn(256, zdim)).detach()
            od.zero_grad()
            ld = bce(D(real), torch.ones(256, 1)) + bce(D(fake), torch.zeros(256, 1))
            ld.backward()
            od.step()
        og.zero_grad()
        lg = bce(D(G(torch.randn(256, zdim))), torch.ones(256, 1))
        lg.backward()
        og.step()
        if step == 1 or step % every == 0 or step == steps:
            with torch.no_grad():
                pts = G(z_fixed).numpy()
                dg = torch.sigmoid(D(grid)).numpy().reshape(25, 25)
            fr = {"step": step, "steps": steps, "g_loss": r(float(lg)), "d_loss": r(float(ld)),
                  "fake": [[r(a, 3), r(b, 3)] for a, b in pts], "d_grid": [[r(v, 3) for v in row] for row in dg],
                  "secs": r(time.time() - t0, 2)}
            frames.append(fr)
            if step == 1:  # the first frame also carries what the live view needs to draw the target and axes
                emit("lab.frame", {**fr, "real": [[r(a, 3), r(b, 3)] for a, b in real_show], "extent": r(ext, 3), "grid_x": [r(v, 3) for v in gx]})
            else:
                emit("lab.frame", fr)
    fake = np.asarray(frames[-1]["fake"])
    # how well the forgeries cover the target: share of real points with a fake point nearby, and vice versa
    from scipy.spatial import cKDTree
    real_eval = sample_target(target, 1000, rng)
    tol = 0.25 * ext / 2.5
    coverage = float((cKDTree(fake).query(real_eval)[0] < tol).mean())
    precision = float((cKDTree(real_eval).query(fake)[0] < tol).mean())
    return {"lab": "gan", "target": target, "extent": r(ext, 3), "grid_x": [r(v, 3) for v in gx],
            "real": [[r(a, 3), r(b, 3)] for a, b in real_show], "frames": frames,
            "coverage": r(coverage, 3), "precision": r(precision, 3)}


# ----------------------------------------------------------------------------- VAE
def _vae_net(hidden, mode):
    import torch
    from torch import nn

    class VAE(nn.Module):
        def __init__(self):
            super().__init__()
            self.enc = nn.Sequential(nn.Linear(64, hidden), nn.ReLU(), nn.Linear(hidden, hidden // 2), nn.ReLU())
            self.mu, self.logvar = nn.Linear(hidden // 2, 2), nn.Linear(hidden // 2, 2)
            self.dec = nn.Sequential(nn.Linear(2, hidden // 2), nn.ReLU(), nn.Linear(hidden // 2, hidden), nn.ReLU(),
                                     nn.Linear(hidden, 64), nn.Sigmoid())
            self.mode = mode

        def encode(self, x):
            h = self.enc(x)
            return self.mu(h), self.logvar(h)

        def forward(self, x):
            mu, lv = self.encode(x)
            z = mu + torch.randn_like(mu) * torch.exp(0.5 * lv) if (self.mode == "vae" and self.training) else mu
            return self.dec(z), mu, lv

    return VAE()


def run_vae(p: dict, emit, cancel, seed=42, out_dir=None) -> dict:
    import torch
    from sklearn.datasets import load_digits

    from .train_classic import Cancelled
    torch.manual_seed(seed)
    mode, epochs, beta, hidden = p.get("mode", "vae"), int(p.get("epochs", 60)), float(p.get("beta", 1.0)), int(p.get("hidden", 128))
    d = load_digits()
    X = (d.data / 16.0).astype(np.float32)
    y = d.target
    rng = np.random.default_rng(seed)
    perm = rng.permutation(len(X))
    Xt = torch.tensor(X[perm])
    net = _vae_net(hidden, mode)
    opt = torch.optim.Adam(net.parameters(), lr=2e-3)
    show = perm[:700]
    frames, t0 = [], time.time()
    every = max(1, epochs // 30)
    for ep in range(1, epochs + 1):
        if cancel is not None and cancel.is_set():
            raise Cancelled()
        net.train()
        tot_rec = tot_kl = 0.0
        for s in range(0, len(Xt), 128):
            xb = Xt[s:s + 128]
            out, mu, lv = net(xb)
            rec = torch.nn.functional.binary_cross_entropy(out, xb, reduction="sum") / len(xb)
            kl = (-0.5 * torch.sum(1 + lv - mu ** 2 - lv.exp()) / len(xb)) if mode == "vae" else torch.tensor(0.0)
            loss = rec + beta * kl
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot_rec += float(rec) * len(xb)
            tot_kl += float(kl) * len(xb)
        if ep == 1 or ep % every == 0 or ep == epochs:
            net.eval()
            with torch.no_grad():
                mu, _ = net.encode(torch.tensor(X[show]))
            fr = {"epoch": ep, "epochs": epochs, "recon": r(tot_rec / len(X), 3), "kl": r(tot_kl / len(X), 3),
                  "points": [[r(a, 3), r(b, 3), int(c)] for (a, b), c in zip(mu.numpy(), y[show])], "secs": r(time.time() - t0, 2)}
            frames.append(fr)
            emit("lab.frame", fr)
    net.eval()
    with torch.no_grad():
        mu_all, _ = net.encode(torch.tensor(X))
        mu_all = mu_all.numpy()
        lo, hi = np.percentile(mu_all, 2, 0), np.percentile(mu_all, 98, 0)
        n = 12
        xs, ys = np.linspace(lo[0], hi[0], n), np.linspace(hi[1], lo[1], n)
        zg = torch.tensor(np.array([[a, b] for b in ys for a in xs]), dtype=torch.float32)
        imgs = net.dec(zg).numpy()
        rec_idx = perm[:8]
        rec, _, _ = net(torch.tensor(X[rec_idx]))
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        torch.save({"state": net.state_dict(), "hidden": hidden, "mode": mode}, out_dir / "vae.pt")
    return {"lab": "vae", "mode": mode, "frames": frames, "extent": {"x": [r(lo[0], 3), r(hi[0], 3)], "y": [r(lo[1], 3), r(hi[1], 3)]},
            "grid": {"n": n, "images": [[r(v, 2) for v in im] for im in imgs]},
            "reconstructions": [{"digit": int(y[i]), "original": [r(v, 2) for v in X[i]], "rebuilt": [r(v, 2) for v in rb]}
                                for i, rb in zip(rec_idx, rec.numpy())]}


def vae_decode(run_dir, z: list) -> list:
    import torch
    ck = torch.load(run_dir / "vae.pt", weights_only=False)
    net = _vae_net(ck["hidden"], ck["mode"])
    net.load_state_dict(ck["state"])
    net.eval()
    with torch.no_grad():
        out = net.dec(torch.tensor(np.asarray(z, np.float32).reshape(-1, 2))).numpy()
    return [[r(v, 2) for v in im] for im in out]


# ----------------------------------------------------------------------------- transfer learning
def _small_cnn(n_out):
    from torch import nn
    feats = nn.Sequential(nn.Conv2d(1, 16, 3, padding=1), nn.BatchNorm2d(16), nn.ReLU(), nn.MaxPool2d(2),
                          nn.Conv2d(16, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2),
                          nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.AdaptiveAvgPool2d(1), nn.Flatten())
    return feats, nn.Linear(64, n_out)


def _gray(arr) -> np.ndarray:
    a = np.asarray(arr, np.float32)
    if a.ndim == 4:
        a = a.mean(-1)
    return (a / 255.0)[:, None, :, :] if a.max() > 1.5 else a[:, None, :, :]


def _pretrained(cache_dir, emit, seed=0):
    """A CNN trained once on 6000 synthetic shapes + arrows (cached on disk)."""
    import torch
    from torch import nn

    from .images import gen_arrows, gen_shapes
    path = cache_dir / "pretrained_shapes.pt"
    feats, _ = _small_cnn(1)
    if path.exists():
        feats.load_state_dict(torch.load(path, weights_only=False))
        return feats
    emit("log", {"level": "info", "message": "Pre-training the base network on 6,000 synthetic shapes and arrows (once, ~30 s)…"})
    a1, d1 = gen_shapes(3000, 32, seed=seed + 1)
    a2, d2 = gen_arrows(3000, 32, seed=seed + 2)
    l1, l2 = d1["label"].to_numpy(), d2["label"].to_numpy()
    X = np.concatenate([_gray(a1), _gray(a2)])
    labels = np.concatenate([np.asarray(l1).astype(str), np.char.add("arrow_", np.asarray(l2).astype(str))])
    classes = sorted(set(labels))
    y = np.array([classes.index(v) for v in labels])
    torch.manual_seed(seed)
    feats, head = _small_cnn(len(classes))
    model = nn.Sequential(feats, head)
    opt = torch.optim.Adam(model.parameters(), lr=2e-3)
    Xt, yt = torch.tensor(X), torch.tensor(y)
    for ep in range(6):
        perm = torch.randperm(len(Xt))
        for s in range(0, len(Xt), 128):
            b = perm[s:s + 128]
            opt.zero_grad()
            loss = nn.functional.cross_entropy(model(Xt[b]), yt[b])
            loss.backward()
            opt.step()
        emit("lab.pretrain", {"epoch": ep + 1, "epochs": 6, "loss": r(float(loss))})
    cache_dir.mkdir(parents=True, exist_ok=True)
    torch.save(feats.state_dict(), path)
    return feats


def run_transfer(p: dict, emit, cancel, seed=42, cache_dir=None) -> dict:
    import copy

    import torch
    from torch import nn

    from .images import gen_digits
    from .train_classic import Cancelled
    per_class, epochs = int(p.get("per_class", 5)), int(p.get("epochs", 40))
    arr, df = gen_digits(32, seed=seed)
    X = _gray(arr)
    y = df["label"].astype(int).to_numpy()
    rng = np.random.default_rng(seed)
    tr = np.concatenate([rng.choice(np.where(y == c)[0], per_class, replace=False) for c in range(10)])
    te = np.setdiff1d(np.arange(len(y)), tr)
    Xtr, ytr, Xte, yte = map(torch.tensor, (X[tr], y[tr], X[te], y[te]))
    base = _pretrained(cache_dir, emit)
    runs = {}
    show = te[:24]
    for name in ("scratch", "frozen", "finetune"):
        torch.manual_seed(seed)
        if name == "scratch":
            feats, head = _small_cnn(10)
        else:
            feats, head = copy.deepcopy(base), nn.Linear(64, 10)
        if name == "frozen":
            for q in feats.parameters():
                q.requires_grad = False
        params = [q for q in list(feats.parameters()) + list(head.parameters()) if q.requires_grad]
        opt = torch.optim.Adam(params, lr=3e-3 if name != "finetune" else 1e-3)
        model = nn.Sequential(feats, head)
        curve = []
        for ep in range(1, epochs + 1):
            if cancel is not None and cancel.is_set():
                raise Cancelled()
            model.train()
            if name == "frozen":
                feats.eval()  # keep the pre-trained batch-norm statistics
            perm = torch.randperm(len(Xtr))
            for s in range(0, len(Xtr), 32):
                b = perm[s:s + 32]
                opt.zero_grad()
                loss = nn.functional.cross_entropy(model(Xtr[b]), ytr[b])
                loss.backward()
                opt.step()
            model.eval()
            with torch.no_grad():
                acc = float((model(Xte).argmax(1) == yte).float().mean())
            pt = {"epoch": ep, "loss": r(float(loss)), "test_acc": r(acc, 4)}
            curve.append(pt)
            emit("lab.frame", {"run": name, **pt, "epochs": epochs})
        with torch.no_grad():
            pred = model(torch.tensor(X[show])).argmax(1).numpy()
        runs[name] = {"curve": curve, "final_acc": curve[-1]["test_acc"], "best_acc": max(c["test_acc"] for c in curve),
                      "trainable": int(sum(q.numel() for q in params)), "examples": [int(v) for v in pred]}
    from .images import png_data_uri
    imgs = [png_data_uri((X[i, 0] * 255).astype(np.uint8), 48) for i in show]
    return {"lab": "transfer", "per_class": per_class, "n_train": int(len(tr)), "n_test": int(len(te)), "runs": runs,
            "examples": [{"image": im, "label": int(y[i])} for im, i in zip(imgs, show)]}


def run_lab(payload: dict, emit, cancel) -> dict:
    from pathlib import Path
    lab, p = payload["lab"], payload.get("params") or {}
    seed = int(p.get("seed", 42))
    if lab == "gan":
        return run_gan(p, emit, cancel, seed)
    if lab == "vae":
        return run_vae(p, emit, cancel, seed, Path(payload["out_dir"]))
    if lab == "transfer":
        return run_transfer(p, emit, cancel, seed, Path(payload["cache_dir"]))
    raise ValueError(f"Unknown lab {lab}")
