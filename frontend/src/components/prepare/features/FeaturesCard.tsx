import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef } from "react";
import { spring, stagger } from "../../../design/motion";
import type { FeatureOp, FeatureStep } from "../../../lib/types";
import type { CardProps } from "../CleanCard";
import { STAGE_ICONS, stageState } from "../FlowStrip";
import { Note, StageCard, SubHead } from "../StageCard";
import { patchPipeline } from "../state";
import { FeatureIdeas } from "./FeatureIdeas";
import { DEFAULT_PARTS, OPS, outputNames, newStep } from "./featureOps";
import { StepEditor } from "./StepEditor";
import { useFeaturePreview } from "./usePreview";

/** "Create features" stage: a gallery of operations, editable steps with live previews, and smart suggestions. */
export function FeaturesCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec, columns, dataset, report, project } = ctx;
  const steps = spec.features ?? [];
  const write = (next: FeatureStep[]) => patchPipeline("features", next);
  const preview = useFeaturePreview(open ? project.dataset_id ?? null : null, steps);

  const dsNumeric = columns.filter((c) => c.role === "numeric").map((c) => c.name);
  const dsDates = columns.filter((c) => c.role === "datetime").map((c) => c.name);
  const dateChoices = dsDates.length ? dsDates : columns.filter((c) => c.role !== "numeric").map((c) => c.name);
  const colInfo = (n: string) => columns.find((c) => c.name === n);

  // inputs available to step i: dataset columns + outputs of earlier non-bucket steps
  const earlier = (i: number) => steps.slice(0, i).filter((s) => s.op !== "bin").flatMap(outputNames);
  const allCols = columns.map((c) => c.name);

  const warnings = useMemo(() => {
    const seen = new Map<string, number>();
    const out: Record<number, string> = {};
    steps.forEach((s, i) => {
      for (const n of outputNames(s)) {
        if (!n) continue;
        if (n && n === (spec.target ?? spec.truth)) out[i] = `“${n}” is the name of your target — pick another name.`;
        else if (seen.has(n)) out[i] = `Step ${seen.get(n)! + 1} already creates “${n}” — this one will overwrite it.`;
        else if (allCols.includes(n)) out[i] = `“${n}” already exists in your data — it will be replaced by this feature.`;
        seen.set(n, i);
      }
    });
    return out;
  }, [steps, allCols.join("|"), spec.target]); // eslint-disable-line react-hooks/exhaustive-deps

  // stable React keys for the steps (the spec itself has no ids), kept in sync with our own edits
  const ids = useRef<number[]>([]);
  const nextId = useRef(1);
  while (ids.current.length < steps.length) ids.current.push(nextId.current++);
  if (ids.current.length > steps.length) ids.current = ids.current.slice(0, steps.length);

  const append = (s: FeatureStep) => write([...steps, s]);
  const add = (op: FeatureOp) => append(newStep(op, dsNumeric, dateChoices));
  const change = (i: number) => (s: FeatureStep) => write(steps.map((x, j) => (j === i ? s : x)));
  const remove = (i: number) => () => {
    ids.current = ids.current.filter((_, j) => j !== i);
    write(steps.filter((_, j) => j !== i));
  };
  const move = (i: number) => (dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    const k = [...ids.current];
    [k[i], k[j]] = [k[j], k[i]];
    ids.current = k;
    write(next);
  };

  // one-click suggestions: date columns → parts, long-tailed numbers → log
  const suggestions: { key: string; label: string; step: FeatureStep }[] = [];
  for (const d of dsDates) {
    if (!steps.some((s) => s.op === "date_parts" && s.column === d)) {
      suggestions.push({ key: `d-${d}`, label: `Split “${d}” into date parts`, step: { op: "date_parts", column: d, parts: [...DEFAULT_PARTS], drop_source: true } });
    }
  }
  for (const c of columns) {
    if (c.role === "numeric" && c.stats && c.stats.skew > 2 && c.stats.min >= 0 && !c.is_integer && !steps.some((s) => s.op === "log" && s.column === c.name)) {
      suggestions.push({ key: `l-${c.name}`, label: `Log of “${c.name}” (long tail)`, step: { op: "log", column: c.name, drop_source: true } });
    }
  }
  const shownSuggestions = suggestions.slice(0, 4);

  const created = report?.features_created ?? [];

  return (
    <StageCard
      id="features" icon={STAGE_ICONS.features} title="Create features" open={open} onToggle={onToggle} flash={flash}
      summary={stageState("features", spec, false)}
      why="Good features beat fancy models. Combine or reshape columns so the pattern becomes easy to see."
      info="Models only see the columns you give them. A well-chosen ratio, date part or bucket can turn a pattern that's hard to learn into one that's obvious. New features are computed for every row before the split, and recomputed automatically when you make predictions later."
    >
      <div className="row wrap" style={{ gap: 16, alignItems: "stretch" }}>
        <div className="col" style={{ gap: 8, flex: "1 1 260px", justifyContent: "center" }}>
          <h3 style={{ fontSize: 17, letterSpacing: -0.2 }}><span className="gradient-text">Good features beat fancy models</span></h3>
          <p className="small muted" style={{ lineHeight: 1.55 }}>
            A model only sees the columns you hand it. It can't divide price by size, or know that 17:45 on a Friday is rush hour — unless you
            make that a column. Add a few <b style={{ color: "var(--text)" }}>engineered features</b> and even a simple model can shine.
          </p>
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}><FeatureIdeas /></div>
      </div>

      <AnimatePresence initial={false}>
        {shownSuggestions.length > 0 && (
          <motion.div key="sugg" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="col" style={{ gap: 8 }}>
              <SubHead info="Ideas based on your columns. One click adds the step — you can tweak or remove it below.">Suggested for your data</SubHead>
              <div className="row wrap" style={{ gap: 8 }}>
                <AnimatePresence>
                  {shownSuggestions.map((s) => (
                    <motion.button
                      key={s.key} layout
                      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                      whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} transition={spring.snappy}
                      className="btn sm"
                      onClick={() => append(s.step)}
                      style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--text)" }}
                    >
                      ✨ {s.label}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* gallery */}
      <div className="col" style={{ gap: 8 }}>
        <SubHead>Add a feature</SubHead>
        {!dataset ? (
          <div className="skeleton" style={{ height: 96 }} />
        ) : (
          <motion.div variants={stagger(0.03)} initial="hidden" animate="show" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: 8 }}>
            {OPS.map((o) => {
              const disabled = o.needs === "date" ? dateChoices.length === 0 : o.needs === "two" ? dsNumeric.length < 1 : o.needs === "one" ? dsNumeric.length === 0 : false;
              return (
                <motion.button
                  key={o.op}
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  whileHover={disabled ? undefined : { y: -3 }}
                  whileTap={disabled ? undefined : { scale: 0.96 }}
                  transition={spring.snappy}
                  disabled={disabled}
                  onClick={() => add(o.op)}
                  className="inset"
                  title={disabled ? (o.needs === "date" ? "No date columns in this dataset" : "Needs numeric columns") : o.blurb}
                  style={{ textAlign: "left", padding: "10px 12px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, color: "inherit", display: "flex", flexDirection: "column", gap: 4, background: "var(--fill)" }}
                >
                  <span className="row" style={{ gap: 7 }}>
                    <span style={{ fontSize: 16 }}>{o.icon}</span>
                    <b style={{ fontSize: 13 }}>{o.label}</b>
                    <span className="mono faint" style={{ marginLeft: "auto", fontSize: 11 }}>{o.sign}</span>
                  </span>
                  <span className="tiny mono" style={{ color: "var(--text-2)", lineHeight: 1.4 }}>
                    {o.example[0]} <span style={{ color: "var(--accent)" }}>→</span> {o.example[1]}
                  </span>
                  <span className="tiny muted" style={{ lineHeight: 1.4 }}>{o.blurb}</span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* steps */}
      <div className="col" style={{ gap: 10 }}>
        {steps.length > 0 && (
          <SubHead
            info="Steps run top to bottom, so a later step can use a column an earlier step created. Buckets are always computed last."
            right={<span className="row tiny muted" style={{ gap: 6 }}>{preview.loading && <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.1 }}>● previewing…</motion.span>}{steps.length} step{steps.length > 1 ? "s" : ""}</span>}
          >
            Your new features
          </SubHead>
        )}
        <AnimatePresence initial={false}>
          {steps.map((s, i) => (
            <StepEditor
              key={ids.current[i]}
              step={s}
              index={i}
              total={steps.length}
              numeric={[...dsNumeric, ...earlier(s.op === "bin" ? steps.length : i).filter((n) => !dsNumeric.includes(n))]}
              dates={dateChoices}
              formulaCols={[...allCols.filter((c) => c !== spec.target), ...earlier(i)]}
              target={spec.target ?? spec.truth ?? ""}
              colInfo={colInfo}
              preview={preview.cols}
              loading={preview.loading}
              error={preview.errors[i]}
              warning={warnings[i]}
              onChange={change(i)}
              onRemove={remove(i)}
              onMove={move(i)}
            />
          ))}
        </AnimatePresence>
        {steps.length === 0 && dataset && (
          <div className="small muted" style={{ padding: "12px 14px", borderRadius: 12, border: "1px dashed var(--hairline)", textAlign: "center" }}>
            No new features yet — pick an operation above{shownSuggestions.length ? " or try a suggestion" : ""}. Totally optional: your columns are used as they are.
          </div>
        )}
        {preview.failed && <Note icon="📡" tone="warn">Couldn't reach the server for a preview — your steps are still saved.</Note>}
      </div>

      <AnimatePresence>
        {created.length > 0 && (
          <motion.div key="created" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="col" style={{ gap: 6 }}>
            <SubHead info="Columns the last preparation run actually created. They're re-created automatically whenever the model makes predictions.">Created in the last run</SubHead>
            <motion.div variants={stagger(0.03)} initial="hidden" animate="show" className="row wrap" style={{ gap: 5 }}>
              {created.map((n, i) => (
                <motion.span key={`${n}-${i}`} variants={{ hidden: { opacity: 0, scale: 0.7 }, show: { opacity: 1, scale: 1 } }} className="badge success mono" style={{ fontSize: 11 }}>✨ {n}</motion.span>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </StageCard>
  );
}
