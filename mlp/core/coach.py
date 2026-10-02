"""Rule-based coach: plain-language suggestions with one-click actions.

Suggestion = {id, severity: info|warn|high, title, why, action?: {kind, label, ...}}
action kinds: pipeline{patch} | model_params{key, patch, arch_dropout?, arch_scale?} | add_models{model_ids}
              | options{patch} | goto{step} | tune{key} | project{patch}
"""
from __future__ import annotations

from .registry import MODEL_INDEX, defaults

SCALE_SENSITIVE = {"svm", "svr", "knn", "logistic_regression", "ridge", "lasso", "elastic_net", "mlp", "cnn1d", "cnn2d",
                   "ft_transformer", "gcn"}
TREE_LIKE = {"decision_tree", "random_forest", "extra_trees", "gradient_boosting", "hist_gradient_boosting", "xgboost",
             "lightgbm", "adaboost"}


def S(id_, severity, title, why, action=None):
    return {"id": id_, "severity": severity, "title": title, "why": why, **({"action": action} if action else {})}


# ----------------------------------------------------------------------------- data stage
def data_suggestions(summary: dict, profile: dict, task: str | None, target: str | None) -> list[dict]:
    out = []
    n = summary.get("n_rows", 0)
    cols = {c["name"]: c for c in summary.get("columns", [])}
    if n and n < 300:
        out.append(S("tiny", "info", "Small dataset",
                     f"Only {n} rows. Simple models (logistic/linear, KNN, small trees) are usually more reliable here, and cross-validation gives a fairer score."))
    if n > 100_000:
        out.append(S("big", "info", "Large dataset", "SVM and KNN get slow above ~50k rows. Boosting (XGBoost, LightGBM, Histogram Boosting) scales best."))
    if target and target in cols:
        t = cols[target]
        if task == "classification" and t["role"] == "numeric" and t["unique"] > 20:
            out.append(S("looks_reg", "high", "This target looks continuous",
                         f"'{target}' has {t['unique']} different numeric values — that's usually a regression problem.",
                         {"kind": "project", "label": "Switch to regression", "patch": {"task": "regression"}}))
        if task == "regression" and (t["role"] != "numeric" or t["unique"] <= 10):
            out.append(S("looks_cls", "high", "This target looks like categories",
                         f"'{target}' only has {t['unique']} distinct values — classification may fit better.",
                         {"kind": "project", "label": "Switch to classification", "patch": {"task": "classification"}}))
        if task == "regression" and t.get("stats", {}).get("skew") and abs(t["stats"]["skew"]) > 2 and (t["stats"].get("min") or 0) >= 0:
            out.append(S("skew", "warn", "Target is very skewed",
                         "A few huge values dominate. Predicting log(target) often makes errors more even.",
                         {"kind": "pipeline", "label": "Use log transform", "patch": {"target_transform": "log1p"}}))
    cb = profile.get("class_balance") if profile else None
    if task == "classification" and cb and len(cb["counts"]) >= 2:
        counts = cb["counts"]
        share = min(counts) / max(1, sum(counts))
        ratio = max(counts) / max(1, min(counts))
        if share < 0.2 or ratio > 4:
            out.append(S("imbalance", "high", "Classes are imbalanced",
                         f"The rarest class is only {share:.0%} of the data ({ratio:.0f}× fewer than the largest). Models may just predict the majority. "
                         "Rebalancing the training set (e.g. SMOTE) and judging by F1 / balanced accuracy helps.",
                         {"kind": "pipeline", "label": "Balance with SMOTE",
                          "patch": {"resample": {"mode": "oversample", "over": "smote" if min(counts) >= 6 else "random"}}}))
    if summary.get("n_duplicates"):
        out.append(S("dupes", "warn", f"{summary['n_duplicates']} duplicate rows",
                     "Exact copies can land in both train and test, so the model gets 'tested' on rows it memorised. Remove them.",
                     {"kind": "pipeline", "label": "Remove duplicates", "patch": {"dedupe": {"enabled": True}}}))
    for name, c in cols.items():
        if name == target:
            continue
        if c["role"] == "datetime":
            out.append(S(f"date_{name}", "info", f"'{name}' is a date",
                         "Models can't use raw dates, but they love date parts like month, weekday or hour.",
                         {"kind": "pipeline", "label": "Add date parts", "patch": {"features_add": [{"op": "date_parts", "column": name, "parts": ["month", "weekday", "hour"]}]}}))
            continue
        if c.get("repeats") and ("id" in name.lower() or c["role"] == "id"):
            out.append(S(f"group_{name}", "high", f"Rows repeat per '{name}'",
                         f"Each '{name}' appears ~{c['repeats']:.0f} times. If rows from the same {name} land in both train and test, the score is too optimistic — split by group.",
                         {"kind": "pipeline", "label": f"Split by {name}", "patch": {"split": {"method": "group", "group_column": name}}}))
        miss = c["missing"] / max(1, n)
        if miss > 0.6:
            out.append(S(f"drop_{name}", "warn", f"'{name}' is mostly empty",
                         f"{miss:.0%} of values are missing — it probably adds more noise than signal.",
                         {"kind": "pipeline", "label": f"Drop '{name}'", "patch": {"drop_columns_add": [name]}}))
        elif miss > 0.05:
            out.append(S(f"miss_{name}", "info", f"'{name}' has missing values",
                         f"{miss:.0%} missing. They'll be filled in automatically (median / most common) — you can change how on the Prepare step."))
        if c["role"] in ("id", "text"):
            out.append(S(f"id_{name}", "info", f"'{name}' looks like an ID or free text",
                         "Almost every value is unique, so it can't generalise. It will be ignored automatically."))
        elif c["role"] == "categorical" and c["unique"] > 30:
            out.append(S(f"card_{name}", "warn", f"'{name}' has {c['unique']} categories",
                         "One-hot encoding would create many columns. Rare categories get grouped, or use ordinal encoding.",
                         {"kind": "pipeline", "label": "Use ordinal encoding", "patch": {"encode": {"method": "ordinal"}}}))
    for tc in (profile or {}).get("target_correlations", [])[:3]:
        if abs(tc["r"] or 0) > 0.98:
            out.append(S(f"leak_{tc['feature']}", "high", f"'{tc['feature']}' may leak the answer",
                         f"It correlates {tc['r']:+.2f} with the target — almost perfectly. If it's only known after the fact, drop it.",
                         {"kind": "pipeline", "label": f"Drop '{tc['feature']}'", "patch": {"drop_columns_add": [tc["feature"]]}}))
    return out


