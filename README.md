# MLSimulator — ML Playground

**Machine learning as a playground.** A local, no-code app that walks you through building real machine-learning
models with PyTorch and scikit-learn: choose a problem, pick models, bring or invent data, clean it, train, and
improve. Everything is visual, animated and explained in plain language, and a coach points out what to fix next.

It runs entirely on your computer. Nothing is uploaded anywhere.

![Home](docs/images/home.jpg)

## What you can do

| | |
|---|---|
| **Guided wizard.** Problem → Models → Data → Prepare → Train → Improve, with a coach that explains every step and suggests one-click fixes. | ![Models](docs/images/models.jpg) |
| **Models.** 17 classic models (linear/logistic, ridge, lasso, SVM, KNN, naive Bayes, trees, random forest, extra trees, gradient boosting, histogram boosting, AdaBoost, XGBoost, LightGBM). Neural networks you design visually: MLP, 1-D CNN, image CNN, tabular Transformer, graph neural network. Train many models at once and compare them. | ![Leaderboard](docs/images/leaderboard.jpg) |
| **Data.** Built-in sample datasets, CSV / JSON / Excel upload, a synthetic-data designer (pick a distribution per feature and a rule for the target, with live histograms), classic toy shapes (moons, spirals…), or a mix of uploaded and synthetic data. | ![Data](docs/images/data.jpg) |
| **Data engineering.** Missing values, encoding, outliers, feature engineering (date parts, ratios, products, buckets, formulas), duplicates, honest splits (random, by group, by time), scaling, feature selection, and class rebalancing (SMOTE, ADASYN, Borderline-SMOTE, NearMiss, Tomek links, ENN or exact class counts), each with a before/after animation. | ![Prepare](docs/images/prepare.jpg) |
| **Training you can watch.** Live loss curves, network diagrams whose connections change colour as the weights learn, decision maps, confusion matrices, ROC curves, residuals, feature importance, mistakes, slices, calibration, cross-validation, and an automatic baseline to beat. | ![Live training](docs/images/train-live-dark.jpg) |
| **Improve.** Automatic hyperparameter search, decision-threshold tuning, and the score history of every run. | ![Decision map](docs/images/decision-map.jpg) |
| **Model library.** Save models together with their full recipe. Try them live with sliders and what-if curves, predict on new files (and get scores if the file includes the true answers), or export them as .zip. | ![Playground](docs/images/playground.jpg) |
| **Vision.** Image classification and image regression: built-in image sets (shapes, count the dots, line tilt, arrows, handwritten digits) or your own ZIP of images. Augmentation with previews, CNNs and a Tiny ResNet next to "pixels as a table" models, and a look inside the network: saliency maps, learned filters, feature maps and a mistakes gallery. Draw or upload a picture to test a saved model. | ![Decision map](docs/images/decision-map.jpg) |
| **Discover (unsupervised).** Clustering (k-means with a live animation, Gaussian mixtures, DBSCAN, hierarchical), maps of your data (PCA with scree and loadings, t-SNE) and anomaly detection (Isolation Forest, One-Class SVM, Local Outlier Factor). Cluster profiles explain each group, an optional hidden "truth" column shows whether the groups make sense, and a k sweep helps choose the number of clusters. | ![Lessons](docs/images/lessons.jpg) |
| **Language (NLP).** Text classification from built-in sets (product reviews with negations, support tickets, SMS spam) or your own CSV: bag-of-words models (TF-IDF with words or word pairs) next to word embeddings, a GRU and a tiny Transformer. See the words that drive each class, word-by-word explanations of predictions, and type your own sentences in the playground. | ![Lessons](docs/images/lessons.jpg) |
| **Recommendations.** User–item–rating data (a built-in movie-ratings set or your own CSV): most-popular, item- and user-similarity, SVD and matrix factorisation. Ranking metrics (recall/NDCG@10, coverage, novelty), the long tail, a taste map, and a playground where you rate a few films as a new viewer and get live recommendations with "because you liked…". | ![Lessons](docs/images/lessons.jpg) |
| **Forecasting.** Time series (shop sales with promotions, hourly electricity demand, airline passengers, website visits, or your own CSV): lag, rolling-average and calendar features, an honest time split, "same as last season" and exponential-smoothing baselines, trees and linear models on lags, and a GRU. Recursive multi-step forecasts with uncertainty bands, error growth by horizon, and a playground for "what if we run a promotion next week?". | ![Lessons](docs/images/lessons.jpg) |
| **Labs.** Free-play experiments: a GAN forging 2-D shapes, a clickable autoencoder map of handwritten digits, transfer learning with a pre-trained network, slot machines (explore vs exploit) and a maze robot learning by Q-learning. | ![Lessons](docs/images/lessons.jpg) |
| **Lessons.** 22 interactive lessons in pipeline order. Each one teaches a classic pitfall, lets you play with it in a demo, quizzes you, then hands you a dataset with that problem baked in. Your model is graded on a hidden "real world" test set. | ![Lessons](docs/images/lessons.jpg) |

