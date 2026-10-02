# Lessons section (requested 2026-10-01) — DONE, see docs/lessons_workflow.md

Goal: a "Lessons" area that teaches the right way of thinking about classic ML problems.

Each lesson:
1. **Teach** — plain-language explanation of the problem (e.g. class imbalance, feature bias / leakage, overfitting,
   scaling, missing data, data leakage, distribution shift, high cardinality, multicollinearity…).
2. **Interactive example** — a live, animated demo inside the lesson using the app's tools.
3. **Practice challenge** — hand the learner a dataset that exhibits the issue + a clear goal; they solve it using the
   tools the app offers (Prepare/Train/Improve). The app checks whether the goal is met.

Constraints:
- Use datasets referenced in the user's **caplancamp** project on their laptop (find links there).
- Every challenge dataset must be tested: the issue must be demonstrably present AND solvable with in-app tools
  (record baseline vs. solved metrics).
- Work after the current build/integration tasks are finished.
