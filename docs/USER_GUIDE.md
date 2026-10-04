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
Problems are grouped by what you want to do:
- **Predict**: **classification** (the answer is a category, like *spam / not spam*) or **regression** (the answer is
  a number, like *price*). Not sure? Ask yourself: "Is the answer a label or an amount?"
- **Vision**: image classification ("what is in this picture?") and image regression ("what number does it show?").
- **Language**: text classification (reviews, support tickets, spam).
- **Discover**: clustering (natural groups), *Map my data* (2-D maps with PCA / t-SNE) and anomaly detection. These
  have no answer column; an optional hidden "truth" column is used only to check the result.
- **Recommend**: user–item–rating data → "what will this person like next?".
- **Forecast**: a value over time (sales, demand, visits) → "what happens next?".

Some steps are renamed to fit the problem (for example *Images*, *Texts*, *Ratings* or *Series* instead of *Data*).

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
  outcomes change. Press **Use … for this model** to make the model decide with that threshold from the next training
  run on; saved models keep it.
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
  - **Export ▾**:
    - *Full bundle (.zip)*: the trained model, its data-preparation recipe, `architecture.json` (model type,
      settings, network layers) and, for neural networks, PyTorch weights (`weights.pt`). Re-import it here or on
      another computer.
    - *Architecture only (.json)*: share the design without the trained weights.
- **Import model** (Model Library): drop an exported bundle.
  - Bundles exported from your own ML Playground import straight away.
  - Bundles from anywhere else ask you to confirm that you trust the file first, because model files can run code
    when they're opened. Damaged or modified bundles are refused.
  - Imported models are marked 📥 Imported (plus "unverified source" when unsigned).
- **Network designs**: in a neural network's settings on the Models step, *Export design* / *Import design* moves
  a layer layout between models or projects.

## Forecasting in short
- **Series step**: pick a built-in series (shop sales, electricity demand, airline passengers, website visits) or upload
  a CSV/Excel file, then say which column is the **time**, which is the **value**, and (optionally) which column
  separates several **series** (e.g. one per shop). Charts show the rhythm of your data (e.g. Mon…Sun) and how much
  each value resembles the one *k* steps earlier.
- **Prepare**: choose the **horizon** (how far ahead to forecast), the **split** (*last stretch of time* is honest;
  *random rows* lets the model peek at the future), lags, rolling averages, calendar flags, a trend counter,
  differencing, a log transform and the extra columns that are **known in advance** (planned promotions, a weather
  forecast). Columns that are only known afterwards (number of customers…) leak the answer.
- **Train**: every run is compared with "same as last season". With a time split the score is a genuine multi-step
  forecast: each guess feeds the next. **MASE** below 1 means you beat "same as last season".
- **Library**: forecast any series up to 4× the horizon and try *what-ifs* for the extra columns ("what if we run a
  promotion next week?").

## Labs
Free-play experiments outside the wizard: a **GAN** that learns to forge 2-D shapes, an **autoencoder map** of
handwritten digits you can click to decode, **transfer learning** (re-using a pre-trained network when you have only a
few labels), **slot machines** (explore vs exploit) and a **robot in a maze** that learns by Q-learning.

## Lessons
22 lessons in pipeline order, each **Learn → Try it → Quiz → Practice**.
- **Practice** creates a challenge project with the problem baked in.
- Work through the normal steps. On the Train results press **Check against the real world**: your model is graded
  on a hidden test set that represents real use. You'll see your own test score next to the real-world score;
  that contrast is the lesson.
- Hints unlock one at a time. Progress is saved.

## Settings
- **Server & port**: see which ports are free and move the running app to another. The page follows automatically,
  and the desktop icon always finds the running app.
- **Appearance · Look & feel** (applies instantly, everywhere, and is remembered on every port):
  - **Template**: the whole-site look. *Liquid Glass* (frosted panels), *Classic* (bevelled buttons, system fonts),
    *Minimal* (flat, hairlines), *Solid* (bold outlines, no gradients) or *Paper* (warm, serif headings).
    Each template has a light and a dark version.
  - **Background**: aurora, solid, gradient, dots, grid or none.
  - **Colours & shape**: accent colour (or your own), corner shape (sharp → pill), font, and the chart colour palette
    (including a colour-blind-safe one).
  - **Controls**: how every control in the app is displayed.
    - Numbers can be a slider, a − / + stepper, a number box or a dropdown.
    - Choices can be segmented buttons, a dropdown, radio buttons, chips or cards.
    - On/off settings can be a switch, a checkbox or Yes / No.
    - You can also set the layout direction.
    - When a style doesn't suit a particular control (say, a dropdown with 20,000 values), the app picks the closest
      sensible one automatically, and the preview badges explain why.
  - **Density & motion**: compact, comfortable or spacious; full, reduced or no animation.
  - A live **preview** at phone, laptop and desktop widths, per-section **Reset**, and **Export / Import** of your
    settings as a file.
- **System**: versions, GPU availability (Apple MPS or NVIDIA CUDA), data folder (*Show in Finder* / Explorer / *Open folder*) and log file.
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
