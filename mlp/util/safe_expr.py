"""A tiny, safe, vectorised expression evaluator used for synthetic targets.

Only arithmetic, comparisons, boolean logic, feature names, numeric/string
constants and a whitelist of functions are permitted.
"""
from __future__ import annotations

import ast
import operator

import numpy as np


class ExprError(ValueError):
    pass


_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv}
_CMP = {ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt, ast.LtE: operator.le,
        ast.Gt: operator.gt, ast.GtE: operator.ge}

FUNCTIONS_HELP = {
    "sin(x)": "sine", "cos(x)": "cosine", "tanh(x)": "squash to (-1, 1)", "exp(x)": "exponential",
    "log(x)": "natural log (of |x|)", "abs(x)": "absolute value", "sqrt(x)": "square root (of |x|)",
    "sigmoid(x)": "squash to (0, 1)", "where(cond, a, b)": "a if cond else b", "noise(std)": "random normal noise",
    "step(x, t)": "1 if x > t else 0", "min(a, b)": "smaller", "max(a, b)": "larger", "clip(x, lo, hi)": "limit range",
}


def evaluate(expr: str, env: dict, n: int, rng: np.random.Generator) -> np.ndarray:
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError as e:
        raise ExprError(f"Could not read the formula: {e.msg}") from None

    def f_noise(std=1.0):
        return rng.normal(0.0, float(np.mean(std)), n)

    funcs = {
        "sin": np.sin, "cos": np.cos, "tanh": np.tanh, "exp": lambda x: np.exp(np.clip(x, -50, 50)),
        "log": lambda x: np.log(np.abs(x) + 1e-9), "abs": np.abs, "sqrt": lambda x: np.sqrt(np.abs(x)),
        "sigmoid": lambda x: 1 / (1 + np.exp(-np.clip(x, -50, 50))),
        "where": lambda c, a, b: np.where(np.asarray(c) > 0, a, b), "noise": f_noise,
        "step": lambda x, t=0.0: (np.asarray(x) > t).astype(float),
        "min": np.minimum, "max": np.maximum, "clip": np.clip,
    }
    consts = {"pi": np.pi, "e": np.e}

    def ev(node):
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float, str, bool)):
                return node.value
            raise ExprError("Unsupported constant")
        if isinstance(node, ast.Name):
            if node.id in env:
                return env[node.id]
            if node.id in consts:
                return consts[node.id]
            raise ExprError(f"Unknown name '{node.id}'. Use one of your feature names.")
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
            a, b = _num(ev(node.left)), _num(ev(node.right))
            with np.errstate(all="ignore"):
                return _BIN[type(node.op)](a, b)
        if isinstance(node, ast.UnaryOp):
            v = ev(node.operand)
            if isinstance(node.op, ast.USub):
                return -_num(v)
            if isinstance(node.op, ast.UAdd):
                return _num(v)
            if isinstance(node.op, ast.Not):
                return (~(np.asarray(_num(v)) > 0)).astype(float)
        if isinstance(node, ast.Compare):
            left = ev(node.left)
            result = None
            for op, comp in zip(node.ops, node.comparators):
                right = ev(comp)
                if type(op) not in _CMP:
                    raise ExprError("Unsupported comparison")
                cur = np.asarray(_CMP[type(op)](np.asarray(left), right))
                result = cur if result is None else (result & cur)
                left = right
            return result.astype(float)
        if isinstance(node, ast.BoolOp):
            vals = [np.asarray(_num(ev(v))) > 0 for v in node.values]
            fn = np.logical_and if isinstance(node.op, ast.And) else np.logical_or
            out = vals[0]
            for v in vals[1:]:
                out = fn(out, v)
            return out.astype(float)
        if isinstance(node, ast.IfExp):
            return np.where(np.asarray(_num(ev(node.test))) > 0, _num(ev(node.body)), _num(ev(node.orelse)))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
            if node.func.id not in funcs:
                raise ExprError(f"Function '{node.func.id}' is not available.")
            return funcs[node.func.id](*[_num(ev(a)) for a in node.args])
        raise ExprError("That formula uses something that isn't allowed.")

    out = _num(ev(tree.body))
    out = np.asarray(out, dtype=float)
    if out.ndim == 0:
        out = np.full(n, float(out))
    return np.nan_to_num(out, nan=0.0, posinf=1e6, neginf=-1e6)


def _num(v):
    if isinstance(v, str):
        return v
    a = np.asarray(v)
    if a.dtype == bool:
        return a.astype(float)
    if a.dtype.kind in "OUT":  # categorical arrays: only usable in comparisons
        return a
    return v
