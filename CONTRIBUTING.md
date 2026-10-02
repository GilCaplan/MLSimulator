# Contributing

Thanks for helping! ML Playground is licensed under [PolyForm Noncommercial 1.0.0](LICENSE). By contributing you
agree that your contribution is provided under the same license.

## Development setup
```sh
zsh scripts/setup.sh                 # or follow the manual steps in the README
zsh scripts/dev.sh                   # backend on :8765 + Vite dev server on :5173 (hot reload, proxies /api)
```

## Checks before a pull request
```sh
cd frontend && npx tsc --noEmit -p tsconfig.json && npx vite build && cd ..
PYTHONPATH=. .venv/bin/python scripts/smoke_models.py          # trains every model family
PYTHONPATH=. .venv/bin/python scripts/validate_lessons.py      # every lesson challenge is present + solvable
MLP_DATA_DIR=/tmp/mlp-test .venv/bin/python -m mlp.main --port 8799 &
.venv/bin/python scripts/smoke_api.py 8799 && .venv/bin/python scripts/smoke_lessons.py 8799
```
Use `MLP_DATA_DIR` for test servers so your own `data/` folder stays clean.

## Ground rules
- **Never import `torch` in the same process as `xgboost`/`lightgbm`.** The API process imports neither; heavy work
  goes through `core/procs.py` workers (see [Architecture](docs/ARCHITECTURE.md)).
- **Plain language first.** Every new concept needs a one-line explanation in the UI (and an ⓘ tooltip for depth).
- **Match the design system.** Use the `components/glass` and `components/charts` building blocks and the CSS
  variables in `design/tokens.css` (light and dark themes must both work).
- **Keep it local and fast.** Small datasets, sensible caps, and no network calls during normal use.
- Write code that reads like the surrounding code.

## Workflow guides
- [Adding a model](docs/workflows/adding_a_model.md)
- [Adding a dataset (sample / preset)](docs/workflows/adding_a_dataset.md)
- [Adding a lesson](docs/lessons_workflow.md)
- [Release checklist](docs/workflows/release.md)
