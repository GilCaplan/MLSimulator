# Lessons — authoring workflow

Every lesson teaches one classic ML problem in four parts: **Learn → Try it → Quiz → Practice challenge**.
The challenge hands the learner a dataset with the problem baked in; they solve it with the app's normal tools and
their trained model is auto-graded on a **hidden test set** that represents the real world.

## Curriculum (pipeline order)
| # | id | Problem | Practice data (modeled on a CaplanCamp project) | The naive setup that fails | Intended fix |
|---|----|---------|-----------------------------------------------|----------------------------|--------------|
| 1 | `baselines` | Scores without context | NYC bus delays | straight line through `hour` (≈9% better than the mean) | a model that follows the rush-hour humps (≥ 30% better) |
| 2 | `missing` | Missing-not-at-random | Hospital readmissions (UCI 130 hospitals) | drop incomplete rows | median imputation |
| 3 | `outliers` | Impossible values + skew | Used cars (Craigslist) | train on typos, raw prices | target range filter + log(1+y) |
| 4 | `leakage` | After-the-fact columns | Flight delays (airline delay causes) | use delay-cause minutes | ignore the 3 leaky columns |
| 5 | `features` | Missing interactions / raw dates | NYC taxi tips (linear models only) | raw columns | date parts + `fare × card` + late-night formula |
| 6 | `splits` | Group leakage | Alzheimer's clinic visits (3–7 per patient) | random split (test overstates by ≈10 pts) | group split by `patient_id` |
| 7 | `scaling` | Unscaled distances | NYC apartment rents | KNN without scaling | standard scaling (KNN only) |
| 8 | `imbalance` | 2% positives | Card fraud | accuracy-optimised models | SMOTE / class weights |
| 9 | `overfitting` | Memorisation | Startups (320 rows, 40 noise metrics) | unlimited decision tree | depth ≤ 4, ≥ 10–15 per leaf |
| 10 | `calibration` | Inflated probabilities | ICU after surgery | SMOTE (calibrating on SMOTE rows also fails) | train on the real class mix |
| 11 | `shortcut` | Spurious correlation | Heart disease screening | model uses `clinic` | ignore `clinic` |
| 12 | `fairness` | Label bias + proxy | Loans (Prosper) / recidivism | uses gender (+ proxy) | drop gender **and** `shopping_profile` |

## How the hidden test works
`mlp/lessons/generators.py` returns `(train_df, hidden_df)` per lesson (deterministic, seed 7 for the shipped data):
- **missing** — hidden has the same missingness (the population the model will serve).
- **outliers** — hidden has no typos (real listings).
- **leakage** — the after-the-fact columns are empty (unknown at prediction time).
- **shortcut** — clinic is independent of the diagnosis (new deployment).
- **fairness** — labels are the true outcomes (no biased bookkeeping); graded on per-gender true-positive-rate gap.
- **baselines** — graded on MAE improvement over always predicting the training mean.
- **splits** — hidden set = brand-new patients; also graded on how close the learner's own test accuracy is to reality.
- **calibration** — graded on expected calibration error of the positive-class probability + ROC-AUC.

Grading (`mlp/lessons/grading.py`) runs the learner's trained model + its fitted preprocessing on the hidden rows
(`POST /api/lessons/{id}/check`) and compares goal metrics (accuracy, balanced accuracy, recall/precision of the
positive class, R², TPR gap, MAE vs baseline, own-test-vs-real-world gap, calibration error, ROC-AUC). `allowed_models` can force a technique (KNN for scaling, Decision Tree for overfitting).

## Adding or changing a lesson
1. **Generator** — add `def my_problem(seed=7, n=..., n_hidden=...) -> (train, hidden)` to `generators.py` and register it
   in `GENERATORS`. Make the hidden set express the real-world condition the lesson is about.
2. **Challenge spec** — add an entry to `CHALLENGES` in `grading.py`: task, target, positive class (and `group` for
   fairness), `preset_pipeline` / `preset_models` / `preset_params` (the naive starting point the learner receives),
   `goals`, optional `allowed_models`, and reference configs `solution` (must pass) and optional `partial` (must fail).
3. **Validate** — the issue must be present AND solvable with in-app tools:
   ```sh
   PYTHONPATH=. .venv/bin/python scripts/validate_lessons.py --seeds 7,11,23,31,47 --verbose
   ```
   Tune generator strength and goal thresholds until every seed shows `✓ naive  ✓ solution`. Leave a margin between
   the best naive score and the worst solution score.
4. **Content** — add the lesson to `LESSONS` in `mlp/lessons/catalog.py`: learn cards, demo id + caption, 2 quiz
   questions, challenge story / task / 3 progressive hints / solution text. Copy the numbers in the solution text from
   the validator output.
5. **Demo** — add an interactive client-side widget in `frontend/src/components/lessons/demos/` and register it in
   `DEMOS` under the lesson's `demo` id.
6. **End-to-end check** — run the server and `.venv/bin/python scripts/smoke_lessons.py <port>`.

## Progress
Stored server-side in `data/lessons/progress.json` (survives port changes): learn/demo/quiz flags, the challenge
project id, attempts, last check and completion time. Challenge projects carry `project.challenge.lesson_id`; the
wizard shows a challenge banner, hides coach tips behind a spoiler button, and offers "Check against the real world"
on the Train results.
