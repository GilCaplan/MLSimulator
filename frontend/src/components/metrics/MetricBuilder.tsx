import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../design/motion";
import { toast, useProject } from "../../lib/store";
import type { CustomMetric, RunResult } from "../../lib/types";
import { Field, InfoTip, Modal, Segmented } from "../glass";
import { useSize } from "../charts";
import { primaryMetric, rankMetrics } from "../train/util";
import { templatesFor, type SupervisedTask, type Template } from "./catalog";
import { AsymmetricCost, CostGrid, defaultMatrix } from "./CostEditor";
import { compile, isCustomKey, newMetricId, suggestDirection, suggestName } from "./custom";
import { FormulaEditor } from "./FormulaEditor";
import { LivePreview } from "./LivePreview";
import { saveMetric, useIsBuilderHost, useMetricBuilder } from "./store";

/** Mount once per page that offers custom metrics; renders the builder modal when it's opened from anywhere. */
export function MetricBuilderHost() {
  const host = useIsBuilderHost();
  const open = useMetricBuilder((s) => s.open);
  const editing = useMetricBuilder((s) => s.editing);
  const kind = useMetricBuilder((s) => s.kind);
  const close = useMetricBuilder((s) => s.close);
  const task = useProject((s) => s.project?.task);
  const result = useProject((s) => s.result);
  if (!host || (task !== "classification" && task !== "regression")) return null;
  return (
    <Modal open={open} onClose={close} width={980}
      title={<span className="row" style={{ gap: 10 }}><span>{editing ? "✏️" : "✨"}</span>{editing ? `Edit “${editing.name}”` : "Make your own score"}</span>}>
      {open && <BuilderBody key={editing?.id ?? `new-${kind}`} task={task} result={result && result.task === task ? result : null} initial={editing} initialKind={kind} onDone={close} />}
    </Modal>
  );
}

