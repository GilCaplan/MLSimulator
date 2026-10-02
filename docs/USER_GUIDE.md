# User guide

ML Playground guides you through a machine-learning project in six steps. You can jump back to any finished step at
any time. Your work is saved automatically.

- [Projects (home)](#projects-home)
- [1. Problem](#1-problem) · [2. Models](#2-models) · [3. Data](#3-data) · [4. Prepare](#4-prepare) · [5. Train](#5-train) · [6. Improve](#6-improve)
- [The coach](#the-coach) · [Model library](#model-library) · [Lessons](#lessons) · [Settings](#settings) · [Troubleshooting](#troubleshooting)

## Projects (home)
- **New project** starts an empty project.
- **Quick start** templates create a ready-to-train project (data, goal and models already chosen): Iris flowers, card
  fraud (imbalanced), house prices, handwritten digits with a CNN, and the two-moons playground.
- **Your projects** shows progress dots for the six steps. Click a project to continue it; rename or delete it from
  its card.

## 1. Problem
Choose **classification** (the answer is a category, like *spam / not spam* or *which species*) or **regression**
(the answer is a number, like *price* or *minutes of delay*). Not sure? Ask yourself: "Is the answer a label or an
amount?"

## 2. Models
Click cards to add models to your line-up. You can compare several at once; there is no single best algorithm.
- **Quick picks**: *Beginner trio*, *All classic models*, *Neural networks*.
- **⚙ Tune / Design** opens a model's settings. Every setting has a plain-language explanation; hover the ⓘ.
- **Neural networks** open the visual builder: add, remove and reorder layers, set neurons, activation, dropout and
  batch-norm, and watch the network diagram and parameter count update. CNNs use convolution layers (filters,
  kernel size, pooling). The Transformer and GNN have their own sliders.
- **+ copy** duplicates a model so you can compare two settings of the same algorithm.

## 3. Data
Pick a source:
- **Samples**: built-in real and realistic datasets.
- **Upload**: CSV, TSV, JSON / JSONL or Excel (up to 200 MB). Files stay on your computer.
- **Generate**: design synthetic data. Add features, choose each one's distribution (normal, uniform, log-normal,
  Poisson, categories…) and watch its histogram update live. Then choose how the target depends on the features:
  *Weights* (sliders), *Formula*, *Clusters* or *Random*. For classification you can set the class balance.
- **Toy shapes**: moons, circles, spirals, XOR, blobs and more, with live previews.

Once data is loaded, choose **what to predict** (the target). You'll then see:
- the class balance or target distribution;
- a 2-D "bird's-eye view" of the rows;
- which features move with the target;
- a column table (type, missing values, a mini histogram) and the raw rows.

**Combine** adds synthetic columns or extra jittered rows to the current dataset.

## 4. Prepare
Real data is messy. Each stage fixes one kind of problem. Click a stage in the recipe strip to open it.
| Stage | What it does |
|---|---|
| **Clean** | Choose columns to ignore and how to fill missing numbers and categories. You can also remove exact duplicate rows. |
| **Create features** | Feature engineering: split dates into parts (hour, weekday, month…), ratios (A ÷ B), products (A × B), differences, log, powers, buckets, or your own **formula**. A live preview shows each new column. Features are recreated automatically when a saved model predicts. |
| **Encode** | Turns categories into numbers (one-hot or ordinal). |
| **Outliers** | Optionally removes extreme training rows (IQR or z-score). |
| **Split** | Train / validation / test sizes. **Random rows**, **keep groups together** (e.g. every visit of a patient on one side) or **train on the past, test on the future**. |
| **Scale** | Standard, min-max or robust scaling. Distance-based models (KNN, SVM) and neural nets need it. |
| **Select** | Keep only the most useful features. |
| **Balance** (classification) | Grow rare classes (random copies, SMOTE, Borderline-SMOTE, ADASYN, SVM-SMOTE), shrink common ones (random, NearMiss, cluster centroids), meet in the middle, or set exact counts. Optional border cleaning with Tomek links or ENN. Applies to training rows only. |
| **Target** (regression) | Remove impossible target values (typos like $0 or $2 billion) and optionally predict log(1 + y) for skewed targets. |

Press **Run preparation** to see before/after class bars, an animated scatter (synthetic rows pop in with a ring,
removed rows fade out), split sizes and the final feature list.

## 5. Train
Choose cross-validation (off / 3 / 5 / 10 folds), the CV metric, a random seed and, for classification, optional
**probability calibration**. Then press **Start training**.
- **While training**: each model shows live curves (loss for neural nets and boosting, score for forests). Neural
  nets show their network with connections recolouring as weights change. **Stop** cancels instantly.
- **Results**: a leaderboard sorted by the metric you choose. The 🎯 **baseline** row shows what always guessing would
  score, and each model shows how far it beats it. Click a model for:
  - **Overview**: train vs test metrics and cross-validation.
  - **Decision map**: what the model would answer across a 2-D map of your data.
  - **Errors**: confusion matrix, ROC and PR curves, or predicted-vs-actual plots.
  - **Mistakes**: the most confident wrong answers, plus slices showing where the model is weakest.
  - **Calibration**: whether "70%" really happens 70% of the time.
  - **Features**: importance. **Learning curve**. **Settings** used.
- **Save to library** keeps a model with its full recipe.

## 6. Improve
- **Progress over runs**: the best score of every training run.
- **Automatic tuning**: pick a model and the settings to search (ranges are pre-filled). The app tries many
  combinations with cross-validation and shows each trial live. *Apply best settings* updates your model.
- **Decision threshold** (binary classification): slide the cut-off and see precision, recall, F1 and the 2×2
  outcomes change.
- **Ways to improve**: a checklist of ideas, each linking to the right step.

## The coach
The coach column explains each step and reacts to your data and results. It flags things like:
- imbalanced classes;
- leaky or ID-like columns;
- duplicates and repeated groups;
- dates that should become features;
- overfitting, underfitting, models no better than the baseline, and miscalibrated probabilities.

Most tips have a one-click fix. In lesson challenges the tips are hidden behind a spoiler button so you can think first.

## Model library
- Search and filter saved models; rename or delete them.
- Open a model to:
  - **Try it live**: one control per input (sliders, toggles, choices). The prediction updates as you move them. Tiny
    *what-if* curves under each slider show how the answer would change if only that input moved.
  - **Batch predictions**: drop a CSV, JSON or Excel file to predict every row and download the results. If the file
    contains the true answers, you also get scores and a confusion matrix.
  - **How it performed** and **Recipe**: the full configuration and data-preparation steps.
  - **Export (.zip)**: the trained model plus its preprocessing.

## Lessons
12 lessons in pipeline order, each **Learn → Try it → Quiz → Practice**.
- **Practice** creates a challenge project with the problem baked in.
- Work through the normal steps. On the Train results press **Check against the real world**: your model is graded
  on a hidden test set that represents real use. You'll see your own test score next to the real-world score;
  that contrast is the lesson.
- Hints unlock one at a time. Progress is saved.

## Settings
- **Server & port**: see which ports are free and move the running app to another. The page follows automatically,
  and the desktop icon always finds the running app.
- **Appearance**: light, dark or auto; reduce motion.
- **System**: versions, Apple GPU (MPS) availability, data folder (*Show in Finder*) and log file.
- **Quit** stops the background server.

## Troubleshooting
| Problem | Fix |
|---|---|
| Nothing happens when I double-click the icon | See `data/logs/launcher.log`. The first launch runs setup, which can take a few minutes. |
| The page won't load | The server may have stopped. Double-click the icon again, or run `.venv/bin/python -m mlp.main`. |
| A port is busy | The launcher picks the next free port automatically; you can also move the app in Settings. |
| Training is slow | Use fewer rows, fewer trees or epochs, or a smaller network. SVM and KNN slow down above ~50k rows. |
| A model failed | The error appears on its card; the other models still finish. Server details are in `data/logs/server.log`. |
| Start fresh | Quit the app and delete the `data/` folder. |
