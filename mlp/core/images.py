"""Image datasets: storage helpers, synthetic image sets, ZIP ingestion, preprocessing and previews.

Torch-free (numpy + PIL) so it can run in the API process. Images are stored as uint8 arrays N×H×W×C next to a
DataFrame with one row per image (column `label` for classification or `value` for regression).
"""
from __future__ import annotations

import base64
import io
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageOps

from .store import new_id

IMAGE_SETS = {
    "shapes": {"label": "Shapes", "task": "classification", "emoji": "🔺", "blurb": "Circles, squares, triangles and stars in random colours, sizes and places.",
               "params": {"n_images": 1500, "size": 32, "noise": 0.08}},
    "count_dots": {"label": "Count the dots", "task": "regression", "emoji": "🎲", "blurb": "Predict how many dots (1–9) are in each picture — regression from images.",
                   "params": {"n_images": 1500, "size": 32, "noise": 0.1}},
    "line_tilt": {"label": "Line tilt", "task": "regression", "emoji": "📐", "blurb": "Predict the angle of a line (−60° to 60°).",
                  "params": {"n_images": 1500, "size": 32, "noise": 0.1}},
    "digits": {"label": "Handwritten digits", "task": "classification", "emoji": "✍️", "blurb": "1,797 real 8×8 scans of digits 0–9 (upscaled).",
               "params": {"size": 32}},
    "arrows": {"label": "Arrow directions", "task": "classification", "emoji": "🧭", "blurb": "Arrows pointing up, down, left or right — position doesn't matter, direction does.",
               "params": {"n_images": 1500, "size": 32, "noise": 0.12}},
}

MAX_IMAGES = 20000
STORE_SIZE = 64


# ----------------------------------------------------------------------------- synthetic image sets
def _canvas(size, rng, noise):
    bg = rng.integers(0, 60, 3) if rng.random() < 0.5 else rng.integers(180, 256, 3)
    img = Image.new("RGB", (size * 2, size * 2), tuple(int(v) for v in bg))
    return img, bg


