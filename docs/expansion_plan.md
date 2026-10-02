# Capability expansion plan (Fable, 2026-10-01)

Goal: beyond tabular supervised learning — vision, unsupervised, NLP, recommenders, forecasting (+ generative/RL extras),
each interactive and educational, inside the same six-step shell.

## Architecture: `task × modality`
- `task`: classification | regression | clustering | reduction | anomaly | recommendation | forecasting
- `modality`: tabular | image | text | ratings | timeseries (default tabular → backwards compatible)
- `mlp/core/problems.py` + `frontend/src/lib/problems.ts`: catalogue of valid combos (label, group, step list/labels,
  primary metric + direction, required column roles). `stepsFor(project)` replaces constant `STEPS`.
- Project doc adds `modality` and `columns` roles {truth, text, user, item, rating, time, value}.
- Datasets: `arrays` sidecar (`images.npy`, uint8 NHWC, mmap) + `meta.modality/image_shape/classes`; thumbnails via
  `GET /datasets/{did}/image/{i}?size=64`.
- `Prepared` gains `modality` + `payload`; duck-typed preprocessors per modality (Image, Text/TF-IDF, RatingsIndex,
  SeriesWindower) — all torch-free so they load in the main process.
- Registry entries gain `modalities` and `trainer` (nn | classic | vision | text | unsupervised | recsys | forecast);
  `nn: True` still routes to the torch worker. Worker dispatches trainers; `evaluate_tasks.py` dispatches evaluators;
  leaderboard reads metric direction from problems; task-aware baseline.
- New server ops: predict_image, predict_text, recommend, assign, forecast, predict_bundle, augment_preview.
- Invariant: main process never imports torch or xgboost/lightgbm (OpenMP clash) — add an assertion test.

## P0 capabilities (order)
1. **Vision** — image classification & regression; ZIP upload (class folders or CSV filename→label/value), synthetic
   generators (shapes, rotated digits, count dots, line angle), sklearn digits, optional downloads (Olivetti,
   Fashion-MNIST subset). Models: generalised `cnn2d`, `tiny_resnet`, pixels-as-table classic baselines. Pure-torch
   augmentation (flip, shift, rotate, brightness, cutout). Visuals: conv filters, feature maps, saliency, mistakes
   gallery, augmentation strip. Playground: upload/draw → probabilities + saliency.
2. **Unsupervised** — k-means/DBSCAN/agglomerative/GMM; PCA/t-SNE; IsolationForest/OC-SVM/LOF/autoencoder anomaly.
   Live k-means iterations, dendrogram, PCA reconstruction slider, K sweep; metrics silhouette/DB/CH (+ARI/NMI with
   optional hidden truth).
3. **NLP** — TF-IDF in the preprocessor (all classic models work on text), torch embedding-bag/GRU/tiny transformer with
   in-house tokenizer; synthetic reviews with a negation knob; token attribution + attention heatmap.
4. **Recommenders** — user,item,rating[,time]; synthetic MovieLens-like generator; popularity, item/user kNN, SVD,
   torch MF/NCF; leave-last-out split; precision/recall/NDCG@k, coverage, popularity of recs; cold-start playground.
5. **Forecasting** — lag/rolling/diff causal feature ops, forced time split, naive/seasonal-naive/moving-average
   baselines, regressors, torch GRU; MAE/RMSE/sMAPE/MASE; forecast chart + recursive multi-step playground.

P1: transfer learning (optional torchvision), AE/VAE latent playground, tiny 2-D GAN, image-shortcut & anomaly lessons,
client-side RL demos (gridworld, bandit). Cut: detection/segmentation, audio, UMAP, gym/DQN, LLM fine-tuning.

## New lessons
convolutions (shifted shapes), augmentation (rotated digits), bag_of_words (negation), choosing_k, curse (noise dims),
cold_start, popularity_bias, no_peeking (forecast). Challenge specs gain `kind`; generators return bundles
(DataFrame + optional arrays); validator gains a `--torch` mode in a separate interpreter.

## Phases
0 Foundation (problems catalogue, modality plumbing, dispatch skeletons, Problem page rewrite, stepsFor) →
1 Vision → 2 Unsupervised → 3 NLP → 4 Recommenders → 5 Forecasting → 6 P1 extras. Each phase leaves the app shippable.
Recommended: Phase 0 + 1 together; then parallelise helpers (media generators + lessons / frontend panels / trainers).
