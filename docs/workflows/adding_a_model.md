# Workflow: adding a model

## Classic (scikit-learn compatible)
1. **Registry** (`mlp/core/registry.py`): add an entry to `MODELS`: `id`, `label`, `family`, `tasks`, `emoji`, a
   one-sentence plain-language `description`, and `params` built with `P(name, label, type, default, help, min=, max=,
   step=, log=, options=)`. The UI renders the settings form from this schema automatically.
2. **Factory** (`build_estimator`): construct the estimator from `p` (merged defaults + user params). Import inside
   the branch so the API process stays light.
3. **Progress (optional)** (`mlp/core/train_classic.py`): stream progress/curves through `emit("iteration", …)` if
   the library supports callbacks or `warm_start`.
4. **Coach (optional)** (`mlp/core/coach.py`): add `_regularize` / `_grow` patches so overfitting/underfitting tips
   have one-click fixes.
5. **Verify**: `PYTHONPATH=. .venv/bin/python scripts/smoke_models.py`. The model shows up in the Models gallery for
   its tasks.

## Neural network (PyTorch)
1. **Architecture** (`mlp/core/nn/builder.py`): add a `kind` to `build()` / `summarize()`.
2. **Registry**: add an entry with `nn: True`, `arch_kind`, `default_arch` and `params: NN_TRAIN_PARAMS`.
   `nn: True` routes training and prediction to the torch worker process.
3. **UI**: extend `components/models/ArchBuilders.tsx` and `components/nn/NetworkDiagram.tsx` (`archToLayers`).
4. **Verify**: `smoke_models.py`, then train it from the UI and save and predict from the library.