function BuilderBody({ task, result, initial, initialKind, onDone }: { task: SupervisedTask; result: RunResult | null; initial: CustomMetric | null; initialKind: CustomMetric["kind"]; onDone: () => void }) {
  const report = useProject((s) => s.report);
  const rankChoice = useProject((s) => s.project?.rank_metric);
  const classes = result?.classes ?? report?.classes ?? [];
  const first = templatesFor(task)[0];
  const [kind, setKind] = useState<CustomMetric["kind"]>(initial?.kind ?? initialKind);
  const [formula, setFormula] = useState(initial?.formula ?? first?.formula ?? "");
  const [better, setBetter] = useState<"lower" | "higher">(initial?.better ?? first?.better ?? "higher");
  const [betterAuto, setBetterAuto] = useState(!initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [nameAuto, setNameAuto] = useState(!initial);
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [matrix, setMatrix] = useState<number[][]>(() => {
    const m = initial?.costs?.matrix;
    return m && m.length === classes.length ? m : defaultMatrix(Math.max(2, classes.length));
  });
  const [under, setUnder] = useState(initial?.costs?.under ?? 3);
  const [over, setOver] = useState(initial?.costs?.over ?? 1);

  const { node, error } = compile(formula, task);
  const autoBetter = node ? suggestDirection(node, task) : better;
  const effBetter: "lower" | "higher" = kind === "costs" ? "lower" : betterAuto ? autoBetter : better;
  const autoName = kind === "costs" ? (task === "regression" ? `Cost of misses (${under}:${over})` : "Cost of mistakes") : suggestName(node, task);
  const effName = (nameAuto ? autoName : name).trim() || autoName;

  const draft: CustomMetric | null = useMemo(() => {
    if (kind === "formula" && !node) return null;
    return {
      id: initial?.id ?? "draft", name: effName, kind, better: effBetter,
      ...(kind === "formula" ? { formula } : { costs: task === "classification" ? { matrix } : { under, over } }),
      ...(desc.trim() ? { description: desc.trim() } : {}),
      created_at: initial?.created_at ?? Date.now() / 1000,
    };
  }, [kind, node, formula, effName, effBetter, matrix, under, over, desc, initial, task]);
  // keep showing the last good ranking (dimmed) while the formula is mid-edit
  const [lastGood, setLastGood] = useState<CustomMetric | null>(draft);
  useEffect(() => { if (draft) setLastGood(draft); }, [draft]);

  const compareMetric = result ? (rankChoice && !isCustomKey(rankChoice) && rankMetrics(result).includes(rankChoice) ? rankChoice : primaryMetric(task)) : primaryMetric(task);
  const available = useMemo(() => {
    if (!result) return null;
    const s = new Set<string>();
    Object.values(result.models).forEach((m) => { if (!m.baseline) Object.keys(m.metrics.test ?? {}).forEach((k) => s.add(k)); });
    return s;
  }, [result]);

  const applyTemplate = (t: Template) => {
    setFormula(t.formula);
    setBetter(t.better);
    setBetterAuto(false);
    if (nameAuto || !name) { setName(t.name); setNameAuto(false); }
    if (!desc || TEMPLATE_WHYS.has(desc)) setDesc(t.why);
  };

  const save = () => {
    if (!draft) return;
    const cm: CustomMetric = { ...draft, id: initial?.id ?? newMetricId() };
    saveMetric(cm, !initial);
    toast.success(initial ? `Saved “${cm.name}”.` : `Saved “${cm.name}” — models are now ranked by it.`);
    onDone();
  };

  const cantCost = kind === "costs" && task === "classification" && classes.length < 2;
  const [gridRef, { width: gridW }] = useSize<HTMLDivElement>();
  const narrow = gridW > 0 && gridW < 700;

  return (
    <div className="col" style={{ gap: 16 }}>
      {!initial && (
        <p className="small muted" style={{ lineHeight: 1.6, margin: 0 }}>
          Built-in scores treat every mistake alike. Real life rarely does: a missed fraud might cost <b>£500</b> while a false alarm costs <b>£5</b>,
          or you may care about the worst miss more than the average one. Make a score that matches what matters to <i>you</i> — every leaderboard and progress chart will rank by it.
        </p>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        {([
          { k: "formula", icon: "🧮", title: "Combine metrics", text: "Mix built-in scores in a formula — like 2×MAE + MSE, or accuracy minus a speed penalty." },
          { k: "costs", icon: "💸", title: "Cost of mistakes", text: task === "classification" ? "Say what each kind of wrong answer costs you; we work out each model's average cost." : "Say whether guessing too low or too high hurts more; we work out each model's average cost." },
        ] as const).map((o) => (
          <motion.button key={o.k} type="button" whileTap={{ scale: 0.98 }} onClick={() => setKind(o.k)}
            className={`inset row tile ${kind === o.k ? "selected" : ""}`} aria-pressed={kind === o.k}
            style={{ gap: 12, padding: "12px 14px", textAlign: "left", alignItems: "flex-start", borderColor: kind === o.k ? "var(--accent)" : undefined, background: kind === o.k ? "var(--accent-soft)" : undefined }}>
            <span style={{ fontSize: 24 }}>{o.icon}</span>
            <span className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 14 }}>{o.title}</b>
              <span className="small muted" style={{ lineHeight: 1.45 }}>{o.text}</span>
            </span>
          </motion.button>
        ))}
      </div>

      <div ref={gridRef} className="grid" style={{ gridTemplateColumns: narrow ? "minmax(0, 1fr)" : "minmax(0, 1.45fr) minmax(250px, 1fr)", gap: 18, alignItems: "start" }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={kind} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={spring.snappy} className="col" style={{ gap: 16, minWidth: 0 }}>
            {kind === "formula" ? (
              <FormulaEditor task={task} formula={formula} onChange={setFormula} node={node} error={error} available={available} onTemplate={applyTemplate} />
            ) : task === "classification" ? (
              cantCost ? <span className="small muted">Prepare your data first so we know the classes.</span> : <CostGrid classes={classes} matrix={matrix} onChange={setMatrix} />
            ) : (
              <AsymmetricCost under={under} over={over} onUnder={setUnder} onOver={setOver} result={result} />
            )}

            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, alignItems: "start" }}>
              <Field label="Better when it's…" help="Error-like scores (misses, costs) are better when lower; success-like scores (accuracy, R²) when higher. We guess from your formula — override it if we got it wrong.">
                {kind === "costs" ? (
                  <span className="small muted">⬇️ Lower — it's a cost.</span>
                ) : (
                  <div className="col" style={{ gap: 4 }}>
                    <div>
                      <Segmented size="sm" kind="form" value={effBetter} onChange={(v) => { setBetter(v); setBetterAuto(false); }}
                        options={[{ value: "lower", label: "⬇️ Lower" }, { value: "higher", label: "⬆️ Higher" }]} />
                    </div>
                    <span className="tiny faint">
                      {betterAuto ? <>Guessed from the formula{node ? (autoBetter === "lower" ? " — it's mostly errors" : " — it's mostly scores") : ""}.</>
                        : <>Set by you. {node && autoBetter !== effBetter && <button type="button" className="btn sm ghost" style={{ height: 20, padding: "0 6px", fontSize: 11 }} onClick={() => setBetterAuto(true)}>↺ Use our guess ({autoBetter})</button>}</>}
                    </span>
                  </div>
                )}
              </Field>
              <Field label="Name" help="Shown in the Rank by menu and on the leaderboard.">
                <input className="input" value={nameAuto ? autoName : name} maxLength={48} placeholder={autoName}
                  onChange={(e) => { setName(e.target.value); setNameAuto(false); }} style={{ width: "100%" }} aria-label="Metric name" />
              </Field>
            </div>
            <Field label="Why this score? (optional)" help="A note for future you — shown in the leaderboard's info tip.">
              <input className="input" value={desc} maxLength={140} placeholder={kind === "costs" ? "e.g. a missed fraud costs £500, a false alarm £5" : "e.g. big misses are expensive for us"}
                onChange={(e) => setDesc(e.target.value)} style={{ width: "100%" }} aria-label="Why this score" />
            </Field>
          </motion.div>
        </AnimatePresence>

        <div className="col" style={{ gap: 10, position: narrow ? "static" : "sticky", top: 0 }}>
          <LivePreview draft={draft ?? lastGood} result={result} compareMetric={compareMetric} stale={!draft} />
        </div>
      </div>

      <div className="row between wrap" style={{ gap: 10, marginTop: 4 }}>
        <span className="tiny faint row" style={{ gap: 6 }}>
          <InfoTip text="Your score is worked out in the browser from each model's test results — nothing is retrained. Automatic tuning still optimises a built-in metric (we pick the closest one for you)." />
          Scores come from each model's test results — nothing is retrained.
        </span>
        <span className="row" style={{ gap: 10 }}>
          <button type="button" className="btn" onClick={onDone}>Cancel</button>
          <motion.button type="button" className="btn gradient" disabled={!draft || cantCost} onClick={save} whileTap={{ scale: 0.97 }}>
            {initial ? "Save changes" : "💾 Save & rank by it"}
          </motion.button>
        </span>
      </div>
    </div>
  );
}

const TEMPLATE_WHYS = new Set(["", ...templatesFor("classification").map((t) => t.why), ...templatesFor("regression").map((t) => t.why)]);
