# Build progress & resume checkpoint

_Last updated: 2026-10-02 (session 4). If a session ends mid-task, start here._

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

## Phase 3 (NLP) — DONE, session 3
- Backend done: `mlp/core/text.py` (text sets reviews/tickets/spam, tokenizer, TextPreprocessor TF-IDF|seq,
  prepare_text), torch TextNet (embedding_bag / gru / text_transformer), multinomial_nb, `mlp/core/text_eval.py`
  (occlusion word attributions, top words, mistakes with text), predict_text op + `/library/{id}/predict-text`,
  `library.preprocessor_for`, lesson `bag_of_words` (validated), `scripts/smoke_text.py`.
- Frontend done: text problem tile, text sets/upload with text-column picker, Words/Sequence-length stages, text model
  builders, Mistakes/Words/Explanations tabs, text playground with word influence, templates, bag_of_words demo.
- Next: Phase 4 Recommenders, Phase 5 Forecasting, Phase 6 extras (see `docs/expansion_plan.md`).

## Phase 4 (recommenders) — DONE, session 4
- Backend: `mlp/core/recsys.py` (movie ratings + catalogue, leave-last-out, popularity / item-kNN / user-kNN / SVD /
  ALS + cold-start fallback, ranking metrics, long tail, taste map, lesson_eval), `/library/{id}/recommend|catalog`,
  lessons `popularity_bias`, `cold_start` (validated), `scripts/smoke_recsys.py`.
- Frontend: ratings data/prepare/models/tune, results (examples, long tail, taste map), library playground (known
  viewer / be a new viewer), Movie-night template, challenge check, demos for both lessons.

## Phase 5 (forecasting) — backend DONE, UI next (session 4)
- Backend: `mlp/core/forecast.py` — 4 series sets (shop sales ×3 stores + promo, hourly energy + temperature, airline
  monthly, web traffic with a level shift), causal features (lags, rolling means, calendar, trend, known-in-advance
  extra columns, series one-hot), per-series scaling, optional log / differencing, time split (recursive multi-step test)
  or random split (the trap), models naive / seasonal naive / moving average / Holt-Winters / ridge / RF / HistGB /
  GRU (torch, `"torch": True` → `registry.uses_torch`), metrics MAE/RMSE/sMAPE/MASE/bias + one-step MAE, forecast bands
  from validation residuals, MASE by horizon step, importance, `forecast_from_end` (playground, exog what-ifs).
- API: `/datasets/timeseries-sets`, `POST /datasets/timeseries-set`, profile (`modality=timeseries`, `time_col`,
  `value_col`, `series_col`), prepare dispatch, `POST /library/{id}/forecast`, worker ops `forecast` +
  `lesson_eval(kind="forecast")`, auto seasonal-naive baseline (skipped if the learner picks it), coach rules.
- Lesson `no_peeking` (leaky `customers` column + random split; goals error_ratio ≤ 2 and MASE ≤ 1.2; validated 5 seeds).
- Smoke: `scripts/smoke_forecast.py PORT`.
- **Hidden until the UI lands:** `problems.py` forecasting `enabled: False` and `no_peeking` not in `ORDER` (catalog.py).
  Re-enable both when the forecasting UI is merged.

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