# ----------------------------------------------------------------------------- prepare stage
def prepare_suggestions(report: dict, spec: dict, model_ids: list[str], task: str) -> list[dict]:
    out = []
    if spec.get("scale", {}).get("method", "standard") == "none" and SCALE_SENSITIVE & set(model_ids):
        names = ", ".join(MODEL_INDEX[m]["label"] for m in model_ids if m in SCALE_SENSITIVE)
        out.append(S("scale", "high", "Turn on scaling",
                     f"{names} compare distances or use gradients, so features on big scales drown out small ones.",
                     {"kind": "pipeline", "label": "Standard scaling", "patch": {"scale": {"method": "standard"}}}))
    after = report.get("class_counts_after")
    if task == "classification" and after:
        vals = [v for v in after.values() if v > 0]
        if vals and max(vals) / max(1, min(vals)) > 4 and spec.get("resample", {}).get("mode", "none") == "none":
            out.append(S("imb2", "warn", "Training set is still imbalanced",
                         "Consider oversampling the rare class (SMOTE) or undersampling the common one.",
                         {"kind": "pipeline", "label": "Balance with SMOTE", "patch": {"resample": {"mode": "oversample", "over": "smote"}}}))
    for w in report.get("warnings", []):
        out.append(S(f"w_{abs(hash(w)) % 10**6}", "info", "Heads-up", w))
    nf, ntr = report.get("n_features", 0), report.get("splits", {}).get("train", 0)
    if nf > 30 and ntr and nf > ntr / 10:
        out.append(S("many_features", "warn", "Lots of features for the amount of data",
                     f"{nf} features vs {ntr} training rows. Selecting the most useful ones can reduce overfitting.",
                     {"kind": "pipeline", "label": "Keep best 15", "patch": {"feature_select": {"method": "kbest", "k": 15}}}))
    return out


