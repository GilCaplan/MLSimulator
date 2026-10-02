"""The API process must never import torch, xgboost or lightgbm (their OpenMP runtimes clash on macOS)."""
import subprocess
import sys

CODE = """
import sys
import mlp.app as a
a.create_app()
import mlp.api.datasets, mlp.api.train, mlp.api.library, mlp.api.lessons, mlp.core.pipeline, mlp.core.coach
bad = [m for m in ("torch", "xgboost", "lightgbm") if m in sys.modules]
assert not bad, f"API process imported {bad}"
print("ok")
"""


def test_api_process_stays_clean():
    out = subprocess.run([sys.executable, "-c", CODE], capture_output=True, text=True, cwd=".")
    assert out.returncode == 0, out.stderr
    assert "ok" in out.stdout


if __name__ == "__main__":
    test_api_process_stays_clean()
    print("process isolation ok")
