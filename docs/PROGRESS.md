# Build progress & resume checkpoint

_Last updated: 2026-10-01 (session 1). If a session ends mid-task, start here._

## Done
- v1 app: tabular classification/regression wizard, 17 classic models + 5 PyTorch nets, synthetic/sample/upload data,
  preprocessing incl. resampling, live training (SSE), coach, tuning, library + prediction playground, port switching,
  macOS launcher (`launcher/build_app.sh`), glass UI.
- Lessons v1: 8 lessons (missing, outliers, leakage, scaling, imbalance, overfitting, shortcut, fairness) — validated.
- Batch 2 backend (done): baseline row in every run, group/time splits, dedupe, datetime role, feature engineering
  (`mlp/core/features.py`, `POST /datasets/{id}/features/preview`), calibration/mistakes/slices in evaluation,
  `options.calibrate`, coach rules, categorical-NaN bug fix.

## In progress (batch 2)
- Frontend agents: Prepare (splits/dedupe/Create-features stage), Train (baseline row, Mistakes + Calibration tabs,
  calibrate option, challenge metrics, library datetime inputs), demos for 4 new lessons.
- New lessons `baselines`, `splits`, `features`, `calibration`: generators + grading in `mlp/lessons/`; still need
  calibration of `splits` goal, catalog content in `mlp/lessons/catalog.py`, end-to-end check, docs table update.

## Next
1. Finish batch 2 → validate (`scripts/validate_lessons.py --seeds 7,11,23,31,47`), smoke tests, browser pass.
2. GitHub repo **GilCaplan/MLSimulator** (public, PolyForm Noncommercial 1.0.0 license; README, USER_GUIDE,
   TUTORIAL, ARCHITECTURE, CONTRIBUTING, workflow docs) — user approved name/visibility/license.
3. Capability expansion per `docs/expansion_plan.md`: Phase 0 foundation (task × modality) + Phase 1 vision, then
   unsupervised, NLP, recommenders, forecasting, P1 extras.

## Verification commands
```sh
cd frontend && npx tsc --noEmit -p tsconfig.json && npx vite build
PYTHONPATH=. .venv/bin/python scripts/smoke_models.py
PYTHONPATH=. .venv/bin/python scripts/validate_lessons.py
.venv/bin/python -m mlp.main --port 8799 &  .venv/bin/python scripts/smoke_api.py 8799 ; .venv/bin/python scripts/smoke_lessons.py 8799
```
Use `MLP_DATA_DIR=<tmp>` for test servers so `data/` stays clean.