# ----------------------------------------------------------------------------- results stage
def _p(model_cfgs, key):
    for m in model_cfgs or []:
        if m["key"] == key:
            return {**defaults(m["model_id"]), **(m.get("params") or {})}
    return {}


def _regularize(model_id: str, p: dict) -> tuple[dict, dict]:
    """Returns (param patch, extra action fields) that make the model simpler."""
    if model_id == "decision_tree":
        return {"max_depth": max(2, int((p.get("max_depth") or 12) * 0.6)), "min_samples_leaf": max(5, int(p.get("min_samples_leaf", 1)) * 3)}, {}
    if model_id in ("random_forest", "extra_trees"):
        d = p.get("max_depth") or 0
        return {"max_depth": 10 if d == 0 else max(3, int(d * 0.7)), **({"min_samples_leaf": 3} if model_id == "random_forest" else {})}, {}
    if model_id in ("xgboost", "gradient_boosting"):
        return {"max_depth": max(2, int(p.get("max_depth", 6)) - 2), "subsample": 0.8}, {}
    if model_id == "lightgbm":
        return {"num_leaves": max(4, int(p.get("num_leaves", 31)) // 2), "subsample": 0.8}, {}
    if model_id == "hist_gradient_boosting":
        return {"max_leaf_nodes": max(4, int(p.get("max_leaf_nodes", 31)) // 2)}, {}
    if model_id in ("logistic_regression", "svm", "svr"):
        return {"C": round(float(p.get("C", 1.0)) / 4, 4)}, {}
    if model_id in ("ridge", "lasso", "elastic_net"):
        return {"alpha": round(float(p.get("alpha", 1.0)) * 4, 4)}, {}
    if model_id == "knn":
        return {"n_neighbors": min(100, int(p.get("n_neighbors", 5)) * 2 + 1)}, {}
    if MODEL_INDEX[model_id].get("nn"):
        return {"weight_decay": min(0.05, float(p.get("weight_decay", 1e-4)) * 10 or 1e-3)}, {"arch_dropout": 0.3}
    return {}, {}


def _grow(model_id: str, p: dict) -> tuple[dict, dict]:
    if model_id == "decision_tree":
        return {"max_depth": min(30, int(p.get("max_depth") or 6) + 4)}, {}
    if model_id in ("random_forest", "extra_trees"):
        return {"n_estimators": min(1000, int(p.get("n_estimators", 200)) * 2), "max_depth": 0}, {}
    if model_id in ("xgboost", "gradient_boosting", "lightgbm"):
        return {"n_estimators": min(1000, int(p.get("n_estimators", 200)) * 2), "max_depth": min(12, int(p.get("max_depth", 6)) + 2)} if model_id != "lightgbm" else {"num_leaves": min(255, int(p.get("num_leaves", 31)) * 2)}, {}
    if model_id in ("logistic_regression", "svm", "svr"):
        return {"C": min(100.0, float(p.get("C", 1.0)) * 4)}, {}
    if model_id in ("ridge", "lasso", "elastic_net"):
        return {"alpha": max(0.0001, float(p.get("alpha", 1.0)) / 10)}, {}
    if model_id == "knn":
        return {"n_neighbors": max(1, int(p.get("n_neighbors", 5)) // 2)}, {}
    if MODEL_INDEX[model_id].get("nn"):
        return {"epochs": min(500, int(p.get("epochs", 60)) * 2)}, {"arch_scale": 2}
    return {}, {}


def results_suggestions(results: dict, lb: list, prepared, model_cfgs, options) -> list[dict]:
    out = []
    task = prepared.task
    # Balanced accuracy is immune to class imbalance, so it is the fair yardstick for over/under-fitting.
    metric = "balanced_accuracy" if task == "classification" else "r2"
    k = len(prepared.classes or [])
    chance = 1 / k if k else 0.0
    resampling_on = prepared.spec.get("resample", {}).get("mode", "none") != "none"
    rare_ignored, thr_models, miscalibrated = [], [], []
    real = {k: v for k, v in results.items() if k != "baseline"}
    base = results.get("baseline")
    if base:
        bm = "balanced_accuracy" if task == "classification" else "r2"
        bscore = base["metrics"]["test"].get(bm)
        losers = [r["label"] for k, r in results.items() if k != "baseline" and r["metrics"]["test"].get(bm) is not None
                  and bscore is not None and r["metrics"]["test"][bm] <= bscore + (0.02 if task == "classification" else 0.05)]
        if losers:
            out.append(S("baseline", "high", "No better than guessing",
                         f"{', '.join(losers[:3])} barely beat{'s' if len(losers) == 1 else ''} the baseline that always gives the same answer. "
                         "Something is missing: better features, a more flexible model, or the target may not be predictable from these columns."))
    for key, res in results.items():
        if key == "baseline":
            continue
        mid, label = res["model_id"], res["label"]
        test = res["metrics"].get("test", {})
        train = res["metrics"].get("train", {})
        p = _p(model_cfgs, key)
        ts, trs = test.get(metric), train.get(metric)
        notes = res.get("notes") or {}
        if notes.get("diverged"):
            out.append(S(f"div_{key}", "high", f"{label} blew up during training",
                         "The loss became NaN — the learning rate is too high for this network.",
                         {"kind": "model_params", "key": key, "label": "Lower learning rate ÷10", "patch": {"lr": round(float(p.get("lr", 0.003)) / 10, 6)}}))
            continue
        if ts is None or trs is None:
            continue
        gap = trs - ts
        name = "balanced accuracy" if task == "classification" else "R²"
        if gap > 0.08:
            patch, extra = _regularize(mid, p)
            out.append(S(f"overfit_{key}", "high" if gap > 0.15 else "warn", f"{label} is overfitting",
                         f"Training {name} is {trs:.2f} but only {ts:.2f} on unseen test data — it memorised details that don't generalise. "
                         "Making it simpler usually closes the gap.",
                         {"kind": "model_params", "key": key, "label": "Simplify the model", "patch": patch, **extra} if patch else None))
        elif (task == "classification" and ts < chance + 0.1 and trs < chance + 0.2) or (task == "regression" and ts < 0.2 and trs < 0.35):
            patch, extra = _grow(mid, p)
            why = (f"Even on training data it only reaches {trs:.2f} {name}" + (f" (random guessing ≈ {chance:.2f})." if task == "classification" else ".")
                   + " Give it more capacity, or try a more flexible model.")
            out.append(S(f"underfit_{key}", "warn", f"{label} is underfitting", why,
                         {"kind": "model_params", "key": key, "label": "Give it more capacity", "patch": patch, **extra} if patch else None))
        if notes.get("plateau"):
            out.append(S(f"plateau_{key}", "warn", f"{label} barely learned",
                         "The training loss hardly moved. A higher learning rate (or fewer layers) often unsticks it.",
                         {"kind": "model_params", "key": key, "label": "Learning rate ×3", "patch": {"lr": min(0.3, float(p.get("lr", 0.003)) * 3)}}))
        elif notes.get("early_stopped"):
            out.append(S(f"es_{key}", "info", f"{label} stopped early at epoch {notes['early_stopped']}",
                         f"Validation loss stopped improving after epoch {notes.get('best_epoch')}, so the best weights were kept — early stopping protecting you from overfitting."))
        if task == "classification":
            acc, ba = test.get("accuracy"), test.get("balanced_accuracy")
            if acc is not None and ba is not None and acc - ba > 0.1:
                rare_ignored.append(label)
            auc, f1 = test.get("roc_auc"), test.get("f1")
            if k == 2 and auc and f1 is not None and auc > 0.8 and f1 < 0.7:
                thr_models.append(label)
        else:
            hr = (res.get("residuals") or {}).get("hetero_r")
            if hr is not None and hr > 0.3 and prepared.spec.get("target_transform", "none") == "none":
                out.append(S(f"het_{key}", "info", f"{label}'s errors grow with the prediction",
                             "Big values get bigger errors. Predicting log(target) often evens this out.",
                             {"kind": "pipeline", "label": "Use log transform", "patch": {"target_transform": "log1p"}}))
        cal = res.get("calibration")
        if cal and cal.get("ece") is not None and cal["ece"] > 0.08:
            miscalibrated.append((label, cal["ece"]))
        cv = res.get("cv")
        if cv and cv.get("std") and cv["std"] > 0.05:
            out.append(S(f"cvstd_{key}", "warn", f"{label}'s score is unstable",
                         f"Across folds it varies by ±{cv['std']:.2f}. More data or a simpler model gives steadier results."))
    if rare_ignored:
        who = ", ".join(rare_ignored[:3]) + ("…" if len(rare_ignored) > 3 else "")
        if resampling_on:
            action = {"kind": "goto", "step": "improve", "label": "Open threshold tuner"} if k == 2 else None
            why = (f"{who}: accuracy is much higher than balanced accuracy, so the rare class is still often missed even with rebalancing. "
                   "Judge by F1 / balanced accuracy, try 'balanced' class weights, or lower the decision threshold.")
        else:
            action = {"kind": "pipeline", "label": "Rebalance with SMOTE", "patch": {"resample": {"mode": "oversample", "over": "smote"}}}
            why = f"{who}: accuracy looks fine but balanced accuracy is much lower — they mostly predict the common class."
        out.append(S("rare", "high", "The rare class is being missed", why, action))
    if miscalibrated:
        who = ", ".join(f"{n} (off by {e:.0%})" for n, e in miscalibrated[:3]) + ("…" if len(miscalibrated) > 3 else "")
        if prepared.spec.get("resample", {}).get("mode", "none") != "none":
            out.append(S("calibration", "warn", "Probabilities are inflated",
                         f"{who}. Rebalancing taught the models a fake base rate (the rare class looked common). If you use the "
                         "probabilities themselves, train on the real class mix — calibrating on rebalanced rows keeps the wrong base rate.",
                         {"kind": "pipeline", "label": "Turn rebalancing off", "patch": {"resample": {"mode": "none"}}}))
        else:
            out.append(S("calibration", "warn", "Probabilities are off",
                         f"{who}. When they say 70%, reality differs. If you use the probabilities (risk scores, staffing, pricing), calibrate them.",
                         {"kind": "options", "label": "Calibrate probabilities", "patch": {"calibrate": "isotonic"}}))
    if thr_models and not rare_ignored:
        out.append(S("thr", "info", "A different decision threshold may help",
                     f"{', '.join(thr_models[:3])} rank examples well (high ROC-AUC) but F1 is modest. Moving the 50% threshold trades precision for recall.",
                     {"kind": "goto", "step": "improve", "label": "Open threshold tuner"}))
    si = (prepared.report or {}).get("split_info") or {}
    if si.get("method") == "random" and si.get("shared_groups"):
        out.append(S("groups_shared", "high", "The same groups are in train and test",
                     f"{si['shared_groups']} values of '{si.get('group_column')}' appear on both sides of the split, so the test score is optimistic. Use a group split.",
                     {"kind": "pipeline", "label": "Split by group", "patch": {"split": {"method": "group"}}}))
    if not (options or {}).get("cv_folds") and any(not MODEL_INDEX[r["model_id"]].get("nn") for r in real.values()):
        out.append(S("cv", "info", "Confirm with cross-validation",
                     "One test split can be lucky or unlucky. 5-fold CV trains five times on different slices and averages the score.",
                     {"kind": "options", "label": "Enable 5-fold CV", "patch": {"cv_folds": 5}}))
    ids = {r["model_id"] for r in real.values()}
    if len(real) == 1:
        suggest = [m for m in (["random_forest", "xgboost", "logistic_regression"] if task == "classification" else ["random_forest", "xgboost", "ridge"]) if m not in ids][:2]
        out.append(S("compare", "info", "Compare against other models",
                     "There's no single best algorithm — trying a couple of different families shows what this data likes.",
                     {"kind": "add_models", "label": "Add " + " + ".join(MODEL_INDEX[m]["label"] for m in suggest), "model_ids": suggest}))
    lb_real = [row for row in lb if not row.get("baseline")]
    if lb_real:
        best = lb_real[0]
        if not MODEL_INDEX[best["model_id"]].get("nn"):
            out.append(S("tune_best", "info", f"Fine-tune {best['label']}",
                         "Automatic search tries many settings with cross-validation and keeps the best.",
                         {"kind": "tune", "key": best["key"], "label": "Start tuning"}))
    if len(prepared.y_train) < 300 and ids & {"mlp", "cnn1d", "ft_transformer", "gcn", "xgboost", "lightgbm"}:
        out.append(S("small_nn", "info", "Small data, big models",
                     "Neural nets and boosting shine with thousands of rows. With little data, simpler models often win."))
    order = {"high": 0, "warn": 1, "info": 2}
    return sorted(out, key=lambda s: order[s["severity"]])[:10]


def unsupervised_suggestions(results: dict, prepared) -> list[dict]:
    out = []
    task = prepared.task
    has_truth = bool((prepared.payload or {}).get("truth_train"))
    scaled = prepared.spec.get("scale", {}).get("method", "standard") != "none"
    if not scaled:
        out.append(S("scale_unsup", "high", "Turn on scaling",
                     "Clustering, maps and anomaly scores all measure distances. Unscaled, the column with the biggest numbers decides everything.",
                     {"kind": "pipeline", "label": "Standard scaling", "patch": {"scale": {"method": "standard"}}}))
    for key, res in results.items():
        m = res["metrics"].get("test", {})
        label = res["label"]
        if task == "clustering":
            sil = m.get("silhouette")
            if res["model_id"] == "dbscan" and (m.get("noise_share") or 0) > 0.5:
                out.append(S(f"noise_{key}", "warn", f"{label} called most rows noise",
                             "The neighbourhood size (eps) is too small for this data — try a larger eps or fewer min neighbours.",
                             {"kind": "model_params", "key": key, "label": "Double eps", "patch": {"eps": round(float(res["params"].get("eps", 0.8)) * 2, 2)}}))
            elif res["model_id"] == "dbscan" and m.get("n_clusters", 0) <= 1:
                out.append(S(f"one_{key}", "warn", f"{label} found a single blob",
                             "eps is so large that everything is connected. Try a smaller eps.",
                             {"kind": "model_params", "key": key, "label": "Halve eps", "patch": {"eps": round(float(res["params"].get("eps", 0.8)) / 2, 2)}}))
            elif sil is not None and sil < 0.25:
                out.append(S(f"sil_{key}", "info", f"{label}'s groups overlap a lot",
                             f"Silhouette is {sil:.2f} (1 = crisp, 0 = overlapping). Try a different k, fewer/better features, or a PCA step."))
        if task == "anomaly" and has_truth and m.get("roc_auc") is not None and m["roc_auc"] < 0.7:
            if res["model_id"] == "lof":
                nn = int(res["params"].get("n_neighbors", 20))
                out.append(S(f"auc_{key}", "warn", f"{label} is being fooled by groups of anomalies",
                             f"ROC-AUC {m['roc_auc']:.2f}. When anomalies resemble each other, each one's {nn} nearest neighbours are other "
                             "anomalies, so it looks 'normal' locally (masking). Use more neighbours than a group of anomalies.",
                             {"kind": "model_params", "key": key, "label": f"Use {nn * 3} neighbours", "patch": {"n_neighbors": min(100, nn * 3)}}))
            else:
                out.append(S(f"auc_{key}", "warn", f"{label} struggles to rank the real anomalies",
                             f"ROC-AUC {m['roc_auc']:.2f}. Check scaling, try another detector, or drop columns that are noisy for everyone."))
    if task == "clustering":
        out.append(S("sweep", "info", "Not sure about k?",
                     "The k sweep tries k = 2…10 and plots how crisp the groups are (silhouette) and the elbow of the within-cluster spread.",
                     {"kind": "goto", "step": "improve", "label": "Open the k sweep"}))
        if has_truth:
            out.append(S("truth", "info", "Compare with the hidden truth",
                         "Your data has a truth column the models never saw. Agreement scores (ARI, purity) show whether the groups match it — real projects rarely have this luxury."))
    return out