### Lessons

Baselines · Missing values · Outliers & skewed targets · Data leakage · Feature engineering · Honest splits (groups &
time) · Feature scaling · Class imbalance · Overfitting · Regularization · Which error matters? (MAE vs RMSE) ·
Precision vs recall: the decision threshold · Calibration & error analysis · Spurious shortcuts · Fairness
& proxy bias · Choosing k · The curse of dimensionality · Bag of words · Popularity bias · Cold start · No peeking at the future · Convolutions · Data augmentation.

![Your test vs the real world](docs/images/lesson-check.jpg)

## Install

ML Playground runs on **macOS, Linux and Windows**.

### Easiest: one command

**macOS / Linux**: open *Terminal* and paste:
```sh
curl -fsSL https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.sh | bash
```

**Windows**: open *PowerShell* (Start menu → type "PowerShell") and paste:
```powershell
irm https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.ps1 | iex
```

That's all:
- **No admin rights needed, nothing installed system-wide.** The command downloads ML Playground into `~/MLSimulator`
  (Windows: `%USERPROFILE%\MLSimulator`). If Python 3.10+ or Node.js 18+ are missing, it puts private copies inside
  that folder.
- It builds the app, adds an **ML Playground** icon, and opens the app in your browser.
- The first install takes about 5–15 minutes, mostly downloading PyTorch, and needs about 3 GB of disk space.
- From then on, double-click **ML Playground**:
  - macOS: Desktop or Applications.
  - Linux: applications menu or Desktop. On GNOME, right-click the Desktop icon → *Allow Launching* once.
  - Windows: Desktop or Start menu.
- **To update**, run the same command again. Your projects are kept.

<details>
<summary>Options: install folder, no icons, no auto-open, GPU</summary>

macOS / Linux: add options after `bash -s --`, e.g.
`curl -fsSL https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.sh | bash -s -- --dir ~/apps/MLSimulator --no-shortcuts`
- `--dir PATH`: install folder (default `~/MLSimulator`).
- `--no-launch`: don't open the app at the end.
- `--no-shortcuts`: no app icon / desktop entry.
- `--gpu` (Linux): keep the CUDA build of PyTorch. By default, setup installs the smaller CPU-only build when no
  NVIDIA GPU is found. With an NVIDIA GPU, big networks train on it automatically. On Apple Silicon Macs, they use the
  Apple GPU.

Windows: set environment variables first in the same window, e.g.
`$env:MLP_DIR = "D:\Apps\MLSimulator"; irm https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.ps1 | iex`
- `MLP_DIR`: install folder.
- `MLP_NO_LAUNCH=1`: don't open the app at the end.
- `MLP_NO_SHORTCUTS=1`: no shortcuts.
</details>

