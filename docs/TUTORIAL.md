# Tutorial: your first models (≈20 minutes)

Three short projects, each building on the last, then your first lesson.

## Part 1: Iris flowers (5 min) — the whole loop
1. On **Projects**, click the **Iris flowers** quick-start card. The data is loaded and three models are picked.
2. **Models**: note *Logistic Regression*, *Random Forest* and *K-Nearest Neighbors*. Click **Neural networks** in
   Quick picks to add an MLP too. Open its **Design** button and add a layer; watch the diagram grow. Close it.
3. **Data**: the target is `species`. Look at the *Bird's-eye view*: the three species form clear clusters, so this
   should be easy.
4. **Prepare**: press **Run preparation**. You'll see a 70 / 10 / 20 train / validation / test split and standard
   scaling.
5. **Train**: press **Start training** and watch the MLP's loss fall while its connections recolour.
6. **Results**: the leaderboard ranks models by test accuracy. Find the 🎯 baseline (≈33%, always guessing one
   species). Click the winner and open **Decision map**: coloured regions show what the model would answer
   everywhere.
7. Press **Save to library**, then open **Model Library → your model → Try it live**. Drag `petal_length` and watch
   the prediction flip between species.

**Takeaway:** train/test split, comparing models against a baseline, and reading a decision map.

## Part 2: Card fraud (8 min) — when accuracy lies
1. Start the **Card fraud — imbalanced** quick start. On **Data**, the class balance shows only ~5% fraud. The coach
   warns about imbalance.
2. **Prepare → Run**, then **Train**. Accuracy looks great (~95%), but open a model's **Errors** tab: the confusion
   matrix shows most frauds were missed. The coach says *"The rare class is being missed."*
3. Go back to **Prepare → Balance**, choose **Grow the rare classes** with **SMOTE**, and run again. Watch the
   synthetic fraud points pop into the scatter.
4. **Train again**. Recall (frauds caught) jumps. Sort the leaderboard by **F1** or **Balanced accuracy** instead of
   accuracy.
5. Open **Calibration**: after SMOTE the probabilities are inflated. That's fine for catching fraud, but don't treat
   them as real risk percentages.
6. **Improve → Decision threshold**: slide it and watch precision trade against recall.

**Takeaway:** pick metrics that match the goal; rebalancing helps you catch rare cases but distorts probabilities.

## Part 3: Design your own data (7 min) — feature engineering
1. **New project → Regression**. In **Models**, pick *Linear Regression* and *Random Forest*.
2. **Data → Generate**. Keep the default features, and set the target rule to **Formula**:
   `2 * age * (plan == "pro") + noise(5)`. Watch the target histogram update. Click **Create dataset**.
3. **Prepare → Run → Train**. The forest beats the linear model: a straight line can't express "age matters only
   for pro users".
4. **Prepare → Create features → Formula**: `age * (plan == "pro")`, then train again. Now the linear model catches
   up, because the right feature beats a fancier model.

**Takeaway:** models only see the columns you give them.

## Part 4: Your first lesson
Open **Lessons → Baselines: is 0.82 any good?**
1. **Learn**: four short cards.
2. **Try it**: switch between *always the average*, *a straight line* and *a smarter curve*.
3. **Quiz**: two questions.
4. **Practice → Start challenge**. Train, then press **Check against the real world** on the results. Read the
   comparison between your test score and the real-world score, use hints if you need them, and pass the goal.

Next, try the lessons in order. Each one targets a mistake that real projects make.
