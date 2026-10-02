# Workflow: adding a dataset

## A built-in sample (realistic data, one click)
1. In `mlp/core/synthetic.py`, add an entry to `SAMPLES` (`label`, `task`, `blurb`, `emoji`).
2. Implement it in `load_sample(name)`: return `(df, meta)` with `meta["target_hint"]` set. Prefer deterministic
   generators (`np.random.default_rng(seed)`) or data bundled with scikit-learn. Avoid network downloads.
3. Keep it small (≤ 10k rows) so training stays fast on a laptop.

## A toy preset (shapes with sliders)
1. Add to `PRESETS` with default `params` (they become sliders in the UI).
2. Implement it in `generate_preset()`; return columns `x1…xn` and `target`.

## A quick-start template (home page)
Add it to `frontend/src/components/home/templateData.ts`: the sample or preset, task, and pre-selected models.

## Verify
Load it from the Data step, check the profile (class balance, bird's-eye view), then prepare and train.
