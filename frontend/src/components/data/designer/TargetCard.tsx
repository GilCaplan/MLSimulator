import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { spring } from "../../../design/motion";
import { classColor } from "../../../lib/colors";
import type { Task } from "../../../lib/types";
import { Field, InfoTip, NumberField, Segmented, Slider, Toggle } from "../../glass";
import { isIdentifier, panelSwap } from "../shared";
import { ShareBar } from "../ui";
import { classLabels, normProbs, resizeClasses, suggestFormula, type DesignFeature, type DesignTarget, type RuleKind } from "./model";

const RULE_BLURB: Record<RuleKind, string> = {
  linear: "Each feature nudges the answer up or down by the amount you set — like a recipe.",
  expression: "Write your own maths using the feature names. Anything goes.",
  clusters: "Each class gets its own neighbourhood: rows of the same class sit close together.",
  random: "The answer is pure chance — there is nothing to learn. A good sanity check: models should fail!",
};

export function TargetCard({ target, features, task, functions, error, onChange }: {
  target: DesignTarget;
  features: DesignFeature[];
  task: Task;
  functions: Record<string, string>;
  error?: string | null;
  onChange: (t: DesignTarget) => void;
}) {
  const set = (patch: Partial<DesignTarget>) => onChange({ ...target, ...patch });
  const setRule = (rule: RuleKind) => {
    const patch: Partial<DesignTarget> = { rule };
    if (rule === "expression" && !target.expr.trim()) patch.expr = suggestFormula(features);
    set(patch);
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
        <div className="col" style={{ gap: 6, flex: "1 1 180px" }}>
          <span className="row" style={{ gap: 6, fontWeight: 560, fontSize: 13 }}>Target column name <InfoTip text="The column your models will learn to predict." /></span>
          <input className="input" value={target.name} onChange={(e) => set({ name: e.target.value })} style={{ fontWeight: 600 }} />
        </div>
        <span className={`badge ${task === "classification" ? "accent" : "success"}`} style={{ height: 28 }}>
          {task === "classification" ? "🏷️ Classification" : "📏 Regression"}
        </span>
      </div>

      <Field label="How is the answer decided?" help="This is the hidden rule your models will try to discover from the data.">
        <Segmented<RuleKind>
          value={target.rule}
          full
          size="sm"
          onChange={setRule}
          options={[
            { value: "linear", label: "⚖️ Weights" },
            { value: "expression", label: "🧮 Formula" },
            { value: "clusters", label: "🫧 Clusters", disabled: task !== "classification" },
            { value: "random", label: "🎲 Random" },
          ]}
        />
      </Field>
      <p className="small muted" style={{ marginTop: -6 }}>{RULE_BLURB[target.rule]}</p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={target.rule} {...panelSwap}>
          {target.rule === "linear" && <WeightsPanel target={target} features={features} set={set} />}
          {target.rule === "expression" && <FormulaPanel target={target} features={features} functions={functions} error={error} set={set} />}
          {target.rule === "clusters" && <ClustersPanel target={target} features={features} set={set} />}
          {target.rule === "random" && (
            <div className="inset row" style={{ padding: 14, gap: 12 }}>
              <motion.span animate={{ rotate: [0, 20, -20, 0] }} transition={{ repeat: Infinity, duration: 2.4, repeatDelay: 1 }} style={{ fontSize: 26 }}>🎲</motion.span>
              <span className="small muted">No signal at all. If a model scores well here, something is leaking — a great way to build trust in your setup.</span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="divider" style={{ margin: "2px 0" }} />
      {task === "classification" ? <ClassesPanel target={target} onChange={onChange} /> : <RegressionScale target={target} set={set} />}
    </div>
  );
}

/* ---------------------------------------------------------------- rule panels */

function WeightsPanel({ target, features, set }: { target: DesignTarget; features: DesignFeature[]; set: (p: Partial<DesignTarget>) => void }) {
  return (
    <div className="col" style={{ gap: 12 }}>
      {features.map((f) => {
        const w = target.weights[f._id] ?? 0;
        const effect = Math.abs(w) < 0.05 ? "no effect" : `${Math.abs(w) > 1.5 ? "strongly " : ""}pushes ${w > 0 ? "up ↑" : "down ↓"}`;
        return (
          <motion.div key={f._id} layout transition={spring.snappy} className="col" style={{ gap: 2 }}>
            <div className="row between small">
              <b className="truncate">{f.name || "unnamed"}</b>
              <span className="tiny" style={{ color: Math.abs(w) < 0.05 ? "var(--text-3)" : w > 0 ? "var(--accent)" : "#FF375F", fontWeight: 600 }}>{effect}</span>
            </div>
            <Slider value={w} min={-3} max={3} step={0.1} format={(v) => (v > 0 ? "+" : "") + v.toFixed(1)}
              onChange={(v) => set({ weights: { ...target.weights, [f._id]: v } })} />
          </motion.div>
        );
      })}
      {features.some((f) => f.dist === "categorical") && (
        <p className="tiny faint">Categories count in alphabetical order (first = lowest).</p>
      )}
      <div className="inset col" style={{ padding: 12, gap: 12 }}>
        <Slider label={<span className="small">Noise</span>} help="Random wobble added to the answer. More noise = harder to predict, like real life."
          value={target.noise} min={0} max={3} step={0.05} onChange={(v) => set({ noise: v })} />
        <Toggle label={<span className="small">Make it non-linear</span>} help="Bends the relationship with curves so straight-line models struggle and trees / neural nets shine."
          checked={target.nonlinear} onChange={(v) => set({ nonlinear: v })} />
      </div>
    </div>
  );
}

function FormulaPanel({ target, features, functions, error, set }: {
  target: DesignTarget; features: DesignFeature[]; functions: Record<string, string>; error?: string | null; set: (p: Partial<DesignTarget>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (text: string, caretBack = 0) => {
    const el = ref.current;
    const v = target.expr;
    const s = el?.selectionStart ?? v.length, e = el?.selectionEnd ?? v.length;
    const next = v.slice(0, s) + text + v.slice(e);
    set({ expr: next });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = s + text.length - caretBack;
      el.setSelectionRange(pos, pos);
    });
  };
  const badNames = features.filter((f) => !isIdentifier(f.name.trim()));
  return (
    <div className="col" style={{ gap: 10 }}>
      <textarea ref={ref} className="input mono" rows={2} value={target.expr} spellCheck={false} onChange={(e) => set({ expr: e.target.value })}
        placeholder='e.g. age / 10 + log(income) + 2 * (plan == "pro") + noise(0.5)'
        style={{ fontSize: 13, borderColor: error ? "var(--danger)" : undefined }} />
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="small" style={{ color: "var(--danger)" }}>
            ⚠️ {error}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="col" style={{ gap: 6 }}>
        <span className="eyebrow">Features</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {features.map((f) => (
            <button key={f._id} className="btn sm" onClick={() => insert(f.name.trim())} disabled={!isIdentifier(f.name.trim())}>{f.name || "unnamed"}</button>
          ))}
        </div>
        {badNames.length > 0 && <span className="tiny faint">Names with spaces or symbols can't be used in formulas — rename them with letters, digits and _.</span>}
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="eyebrow">Functions</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {Object.entries(functions).map(([sig, help]) => {
            const name = sig.split("(")[0];
            return (
              <button key={sig} className="btn sm ghost mono" title={help} onClick={() => insert(`${name}()`, 1)} style={{ fontSize: 11.5, background: "var(--fill)" }}>{sig}</button>
            );
          })}
        </div>
        <span className="tiny faint">Also: + − × ÷ (*, /), powers (**), comparisons like <span className="mono">plan == "pro"</span> (1 if true, 0 if not), and constants pi, e.</span>
      </div>
    </div>
  );
}

function ClustersPanel({ target, features, set }: { target: DesignTarget; features: DesignFeature[]; set: (p: Partial<DesignTarget>) => void }) {
  const numeric = features.filter((f) => f.dist !== "categorical");
  const toggle = (id: string) => set({ on: target.on.includes(id) ? target.on.filter((x) => x !== id) : [...target.on, id] });
  return (
    <div className="col" style={{ gap: 12 }}>
      <Slider label={<span className="small">Separation</span>} help="How far apart the class neighbourhoods are. 0 = completely mixed (impossible), 5+ = trivially easy."
        value={target.separation} min={0} max={6} step={0.1} onChange={(v) => set({ separation: v })} />
      <Field label={<span className="small">Features that form the clusters</span>} help="Only these numeric features are shifted per class; the others carry no signal.">
        <div className="row wrap" style={{ gap: 6 }}>
          {numeric.map((f) => {
            const on = target.on.includes(f._id);
            return (
              <motion.button key={f._id} whileTap={{ scale: 0.94 }} className={`btn sm ${on ? "primary" : ""}`} onClick={() => toggle(f._id)}>
                {on ? "✓ " : ""}{f.name || "unnamed"}
              </motion.button>
            );
          })}
          {numeric.length === 0 && <span className="small faint">Add a numeric feature first.</span>}
        </div>
      </Field>
    </div>
  );
}

/* ---------------------------------------------------------------- classes / regression output */

function ClassesPanel({ target, onChange }: { target: DesignTarget; onChange: (t: DesignTarget) => void }) {
  const labels = classLabels(target);
  const colors = labels.map((l) => classColor(l, labels));
  const shares = normProbs(target.class_probs);
  const set = (patch: Partial<DesignTarget>) => onChange({ ...target, ...patch });
  return (
    <div className="col" style={{ gap: 14 }}>
      <Field label="Number of classes" help="How many different answers are possible (2 = yes/no).">
        <Segmented<string> value={String(target.n_classes)} size="sm" onChange={(v) => onChange(resizeClasses(target, Number(v)))}
          options={[2, 3, 4, 5, 6].map((k) => ({ value: String(k), label: String(k) }))} />
      </Field>
      <Field label="Class balance" help={
        target.rule === "linear" || target.rule === "expression"
          ? "We score every row with your rule, sort them, and cut the list at these percentages. So the mix is exactly what you set — drag one class down to create an imbalanced problem."
          : "Each row is assigned a class at random with these chances, so the mix will be close to what you set."
      }>
        <ShareBar labels={labels} shares={shares} colors={colors} />
      </Field>
      <div className="col" style={{ gap: 8 }}>
        {labels.map((l, i) => (
          <motion.div key={i} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={spring.snappy} className="row" style={{ gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: colors[i], flexShrink: 0 }} />
            <input className="input" value={target.class_names[i] ?? ""} placeholder={String(i)} aria-label={`Name of class ${i}`}
              onChange={(e) => set({ class_names: target.class_names.map((n, j) => (j === i ? e.target.value : n)) })}
              style={{ width: 100, height: 28, fontSize: 12.5, padding: "0 8px" }} />
            <input type="range" className="slider" min={0} max={1000} value={Math.round(Math.min(1, target.class_probs[i] ?? 0) * 1000)}
              style={{ ["--pct" as any]: `${Math.min(1, target.class_probs[i] ?? 0) * 100}%`, flex: 1 }}
              onChange={(e) => set({ class_probs: target.class_probs.map((p, j) => (j === i ? Math.max(0.01, Number(e.target.value) / 1000) : p)) })} />
            <span className="num small" style={{ width: 40, textAlign: "right", fontWeight: 600 }}>{Math.round(shares[i] * 100)}%</span>
          </motion.div>
        ))}
        <span className="tiny faint">Class names are optional — leave them blank to use 0, 1, 2…</span>
      </div>
    </div>
  );
}

function RegressionScale({ target, set }: { target: DesignTarget; set: (p: Partial<DesignTarget>) => void }) {
  return (
    <Field label="Units" help="The rule produces a score centred near 0 with a spread of about 1–2. Multiply and shift it to get realistic numbers — e.g. ×50,000 + 300,000 for house prices.">
      <div className="row wrap" style={{ gap: 10 }}>
        <span className="small muted">answer =</span>
        <span className="small muted">score ×</span>
        <NumberField value={target.scale} step={1} onChange={(v) => set({ scale: v })} width={100} />
        <span className="small muted">+</span>
        <NumberField value={target.offset} step={1} onChange={(v) => set({ offset: v })} width={110} />
      </div>
    </Field>
  );
}
