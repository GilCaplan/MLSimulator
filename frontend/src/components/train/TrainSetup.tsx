import { motion } from "framer-motion";
import { useState } from "react";
import { fadeUp, spring, stagger } from "../../design/motion";
import { navigate } from "../../lib/router";
import { DEFAULT_OPTIONS, useJob, useProject } from "../../lib/store";
import type { TrainOptions } from "../../lib/types";
import { Field, Glass, InfoTip, NumberField, Segmented, Select, Spinner } from "../glass";
import { CV_SCORING, keySettings, primaryMetric, startTraining } from "./util";

/** The "before training" panel: the line-up, training options and the big start button. */
export function TrainSetup({ onCancel }: { onCancel?: () => void }) {
  const project = useProject((s) => s.project)!;
  useProject((s) => s.registry); // re-render once specs arrive
  const spec = useProject((s) => s.spec);
  const jobBusy = useJob((s) => s.status === "running");
  const [starting, setStarting] = useState(false);
  const opts: TrainOptions = { ...DEFAULT_OPTIONS, ...(project.options || {}) };
  const task = project.task ?? "classification";
  const setOpt = (patch: Partial<TrainOptions>) => useProject.getState().update({ options: { ...opts, ...patch } });
  const hasClassic = project.models.some((m) => !spec(m.model_id)?.nn);

  const go = async () => {
    setStarting(true);
    await startTraining();
    setStarting(false);
  };

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <Glass animate_in>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="col" style={{ gap: 2 }}>
            <h3>The line-up</h3>
            <span className="small muted">{project.models.length} model{project.models.length === 1 ? "" : "s"} will learn from the same training rows and be graded on the same hidden test rows.</span>
          </div>
          <button className="btn sm ghost" onClick={() => navigate(`/p/${project.id}/models`)}>Edit models</button>
        </div>
        <motion.div variants={stagger(0.04)} className="col" style={{ gap: 8 }}>
          {project.models.length === 0 && (
            <div className="inset row between" style={{ padding: "14px 16px" }}>
              <span className="muted">No models picked yet.</span>
              <button className="btn sm primary" onClick={() => navigate(`/p/${project.id}/models`)}>Pick models →</button>
            </div>
          )}
          {project.models.map((m, i) => {
            const s = spec(m.model_id);
            return (
              <motion.div key={m.key} variants={fadeUp} className="inset row" style={{ padding: "10px 14px", gap: 12 }}>
                <span className="faint num small" style={{ width: 16 }}>{i + 1}</span>
                <motion.span whileHover={{ scale: 1.2, rotate: -8 }} transition={spring.pop}
                  style={{ fontSize: 22, width: 38, height: 38, borderRadius: 12, background: "var(--glass-strong)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {s?.emoji ?? "🤖"}
                </motion.span>
                <div className="col grow" style={{ gap: 1 }}>
                  <b style={{ fontSize: 14 }}>{s?.label ?? m.model_id}</b>
                  <span className="tiny faint">{s?.family}{s?.nn && !/neural/i.test(s.family) ? " · neural network" : ""}</span>
                </div>
                <div className="row wrap" style={{ gap: 6, justifyContent: "flex-end" }}>
                  {keySettings(m).map((k) => <span key={k} className="badge">{k}</span>)}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </Glass>

      <Glass animate_in>
        <h3 style={{ marginBottom: 14 }}>Training options</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
          <Field label="Cross-validation" help="Cross-validation trains the model several times, each time holding out a different slice of the training data, and averages the scores. It's slower but tells you how stable a score is. Neural networks skip it to save time.">
            <div>
              <Segmented value={String(opts.cv_folds || 0)} onChange={(v) => setOpt({ cv_folds: Number(v) })}
                options={[{ value: "0", label: "Off" }, { value: "3", label: "3" }, { value: "5", label: "5" }, { value: "10", label: "10" }]} />
            </div>
            <span className="tiny faint">{opts.cv_folds ? `Re-checks each model on ${opts.cv_folds} different slices of the data.` : "One quick check on the test rows."}{opts.cv_folds && !hasClassic ? " (Only classic models run CV.)" : ""}</span>
          </Field>
          <Field label="CV metric" help="Which score cross-validation reports for each fold.">
            <Select value={opts.cv_scoring || primaryMetric(task)} onChange={(v) => setOpt({ cv_scoring: v })} options={CV_SCORING[task]} style={{ opacity: opts.cv_folds ? 1 : 0.5 }} />
          </Field>
          <Field label="Random seed" help="Models use randomness (shuffling, starting weights). The same seed gives the same result every time — change it to see how much luck is involved.">
            <div className="row" style={{ gap: 8 }}>
              <NumberField value={opts.seed} onChange={(v) => setOpt({ seed: Math.round(v) })} min={0} max={99999} />
              <motion.button whileTap={{ rotate: 180, scale: 0.9 }} className="btn sm icon" title="Roll a random seed" onClick={() => setOpt({ seed: Math.floor(Math.random() * 10000) })}>🎲</motion.button>
            </div>
          </Field>
          {task === "classification" && (
            <Field label="Calibrate probabilities"
              help="Many models give probabilities that aren't honest — “90% sure” might only be right 70% of the time (resampling like SMOTE makes this worse). Calibration fits a small correction on held-out folds so the numbers mean what they say. Sigmoid fits a smooth S-curve (good for small data); isotonic fits a flexible step curve (needs more rows). It changes the probabilities, rarely the answers.">
              <div>
                <Segmented value={opts.calibrate ?? "none"} onChange={(v) => setOpt({ calibrate: v })}
                  options={[{ value: "none", label: "Off" }, { value: "sigmoid", label: "Sigmoid" }, { value: "isotonic", label: "Isotonic" }]} />
              </div>
              <span className="tiny faint">
                {!opts.calibrate || opts.calibrate === "none" ? "Probabilities come straight from each model." : "Classic models are re-fitted with 3-fold calibration so “70%” really means 70%."}
                {opts.calibrate && opts.calibrate !== "none" && !hasClassic ? " (Neural networks skip it.)" : ""}
              </span>
            </Field>
          )}
        </div>
      </Glass>

      <motion.div variants={fadeUp} className="row center" style={{ gap: 12, padding: "8px 0 4px" }}>
        {onCancel && <button className="btn lg ghost" onClick={onCancel}>Back to results</button>}
        <motion.button className="btn gradient lg" disabled={starting || jobBusy || !project.models.length} onClick={go}
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={spring.pop}
          style={{ height: 58, padding: "0 38px", fontSize: 18, borderRadius: 999, position: "relative", overflow: "hidden" }}>
          <motion.span aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%)" }}
            animate={{ x: ["-100%", "100%"] }} transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut", repeatDelay: 1.2 }} />
          <span className="row" style={{ gap: 10 }}>{starting ? <Spinner size={18} /> : "🚀"} Start training</span>
        </motion.button>
        {jobBusy && <span className="small muted row" style={{ gap: 6 }}><InfoTip text="Only one job runs at a time." />Another job is running…</span>}
      </motion.div>
    </motion.div>
  );
}
