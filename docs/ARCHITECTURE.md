# Architecture

```
┌─────────────── Browser (React + TypeScript + framer-motion) ───────────────┐
│  wizard pages · lessons · library · settings      zustand stores · SSE      │
└───────────────────────────────▲─────────────────────────────────────────────┘
                                │ HTTP /api/*  +  Server-Sent Events
┌───────────────────────────────┴─ FastAPI (python -m mlp.main) ──────────────┐
│ api/  system · projects · datasets · train · library · lessons              │
│ core/ store · profile · synthetic · features · pipeline · coach · jobs      │
│       (never imports torch, xgboost or lightgbm)                            │
│        │ JobManager thread ──spawn──▶ training process (one per model)      │
│        │                                 family "classic": sklearn/xgb/lgbm │
│        │                                 family "torch":   PyTorch nets     │
│        └ prediction servers (long-lived): one "classic", one "torch"        │
└─────────────────────────────────────────────────────────────────────────────┘
   data/  projects/*.json · datasets/<id>/{frame.pkl,meta.json} · prepared/*.pkl
          jobs/<id>/{result.json, <model>.joblib} · library/<id>/{model,preprocessor}.joblib
          lessons/progress.json · logs/ · run/server.json
```

## Why separate processes?
On macOS, PyTorch and XGBoost/LightGBM each ship their own OpenMP runtime, and loading both in one process
segfaults. So the API process imports neither of them. Each model trains in a fresh process of its family, and
predictions for saved models go through one long-lived process per family. This also keeps the API responsive during
heavy training, lets **Stop** terminate a stuck fit, and keeps a crash in one model from taking down the server.

## Backend modules (`mlp/`)
| Module | Role |
|---|---|
| `main.py`, `app.py` | Entry point (uvicorn), router registration, SPA serving, `server.json` for the launcher |
| `core/store.py` | Disk stores for projects (JSON), datasets (pickle + meta) and prepared data |
| `core/profile.py` | Column roles (numeric / categorical / id / text / datetime), histograms, projections |
| `core/synthetic.py` | Sample datasets, toy presets, the synthetic designer (distributions + target rules) |
| `core/features.py` | Feature engineering steps (stateless ops + train-fitted buckets), re-applied at predict time |
| `core/pipeline.py` | `prepare()`: spec → `Preprocessor` (picklable) + train/val/test matrices + resampling report |
| `core/registry.py` | Model catalogue with plain-language hyperparameter schemas (the UI renders forms from it) |
| `core/train_classic.py` | Fitting with live progress/curves, cross-validation, optional calibration |
| `core/train_nn.py`, `core/nn/` | PyTorch training loop; architecture JSON → module (MLP, CNN 1-D/2-D, FT-Transformer, GCN) |
| `core/evaluate.py` | Metrics, ROC/PR, confusion, residuals, importance, decision surfaces, calibration, mistakes, slices |
| `core/trainer.py`, `core/jobs.py`, `core/procs.py`, `core/worker.py` | Jobs, SSE events, process management |
| `core/coach.py` | Rule-based suggestions with one-click actions |
| `core/library.py` | Saving, predicting, what-if curves, batch predictions, export |
| `core/ports.py` | Free-port scan and live port hand-off |
| `lessons/` | Lesson content, synthetic challenge generators, hidden-test grading |

## Frontend (`frontend/src/`)
| Folder | Role |
|---|---|
| `lib/` | API client, shared types (mirror the backend), stores (project with autosave, live job stream, UI prefs), router |
| `design/` | "Liquid Glass" tokens (CSS variables, light/dark) and motion presets |
| `components/glass/` | Glass panels, sliders, segmented controls, toggles, modals, toasts… |
| `components/charts/` | Hand-rolled SVG/canvas charts (histogram, scatter, line, confusion, ROC, decision surface…) |
| `components/shell/` | App shell, wizard stepper, step layout, coach panel |
| `components/<area>/` + `pages/` | One folder per screen: home, models, data, prepare, train, improve, library, settings, lessons |

## Key flows
1. **Prepare:** `POST /api/datasets/{id}/prepare` builds a `Prepared` object and stores it. The response holds the
   report used by the animations.
2. **Train:** `POST /api/jobs/train` queues a job. The job thread runs one child process per model and relays events
   (epochs, iterations, CV folds, weight snapshots) to `GET /api/jobs/{id}/events` (SSE). The result is persisted with
   the fitted models.
3. **Save and predict:** the library copies the fitted model and the preprocessor. The prediction server loads both
   and applies feature engineering, imputation, encoding, scaling and selection, then the model.
4. **Lesson check:** `POST /api/lessons/{id}/check` runs a trained model on the lesson's hidden test set and grades
   the goals.

## Launcher (`launcher/`)
`build_app.sh` creates `ML Playground.app`, a tiny shell-script bundle with a generated icon. On each launch it
either reuses a healthy running server (via `data/run/server.json`) or does first-run setup, finds a free port, starts
the server and opens the browser.