### Let an AI agent install it
Using Claude Code, Codex, Cursor or another coding agent? Give it this prompt:

> Install ML Playground on this computer by following the instructions in
> https://github.com/GilCaplan/MLSimulator/blob/main/AGENT_INSTALL.md, verify it, and tell me how to open it.

[`AGENT_INSTALL.md`](AGENT_INSTALL.md) has non-interactive commands for each OS, verification steps, troubleshooting
and uninstall instructions.

### From a git clone
Prefer to clone the repository yourself? Run the setup script inside it:
```sh
git clone https://github.com/GilCaplan/MLSimulator.git
cd MLSimulator
bash scripts/setup.sh          # macOS / Linux
scripts\setup.bat              # Windows (or double-click it in File Explorer)
```
The setup script takes the same options as above (`--no-launch`, `--no-shortcuts`, `--gpu`; Windows: `-NoLaunch`,
`-NoShortcuts`).

<details>
<summary>Fully manual setup (no scripts)</summary>

Requires Python 3.10+ and Node.js 18+.
```sh
python3 -m venv .venv                                  # Windows: py -3 -m venv .venv
.venv/bin/pip install -r requirements.txt              # Windows: .venv\Scripts\pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
.venv/bin/python launcher/launch.py                    # Windows: .venv\Scripts\python launcher\launch.py
```
On Linux without an NVIDIA GPU, run `.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu`
first for a much smaller download.
</details>

### Starting and stopping without the icon
```sh
.venv/bin/python launcher/launch.py              # start or reopen the app (Windows: .venv\Scripts\python launcher\launch.py)
.venv/bin/python launcher/launch.py --status     # is it running? prints the URL
.venv/bin/python launcher/launch.py --stop       # stop the background server
```
Or stop it from the app: *Settings → Quit*. The server only listens on `127.0.0.1` (this computer). If Windows asks
about the firewall, allowing private networks is fine.

### Uninstalling
Delete the install folder and the ML Playground icon(s):
- macOS: also delete `~/Applications/ML Playground.app`.
- Linux: also delete `~/.local/share/applications/ml-playground.desktop`.
- Windows: also delete the Start-menu entry.

Your projects live in `data/` inside the install folder, so back it up first if you want to keep them.

### Troubleshooting
- **Nothing opens:** look at `data/logs/launcher.log` and `data/logs/server.log` in the install folder.
- **Something broke during install:** run the install command again. It resumes and repairs. For a clean
  reinstall, delete `.venv` and `.tools` in the install folder first (your `data/` is kept).
- **Behind a proxy:** set `HTTPS_PROXY` before running the install command.
- **Port already in use:** the app picks the next free port between 8765 and 8800. *Settings → Server & port* can move
  a running app.

## Documentation
- **[User guide](docs/USER_GUIDE.md)**: every screen and setting explained.
- **[Tutorial](docs/TUTORIAL.md)**: your first models, step by step (about 20 minutes).
- **[Architecture](docs/ARCHITECTURE.md)**: how the app is built.
- **[Contributing](CONTRIBUTING.md)**: development setup and the workflow guides in [`docs/workflows/`](docs/workflows/)
  (adding models, datasets and lessons, releases).
- **[Roadmap](docs/expansion_plan.md)**: vision, unsupervised learning, NLP, recommenders, forecasting and Labs have landed.

## Where things are stored
Projects, datasets, trained models and logs live in `data/` inside the project folder. Back it up to keep your work;
delete it to start fresh. *Settings → Show in Finder* (Explorer on Windows, *Open folder* on Linux) opens it.

## License
[PolyForm Noncommercial 1.0.0](LICENSE). You may use, copy and modify ML Playground for **personal, educational,
research, hobby and other non-commercial purposes**. **Commercial use is not permitted.** If you'd like to use it
commercially, open an issue to ask.

Copyright © 2026 Gil Caplan.
