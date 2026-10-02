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
| **Lessons.** 20 interactive lessons in pipeline order. Each one teaches a classic pitfall, lets you play with it in a demo, quizzes you, then hands you a dataset with that problem baked in. Your model is graded on a hidden "real world" test set. | ![Lessons](docs/images/lessons.jpg) |

### Lessons

Baselines · Missing values · Outliers & skewed targets · Data leakage · Feature engineering · Honest splits (groups &
time) · Feature scaling · Class imbalance · Overfitting · Calibration & error analysis · Spurious shortcuts · Fairness
& proxy bias · Choosing k · The curse of dimensionality · Bag of words · Popularity bias · Cold start · No peeking at the future · Convolutions · Data augmentation.

![Your test vs the real world](docs/images/lesson-check.jpg)

## Quick start

ML Playground runs on **macOS, Linux and Windows**. You need:
- **Python 3.10+** (3.11 recommended): [python.org/downloads](https://www.python.org/downloads/)
- **Node.js 18+**, only once, to build the interface: [nodejs.org](https://nodejs.org)
- **Git** to download the project (or use GitHub's *Code → Download ZIP* and unzip it)
- About 3 GB of disk space (mostly PyTorch). [`uv`](https://github.com/astral-sh/uv) makes setup faster but is optional.

The setup script creates a private Python environment in `.venv`, builds the interface and adds an **ML Playground**
icon. Double-click the icon: the app starts in the background on a free port (8765 by default) and opens in your
browser. Opening it again simply reopens the running app.

### macOS
```sh
git clone https://github.com/GilCaplan/MLSimulator.git
cd MLSimulator
bash scripts/setup.sh
```
The icon appears on your Desktop, in `~/Applications` and in the project folder. On Apple Silicon, larger networks use
the Apple GPU (MPS) automatically.

### Linux
```sh
# Debian/Ubuntu prerequisites (other distributions: install python3, python3-venv, nodejs, npm, git)
sudo apt install python3 python3-venv python3-tk nodejs npm git

git clone https://github.com/GilCaplan/MLSimulator.git
cd MLSimulator
bash scripts/setup.sh
```
This adds **ML Playground** to your applications menu and Desktop (on GNOME you may need to right-click the Desktop
icon → *Allow Launching* once). Without an NVIDIA GPU, setup installs the smaller CPU-only build of PyTorch. With
an NVIDIA GPU and drivers it keeps the CUDA build, and big networks train on the GPU. Use `bash scripts/setup.sh --gpu`
to force the CUDA build.

### Windows
1. Install [Python](https://www.python.org/downloads/) (tick **"Add python.exe to PATH"**), [Node.js](https://nodejs.org)
   and [Git](https://git-scm.com/download/win).
2. In PowerShell or Command Prompt:
   ```bat
   git clone https://github.com/GilCaplan/MLSimulator.git
   cd MLSimulator
   scripts\setup.bat
   ```
   (or double-click `scripts\setup.bat` in File Explorer).
3. Double-click **ML Playground** on your Desktop or in the Start menu.

If Windows Defender SmartScreen or the firewall asks, allow Python to accept **local** connections. The app only
listens on `127.0.0.1`, so it isn't reachable from other computers.

### Without the icon (any OS)
```sh
# macOS / Linux
.venv/bin/python launcher/launch.py           # start or reopen the app
.venv/bin/python launcher/launch.py --stop    # stop the background server

# Windows
.venv\Scripts\python launcher\launch.py
.venv\Scripts\python launcher\launch.py --stop
```
Or run the server in the foreground on a port of your choice: `.venv/bin/python -m mlp.main --port 8765`
(Windows: `.venv\Scripts\python -m mlp.main --port 8765`), then open <http://localhost:8765>.

### Manual setup (if the script doesn't suit you)
```sh
python3 -m venv .venv                                  # Windows: py -3 -m venv .venv
.venv/bin/pip install -r requirements.txt              # Windows: .venv\Scripts\pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
.venv/bin/python launcher/launch.py                    # Windows: .venv\Scripts\python launcher\launch.py
```

### Updating and uninstalling
- **Update:** `git pull`, then run the setup script again. It reuses the Python environment and rebuilds the interface.
- **Stop:** *Settings → Quit*, or `launch.py --stop`.
- **Uninstall:** delete the project folder and the shortcut(s). On macOS also delete `~/Applications/ML Playground.app`;
  on Linux `~/.local/share/applications/ml-playground.desktop`; on Windows the Start-menu entry. Your projects live in
  `data/` inside the project folder, so back it up first if you want to keep them.

### Troubleshooting
- **Nothing opens:** look at `data/logs/launcher.log` and `data/logs/server.log`.
- **"Python 3.10+ is required":** install a newer Python and run the setup script again (delete `.venv` first).
- **Linux: "Couldn't create a virtual environment":** `sudo apt install python3-venv`.
- **Port already in use:** the launcher picks the next free port between 8765 and 8800. *Settings → Server & port*
  can move a running app.

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