def _finish(img, size, rng, noise):
    img = img.resize((size, size), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    a += rng.normal(0, noise * 255, a.shape)
    return np.clip(a, 0, 255).astype(np.uint8)


def _contrast_colour(bg, rng):
    for _ in range(20):
        c = rng.integers(0, 256, 3)
        if np.abs(c.astype(int) - bg.astype(int)).sum() > 220:
            return tuple(int(v) for v in c)
    return (255, 255, 255) if bg.mean() < 128 else (0, 0, 0)


def _star(cx, cy, r, rot):
    pts = []
    for k in range(10):
        rr = r if k % 2 == 0 else r * 0.45
        a = rot + k * np.pi / 5
        pts.append((cx + rr * np.cos(a), cy + rr * np.sin(a)))
    return pts


def gen_shapes(n_images=1500, size=32, noise=0.15, seed=42, rotate=True, region="any"):
    """`rotate=False` draws every shape upright; `region="center"` keeps shapes near the middle (used by lessons)."""
    rng = np.random.default_rng(seed)
    classes = ["circle", "square", "triangle", "star"]
    imgs, labels = [], []
    S = size * 2
    for i in range(int(n_images)):
        cls = classes[i % 4]
        img, bg = _canvas(size, rng, noise)
        d = ImageDraw.Draw(img)
        col = _contrast_colour(bg, rng)
        r = rng.uniform(0.18, 0.32) * S
        if region == "center":
            cx, cy = S / 2 + rng.uniform(-0.06, 0.06) * S, S / 2 + rng.uniform(-0.06, 0.06) * S
        else:
            cx, cy = rng.uniform(r, S - r), rng.uniform(r, S - r)
        rot = rng.uniform(0, 2 * np.pi) if rotate else -np.pi / 2
        if cls == "circle":
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
        elif cls == "square":
            pts = [(cx + r * np.cos(rot + k * np.pi / 2), cy + r * np.sin(rot + k * np.pi / 2)) for k in range(4)]
            d.polygon(pts, fill=col)
        elif cls == "triangle":
            pts = [(cx + r * np.cos(rot + k * 2 * np.pi / 3), cy + r * np.sin(rot + k * 2 * np.pi / 3)) for k in range(3)]
            d.polygon(pts, fill=col)
        else:
            d.polygon(_star(cx, cy, r * 1.15, rot), fill=col)
        imgs.append(_finish(img, size, rng, noise))
        labels.append(cls)
    order = rng.permutation(len(imgs))
    return np.stack(imgs)[order], pd.DataFrame({"label": np.asarray(labels)[order]})


def gen_count_dots(n_images=1500, size=32, noise=0.1, seed=42):
    rng = np.random.default_rng(seed)
    imgs, counts = [], []
    S = size * 2
    for _ in range(int(n_images)):
        k = int(rng.integers(1, 10))
        img, bg = _canvas(size, rng, noise)
        d = ImageDraw.Draw(img)
        col = _contrast_colour(bg, rng)
        r = S * 0.055
        placed = []
        tries = 0
        while len(placed) < k and tries < 500:
            tries += 1
            x, y = rng.uniform(r, S - r), rng.uniform(r, S - r)
            if all((x - a) ** 2 + (y - b) ** 2 > (2.6 * r) ** 2 for a, b in placed):
                placed.append((x, y))
                d.ellipse([x - r, y - r, x + r, y + r], fill=col)
        imgs.append(_finish(img, size, rng, noise))
        counts.append(len(placed))
    return np.stack(imgs), pd.DataFrame({"value": np.asarray(counts, float)})


def gen_line_tilt(n_images=1500, size=32, noise=0.1, seed=42):
    rng = np.random.default_rng(seed)
    imgs, angles = [], []
    S = size * 2
    for _ in range(int(n_images)):
        ang = rng.uniform(-60, 60)
        img, bg = _canvas(size, rng, noise)
        d = ImageDraw.Draw(img)
        col = _contrast_colour(bg, rng)
        L = rng.uniform(0.3, 0.45) * S
        cx, cy = S / 2 + rng.uniform(-0.12, 0.12) * S, S / 2 + rng.uniform(-0.12, 0.12) * S
        t = np.deg2rad(ang)
        d.line([(cx - L * np.cos(t), cy + L * np.sin(t)), (cx + L * np.cos(t), cy - L * np.sin(t))], fill=col, width=max(2, S // 16))
        imgs.append(_finish(img, size, rng, noise))
        angles.append(round(ang, 1))
    return np.stack(imgs), pd.DataFrame({"value": np.asarray(angles, float)})


def gen_arrows(n_images=1500, size=32, noise=0.12, seed=42):
    rng = np.random.default_rng(seed)
    dirs = {"right": 0, "up": 90, "left": 180, "down": 270}
    names = list(dirs)
    imgs, labels = [], []
    S = size * 2
    for i in range(int(n_images)):
        name = names[i % 4]
        img, bg = _canvas(size, rng, noise)
        d = ImageDraw.Draw(img)
        col = _contrast_colour(bg, rng)
        L = rng.uniform(0.22, 0.32) * S
        cx, cy = rng.uniform(L + 4, S - L - 4), rng.uniform(L + 4, S - L - 4)
        t = np.deg2rad(dirs[name] + rng.uniform(-12, 12))
        ux, uy = np.cos(t), -np.sin(t)
        tip = (cx + L * ux, cy + L * uy)
        d.line([(cx - L * ux, cy - L * uy), tip], fill=col, width=max(2, S // 14))
        hx, hy = -uy, ux
        d.polygon([(tip[0] + 0.35 * L * ux, tip[1] + 0.35 * L * uy), (tip[0] + 0.35 * L * hx, tip[1] + 0.35 * L * hy),
                   (tip[0] - 0.35 * L * hx, tip[1] - 0.35 * L * hy)], fill=col)
        imgs.append(_finish(img, size, rng, noise))
        labels.append(name)
    order = rng.permutation(len(imgs))
    return np.stack(imgs)[order], pd.DataFrame({"label": np.asarray(labels)[order]})


def gen_digits(size=32, seed=42):
    from sklearn.datasets import load_digits
    b = load_digits()
    imgs = []
    for a in b.images:
        g = Image.fromarray((a / 16 * 255).astype(np.uint8), "L").resize((size, size), Image.BILINEAR)
        imgs.append(np.repeat(np.asarray(g)[:, :, None], 3, axis=2))
    return np.stack(imgs), pd.DataFrame({"label": b.target.astype(str)})


GENERATORS = {"shapes": gen_shapes, "count_dots": gen_count_dots, "line_tilt": gen_line_tilt, "arrows": gen_arrows, "digits": gen_digits}


def generate(name: str, params: dict | None = None, seed: int = 42):
    if name not in GENERATORS:
        raise ValueError(f"Unknown image set '{name}'")
    p = {**IMAGE_SETS[name]["params"], **(params or {})}
    if "n_images" in p:
        p["n_images"] = max(40, min(int(p["n_images"]), 10000))
    p["size"] = max(16, min(int(p.get("size", 32)), 64))
    arr, df = GENERATORS[name](**p, seed=seed)
    task = IMAGE_SETS[name]["task"]
    meta = {"name": IMAGE_SETS[name]["label"], "source": "image_set", "image_set": name}
    return arr, df, task, meta


# ----------------------------------------------------------------------------- ZIP upload
IMG_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tif", ".tiff"}


def _load_image(data: bytes, size: int) -> np.ndarray:
    im = Image.open(io.BytesIO(data))
    im = ImageOps.exif_transpose(im).convert("RGB")
    im = ImageOps.fit(im, (size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.uint8)


def read_zip(path: Path, size: int = STORE_SIZE):
    """Class-per-folder ZIP, or any layout plus a labels CSV (filename,label or filename,value)."""
    warnings = []
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if not n.endswith("/") and "__MACOSX" not in n and not Path(n).name.startswith(".")]
        csvs = [n for n in names if n.lower().endswith(".csv")]
        imgs = [n for n in names if Path(n).suffix.lower() in IMG_EXT]
        if not imgs:
            raise ValueError("No images found in the ZIP (png, jpg, bmp, gif, webp, tif).")
        if len(imgs) > MAX_IMAGES:
            warnings.append(f"Only the first {MAX_IMAGES} of {len(imgs)} images were used.")
            imgs = imgs[:MAX_IMAGES]
        labels: dict[str, object] = {}
        label_kind = "folders"
        if csvs:
            lab = pd.read_csv(io.BytesIO(z.read(csvs[0])))
            fcol = lab.columns[0]
            vcol = lab.columns[1] if lab.shape[1] > 1 else None
            if vcol is None:
                raise ValueError("The labels CSV needs two columns: filename and label (or value).")
            for f, v in zip(lab[fcol].astype(str), lab[vcol]):
                labels[Path(f).name] = v
            label_kind = "csv"
        arrays, rows = [], []
        for n in imgs:
            key = Path(n).name
            if label_kind == "csv":
                if key not in labels:
                    continue
                y = labels[key]
            else:
                parts = Path(n).parts
                if len(parts) < 2:
                    continue
                y = parts[-2]
            try:
                arrays.append(_load_image(z.read(n), size))
            except Exception:  # noqa: BLE001 - skip unreadable files but report them
                warnings.append(f"Skipped unreadable image {key}.")
                continue
            rows.append({"file": key, "label": y})
    if not arrays:
        raise ValueError("No labelled images found. Use one folder per class, or include a labels CSV (filename,label).")
    df = pd.DataFrame(rows)
    numeric = pd.to_numeric(df["label"], errors="coerce")
    task = "regression" if numeric.notna().all() and df["label"].nunique() > 15 else "classification"
    if task == "regression":
        df = df.rename(columns={"label": "value"})
        df["value"] = numeric
    else:
        df["label"] = df["label"].astype(str)
    return np.stack(arrays), df, task, warnings


# ----------------------------------------------------------------------------- preprocessing
class ImagePreprocessor:
    """Image (uint8 H×W×C, any size) → flat float vector at the training resolution. Duck-types Preprocessor."""

    def __init__(self, size: int, grayscale: bool, task: str, target: str):
        self.size, self.grayscale, self.task, self.target = int(size), bool(grayscale), task, target
        self.channels = 1 if grayscale else 3
        self.label_encoder = None
        self.target_transform = "none"
        self.input_schema: list[dict] = []
        self.feature_names_out: list[str] = []
        self.fe_steps: list = []
        self.modality = "image"

    @property
    def image_shape(self):
        return [self.channels, self.size, self.size]

    def images_to_matrix(self, arr: np.ndarray) -> np.ndarray:
        out = np.empty((len(arr), self.channels * self.size * self.size), dtype=np.float32)
        for i, a in enumerate(arr):
            im = Image.fromarray(np.asarray(a, dtype=np.uint8))
            if im.size != (self.size, self.size):
                im = im.resize((self.size, self.size), Image.BILINEAR)
            if self.grayscale:
                v = np.asarray(im.convert("L"), dtype=np.float32)[None]
            else:
                v = np.asarray(im.convert("RGB"), dtype=np.float32).transpose(2, 0, 1)
            out[i] = (v / 255.0).reshape(-1)
        return out

    def transform(self, x) -> np.ndarray:
        if isinstance(x, np.ndarray) and x.ndim == 2 and x.shape[1] == self.channels * self.size * self.size:
            return x.astype(np.float32)
        if isinstance(x, pd.DataFrame):
            raise ValueError("This model takes images, not table rows.")
        return self.images_to_matrix(x if isinstance(x, list) else np.asarray(x))

    def encode_y(self, y):
        y = pd.Series(y)
        if self.task == "classification":
            return self.label_encoder.transform(y.astype(str)).astype(np.int64)
        return pd.to_numeric(y, errors="coerce").to_numpy(dtype=float)

    def decode_y(self, y):
        y = np.asarray(y)
        return self.label_encoder.inverse_transform(y.astype(int)) if self.task == "classification" else y

    @property
    def classes(self):
        return [str(c) for c in self.label_encoder.classes_] if self.label_encoder is not None else None


def decode_data_uri(uri: str) -> np.ndarray:
    data = base64.b64decode(uri.split(",", 1)[1] if "," in uri else uri)
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    return np.asarray(im, dtype=np.uint8)


def png_data_uri(arr: np.ndarray, size: int | None = None) -> str:
    im = Image.fromarray(np.asarray(arr, dtype=np.uint8))
    if size:
        im = im.resize((size, size), Image.NEAREST if im.size[0] <= 16 else Image.BILINEAR)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def png_bytes(arr: np.ndarray, size: int | None = None) -> bytes:
    im = Image.fromarray(np.asarray(arr, dtype=np.uint8))
    if size and im.size != (size, size):
        im = im.resize((size, size), Image.NEAREST if im.size[0] < size else Image.BILINEAR)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


# ----------------------------------------------------------------------------- augmentation preview (numpy/PIL)
def augment_np(a: np.ndarray, cfg: dict, rng) -> np.ndarray:
    im = Image.fromarray(a)
    if cfg.get("flip_h") and rng.random() < 0.5:
        im = ImageOps.mirror(im)
    if cfg.get("flip_v") and rng.random() < 0.5:
        im = ImageOps.flip(im)
    rot = float(cfg.get("rotate") or 0)
    if rot:
        im = im.rotate(rng.uniform(-rot, rot), resample=Image.BILINEAR, fillcolor=tuple(int(v) for v in np.asarray(im)[0, 0]))
    shift = float(cfg.get("shift") or 0)
    if shift:
        w = im.size[0]
        dx, dy = (rng.uniform(-shift, shift, 2) * w).astype(int)
        im = im.transform(im.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), fillcolor=tuple(int(v) for v in np.asarray(im)[0, 0]))
    out = np.asarray(im).astype(np.float32)
    b = float(cfg.get("brightness") or 0)
    if b:
        out = out * rng.uniform(1 - b, 1 + b) + rng.uniform(-b, b) * 60
    if cfg.get("cutout"):
        h = out.shape[0]
        s = max(2, h // 4)
        y, x = rng.integers(0, h - s), rng.integers(0, h - s)
        out[y:y + s, x:x + s] = out.mean()
    return np.clip(out, 0, 255).astype(np.uint8)


def augment_preview(arr: np.ndarray, idx: list[int], cfg: dict, variants: int = 5, size: int = 64) -> list[dict]:
    rng = np.random.default_rng(0)
    out = []
    for i in idx:
        a = np.asarray(arr[i])
        out.append({"i": int(i), "original": png_data_uri(a, size),
                    "variants": [png_data_uri(augment_np(a, cfg, rng), size) for _ in range(variants)]})
    return out


def prepare_images(arr: np.ndarray, df: pd.DataFrame, spec: dict, dataset_id: str):
    """Image counterpart of pipeline.prepare: resize/grayscale → flat matrices, stratified split, augmentation config."""
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder

    from .pipeline import Prepared
    task, target = spec["task"], spec["target"]
    img = {"size": 32, "grayscale": False, "augment": {}, **(spec.get("image") or {})}
    sp = {"test_size": 0.2, "val_size": 0.1, "seed": 42, **(spec.get("split") or {})}
    pp = ImagePreprocessor(img["size"], img["grayscale"], task, target)
    y_raw = df[target]
    keep = y_raw.notna().to_numpy()
    if task == "classification":
        pp.label_encoder = LabelEncoder().fit(y_raw[keep].astype(str))
        if len(pp.classes) < 2:
            raise ValueError("Need at least two classes of images.")
    idx_all = np.where(keep)[0]
    y_all = pp.encode_y(y_raw.iloc[idx_all])
    seed = int(sp["seed"])
    strat = y_all if task == "classification" and np.bincount(y_all).min() >= 3 else None
    tr, te = train_test_split(np.arange(len(idx_all)), test_size=float(sp["test_size"]), random_state=seed, stratify=strat)
    va = np.array([], dtype=int)
    if float(sp["val_size"]) > 0:
        rel = float(sp["val_size"]) / (1 - float(sp["test_size"]))
        tr, va = train_test_split(tr, test_size=rel, random_state=seed, stratify=strat[tr] if strat is not None else None)
    X = pp.images_to_matrix(arr[idx_all])
    pp.feature_names_out = [f"px{i}" for i in range(X.shape[1])]
    classes = pp.classes
    counts = (lambda ix: {classes[int(k)]: int(v) for k, v in zip(*np.unique(y_all[ix], return_counts=True))}) if classes else (lambda ix: None)
    rng = np.random.default_rng(seed)
    sample = [int(idx_all[i]) for i in rng.choice(tr, min(6, len(tr)), replace=False)]
    report = {
        "modality": "image", "task": task, "classes": classes,
        "splits": {"train": int(len(tr)), "train_before_resample": int(len(tr)), "val": int(len(va)), "test": int(len(te))},
        "class_counts_before": counts(tr), "class_counts_after": counts(tr), "class_counts_test": counts(te), "class_counts_val": counts(va) if len(va) else None,
        "added": 0, "removed": 0, "outliers_removed": 0, "before_points": [], "after_points": [],
        "feature_names_out": [], "n_features": int(X.shape[1]), "numeric_columns": [], "categorical_columns": [],
        "warnings": [], "image_shape": pp.image_shape, "duplicates_found": 0, "features_created": [],
        "split_info": {"method": "random"},
        "augment_preview": augment_preview(arr, sample[:4], img["augment"]) if any(img["augment"].values()) else [],
        "sample_images": sample,
    }
    if task == "regression":
        report["target_hist_train"] = {"values": [float(v) for v in y_all[tr][:1200]]}
    prepared = Prepared(id=new_id("pr"), task=task, target=target, dataset_id=dataset_id, spec=spec, preprocessor=pp,
                        X_train=X[tr], y_train=y_all[tr], X_val=X[va], y_val=y_all[va], X_test=X[te], y_test=y_all[te],
                        feature_names=pp.feature_names_out, classes=classes, image_shape=pp.image_shape, report=report,
                        X_train_orig=X[tr], y_train_orig=y_all[tr], modality="image",
                        payload={"augment": img["augment"], "idx_train": idx_all[tr].tolist(), "idx_val": idx_all[va].tolist(),
                                 "idx_test": idx_all[te].tolist()})
    report["prepared_id"] = prepared.id
    return prepared
