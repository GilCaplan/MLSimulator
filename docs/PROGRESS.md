# Build progress & resume checkpoint

_Last updated: 2026-10-02 (session 2). If a session ends mid-task, start here._

## Done
- v1 app: tabular classification/regression wizard, 17 classic models + 5 PyTorch nets, synthetic/sample/upload data,
  preprocessing incl. resampling, live training (SSE), coach, tuning, library + prediction playground, port switching,
  macOS launcher (`launcher/build_app.sh`), glass UI.
- Lessons v1: 8 lessons (missing, outliers, leakage, scaling, imbalance, overfitting, shortcut, fairness) — validated.
- Batch 2 backend (done): baseline row in every run, group/time splits, dedupe, datetime role, feature engineering
  (`mlp/core/features.py`, `POST /datasets/{id}/features/preview`), calibration/mistakes/slices in evaluation,
  `options.calibrate`, coach rules, categorical-NaN bug fix.

## Done in session 2
- Batch 2 complete (frontend for splits/dedupe/feature engineering, baseline row, Mistakes/Calibration tabs,
  calibrate option, 4 lessons + demos). GitHub repo live: https://github.com/GilCaplan/MLSimulator (CI green).
- Expansion Phase 0 (problems catalogue `mlp/core/problems.py`, `modality` on projects/registry/prepared,
  leaderboard direction, process-isolation test `tests/test_process_isolation.py`).
- Phase 1 Vision backend: `mlp/core/images.py` (image sets, ZIP, ImagePreprocessor, prepare_images, augmentation
  preview), `mlp/api/media.py`, colour CNN with global pooling + Tiny ResNet, torch augmentation (half-batch identity),
  `mlp/core/vision_eval.py`, predict_image / predict_arrays worker ops, vision lessons `convolutions`, `augmentation`
  (validated with `--torch`), `scripts/smoke_vision.py`, `scripts/smoke_lessons_vision.py`.
- Vision UI: results tabs (gallery, saliency, filters), image playground with draw pad, home templates.

## Older notes (batch 2, now done)
- Frontend agents: Prepare (splits/dedupe/Create-features stage), Train (baseline row, Mistakes + Calibration tabs,
  calibrate option, challenge metrics, library datetime inputs), demos for 4 new lessons.
- New lessons `baselines`, `splits`, `features`, `calibration`: generators + grading in `mlp/lessons/`; still need
  calibration of `splits` goal, catalog content in `mlp/lessons/catalog.py`, end-to-end check, docs table update.

## Phase 2 (unsupervised) — DONE, session 3
- Backend done: `mlp/core/unsupervised.py` (prepare without target + hidden truth, k-means live steps, GMM, DBSCAN,
  agglomerative, PCA, t-SNE, Isolation Forest, One-Class SVM, LOF, evaluation, k sweep), problems enabled, registry,
  worker/trainer dispatch, `/jobs/sweep`, `/library/{id}/assign`, PCA `reduce` pipeline step, samples customers/sensors,
  lessons `choosing_k`, `curse` (validated), `scripts/smoke_unsupervised.py`.
- Frontend done: Discover problems, truth picker, hold-out + PCA Reduce stages, k sweep (Refine), live k-means
  walk, cluster map/profiles/truth check, scree/loadings, anomaly scores/map/top anomalies, library assign playground,
  home templates, demos for choosing_k & curse. 16 lessons. Rule: max 2 concurrent subagents.
- Next: Phase 3 NLP (text classification) per `docs/expansion_plan.md`, then recommenders, forecasting.

## Next
- Vision UI is complete (problem picker, image Data/Prepare, results tabs, playground, 14 lessons incl. 2 vision demos);
  pushed to GitHub, CI green (CI validates tabular lessons; image lessons need `validate_lessons.py --torch` locally).
- Remaining expansion phases from `docs/expansion_plan.md`: 2 Unsupervised (clustering/reduction/anomaly),
  3 NLP (text classification), 4 Recommenders, 5 Forecasting, 6 extras (transfer learning, VAE, GAN, RL demos).
  Problem tiles for these already appear as "coming soon" (`enabled: False` in `mlp/core/problems.py`).
0. (done) Finish vision UI, demos, browser pass, commit + push.
1. (done) Finish batch 2 → validate (`scripts/validate_lessons.py --seeds 7,11,23,31,47`), smoke tests, browser pass.
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
