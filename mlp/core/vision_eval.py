"""Vision-specific evaluation: mistakes gallery, saliency maps, first-layer filters, feature maps, pixel importance.

Torch is imported lazily and only for torch models (this module is also importable from the API process).
"""
from __future__ import annotations

import numpy as np

from ..util.jsonable import r


def _grid(a: np.ndarray, nd: int = 2) -> list:
    return [[r(v, nd) for v in row] for row in a]


def _norm01(a: np.ndarray) -> np.ndarray:
    lo, hi = float(a.min()), float(a.max())
    return (a - lo) / (hi - lo) if hi > lo else np.zeros_like(a)


def vision_extras(model, prepared, pred, proba) -> dict:
    shape = prepared.image_shape
    c, h, w = shape
    idx_test = np.asarray((prepared.payload or {}).get("idx_test", []))
    y = prepared.y_test
    out: dict = {"image_shape": shape, "dataset_id": prepared.dataset_id}
    pp = prepared.preprocessor
    if prepared.task == "classification":
        conf = proba.max(1) if proba is not None else np.ones(len(y))
        wrong = np.where(pred != y)[0]
        right = np.where(pred == y)[0]
        out["mistakes"] = [{"i": int(idx_test[k]), "true": prepared.classes[int(y[k])], "pred": prepared.classes[int(pred[k])],
                            "confidence": r(conf[k], 3)} for k in wrong[np.argsort(-conf[wrong])][:24]]
        out["correct"] = [{"i": int(idx_test[k]), "true": prepared.classes[int(y[k])], "pred": prepared.classes[int(pred[k])],
                           "confidence": r(conf[k], 3)} for k in right[np.argsort(-conf[right])][:12]]
        picks = list(wrong[:3]) + list(right[:6 - min(3, len(wrong))])
    else:
        yt, yp = pp.decode_y(y), pp.decode_y(pred)
        err = yp - yt
        order = np.argsort(-np.abs(err))
        out["mistakes"] = [{"i": int(idx_test[k]), "true": r(yt[k], 3), "pred": r(yp[k], 3), "error": r(err[k], 3)} for k in order[:24]]
        out["correct"] = [{"i": int(idx_test[k]), "true": r(yt[k], 3), "pred": r(yp[k], 3), "error": r(err[k], 3)} for k in order[::-1][:12]]
        picks = list(order[:3]) + list(order[::-1][:3])
    # pixel importance for classic models
    imp = None
    if hasattr(model, "feature_importances_"):
        imp = np.asarray(model.feature_importances_, float)
    elif hasattr(model, "coef_"):
        cf = np.asarray(model.coef_, float)
        imp = np.abs(cf).mean(0) if cf.ndim > 1 else np.abs(cf)
    if imp is not None and imp.size == c * h * w:
        out["pixel_importance"] = _grid(_norm01(imp.reshape(c, h, w).sum(0)))
    if hasattr(model, "module"):
        try:
            out.update(_torch_extras(model, prepared, [int(k) for k in picks]))
        except Exception as e:  # noqa: BLE001 - visuals are a bonus, never fail evaluation
            out["note"] = f"Visual explanations unavailable: {e}"
    return out


def _torch_extras(model, prepared, picks) -> dict:
    import torch
    from torch import nn
    m = model.module()
    c, h, w = prepared.image_shape
    X = torch.tensor(prepared.X_test[picks], dtype=torch.float32, requires_grad=True)
    out_t = m(X)
    if model.task == "classification":
        sel = out_t.gather(1, out_t.argmax(1, keepdim=True)).sum()
    else:
        sel = out_t[:, 0].sum()
    sel.backward()
    g = X.grad.detach().abs().reshape(len(picks), c, h, w).amax(1).numpy()
    idx_test = np.asarray((prepared.payload or {}).get("idx_test", []))
    sal = [{"i": int(idx_test[k]), "heat": _grid(_norm01(g[j]))} for j, k in enumerate(picks)]
    res = {"saliency": sal}
    convs = [mod for mod in m.modules() if isinstance(mod, nn.Conv2d)]
    if convs:
        W = convs[0].weight.detach().numpy()[:16]
        res["filters"] = [{"gray": _grid(_norm01(f.mean(0))), **({"rgb": [[[r(v, 2) for v in px] for px in row] for row in _norm01(f).transpose(1, 2, 0)]} if f.shape[0] == 3 else {})} for f in W]
        acts = {}
        hook = convs[0].register_forward_hook(lambda _m, _i, o: acts.setdefault("a", o.detach()))
        with torch.no_grad():
            m(torch.tensor(prepared.X_test[picks[:1]], dtype=torch.float32))
        hook.remove()
        a = acts["a"][0].numpy()[:8]
        step = max(1, a.shape[1] // 16)
        res["feature_maps"] = {"i": int(idx_test[picks[0]]), "maps": [_grid(_norm01(fm[::step, ::step])) for fm in a]}
    return res
