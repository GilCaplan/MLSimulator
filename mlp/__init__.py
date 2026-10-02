"""ML Playground backend.

The API process never imports torch, xgboost or lightgbm. Training and prediction
run in worker processes split by family ("torch" vs "classic") because those
libraries ship incompatible OpenMP runtimes on macOS that crash when mixed.
"""
import os

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
