import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { ColumnSummary, FeatureStep } from "../../../lib/types";
import { Select, Slider, Toggle } from "../../glass";
import { DEFAULT_PARTS, OP_META, defaultName, incomplete, outputNames, supportsDrop } from "./featureOps";
import { BucketPreview, Chip, ColumnPreview, FormulaEditor, PartsPicker } from "./StepParts";

export interface StepEditorProps {
  step: FeatureStep;
  index: number;
  total: number;
  /** numeric inputs available to this step (dataset columns + earlier engineered numbers) */
  numeric: string[];
  /** date-like columns */
  dates: string[];
  /** names usable in a formula */
  formulaCols: string[];
  target: string;
  /** dataset column lookup (for source histograms / roles) */
  colInfo: (name: string) => ColumnSummary | undefined;
  preview: Record<string, ColumnSummary>;
  loading: boolean;
  error?: string;
  warning?: string;
  onChange: (s: FeatureStep) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

const POWERS = [{ p: 0.5, label: "√x" }, { p: 2, label: "x²" }, { p: 3, label: "x³" }, { p: -1, label: "1/x" }];

/** One editable engineered-feature step: inputs on the left, live preview of the new column(s) on the right. */
export function StepEditor(props: StepEditorProps) {
  const { step, index, total, error, warning, preview, loading, onChange, onRemove, onMove } = props;
  const meta = OP_META[step.op];
  const set = (patch: Partial<FeatureStep>) => onChange({ ...step, ...patch });
  const todo = incomplete(step);
  const names = outputNames(step);
  const src = step.column ? props.colInfo(step.column) : undefined;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.2 } }}
      transition={spring.gentle}
      className="inset"
      style={{ padding: 0, overflow: "hidden", borderColor: error ? "var(--danger)" : undefined }}
    >
      {/* header */}
      <div className="row wrap" style={{ gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--hairline)", background: "var(--fill)" }}>
        <span style={{ width: 30, height: 30, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", fontSize: 15, flexShrink: 0 }}>{meta.icon}</span>
        <span className="col" style={{ gap: 0, minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>{meta.label}</b>
          <span className="tiny faint mono">{meta.sign}</span>
        </span>
        <div className="row grow" style={{ gap: 6, justifyContent: "flex-end", minWidth: 0 }}>
          {step.op !== "date_parts" && (
            <label className="row" style={{ gap: 6, minWidth: 0 }}>
              <span className="tiny faint">name</span>
              <input
                className="input mono"
                value={step.name ?? ""}
                placeholder={step.op === "formula" ? "my_feature" : defaultName(step)}
                onChange={(e) => set({ name: e.target.value.replace(/\s+/g, "_") || undefined })}
                style={{ height: 28, fontSize: 12, width: 170, maxWidth: "100%" }}
                spellCheck={false}
              />
            </label>
          )}
          <IconBtn title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</IconBtn>
          <IconBtn title="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>↓</IconBtn>
          <IconBtn title="Remove" danger onClick={onRemove}>✕</IconBtn>
        </div>
      </div>

      {/* body */}
      <div className="row wrap" style={{ gap: 16, padding: 14, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 12, flex: "1 1 300px", minWidth: 0 }}>
          <OpInputs {...props} set={set} src={src} />
          {supportsDrop(step.op) && (step.op !== "date_parts" || (src && src.role !== "datetime")) && (
            <Toggle
              label={<span className="small">Drop the original “{step.column || "column"}”</span>}
              help="Keep only the new feature. Useful when the new one says the same thing better (e.g. log income instead of income)."
              checked={step.op === "date_parts" ? step.drop_source !== false : !!step.drop_source}
              onChange={(v) => set({ drop_source: v })}
            />
          )}
          {step.op === "date_parts" && src?.role === "datetime" && (
            <span className="tiny faint">The raw date itself is ignored by the models — only the parts are used.</span>
          )}
        </div>

        <div className="col" style={{ gap: 8, flex: "1 1 240px", minWidth: 0 }}>
          <span className="eyebrow">{names.length > 1 ? `${names.length} new columns` : "New column"} · preview</span>
          <AnimatePresence mode="wait" initial={false}>
            {error ? (
              <motion.div key="err" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -4, 4, -2, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
                className="row small" style={{ gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: 12, background: "rgba(255,69,58,.12)", color: "var(--danger)", lineHeight: 1.45 }}>
                <span>⛔</span><span>{error}</span>
              </motion.div>
            ) : todo ? (
              <motion.div key="todo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="small muted" style={{ padding: "9px 12px", borderRadius: 12, border: "1px dashed var(--hairline)" }}>
                ✍️ {todo}
              </motion.div>
            ) : (
              <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col" style={{ gap: 6 }}>
                {names.map((n, i) => <ColumnPreview key={n} name={n} col={preview[n]} index={index * 3 + i} loading={loading} />)}
              </motion.div>
            )}
          </AnimatePresence>
          {warning && <span className="tiny" style={{ color: "var(--warning)", lineHeight: 1.45 }}>⚠️ {warning}</span>}
        </div>
      </div>
    </motion.div>
  );
}

function OpInputs({ step, numeric, dates, formulaCols, target, set, src }: StepEditorProps & { set: (p: Partial<FeatureStep>) => void; src?: ColumnSummary }) {
  const opts = (list: string[], cur?: string) => [
    ...(cur && list.includes(cur) ? [] : [{ value: cur || "", label: cur ? `${cur} (unavailable)` : "Choose…" }]),
    ...list.map((c) => ({ value: c, label: c })),
  ];
  switch (step.op) {
    case "date_parts":
      return (
        <>
          <Row label="Date column">
            <Select value={step.column || ""} options={opts(dates, step.column)} onChange={(v) => set({ column: v })} style={{ minWidth: 180 }} />
          </Row>
          <div className="col" style={{ gap: 6 }}>
            <span className="tiny faint">Parts to create</span>
            <PartsPicker value={step.parts ?? DEFAULT_PARTS} onChange={(parts) => set({ parts })} />
          </div>
        </>
      );
    case "ratio": case "product": case "difference": {
      const sign = step.op === "ratio" ? "÷" : step.op === "product" ? "×" : "−";
      return (
        <div className="row wrap" style={{ gap: 8 }}>
          <Select value={step.a || ""} options={opts(numeric, step.a)} onChange={(v) => set({ a: v })} style={{ minWidth: 140 }} />
          <motion.span key={sign} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop} style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", width: 18, textAlign: "center" }}>{sign}</motion.span>
          <Select value={step.b || ""} options={opts(numeric, step.b)} onChange={(v) => set({ b: v })} style={{ minWidth: 140 }} />
          {step.op !== "product" && (
            <motion.button className="btn sm ghost" whileTap={{ rotate: 180 }} transition={spring.snappy} title="Swap A and B" onClick={() => set({ a: step.b, b: step.a })}>⇄</motion.button>
          )}
          {step.op === "ratio" && <span className="tiny faint" style={{ width: "100%" }}>Rows where B is 0 become blank (you can't divide by zero).</span>}
        </div>
      );
    }
    case "log":
      return (
        <>
          <Row label="Column"><Select value={step.column || ""} options={opts(numeric, step.column)} onChange={(v) => set({ column: v })} style={{ minWidth: 180 }} /></Row>
          {src?.stats && (
            <span className="tiny muted">Skew of “{src.name}”: <b className="num" style={{ color: src.stats.skew > 1 ? "var(--warning)" : "var(--text)" }}>{src.stats.skew.toFixed(2)}</b>
              {src.stats.skew > 1 ? " — a long tail, log will help." : " — fairly balanced already."}{src.stats.min < 0 ? " Negative values are treated as 0." : ""}</span>
          )}
        </>
      );
    case "power":
      return (
        <>
          <Row label="Column"><Select value={step.column || ""} options={opts(numeric, step.column)} onChange={(v) => set({ column: v })} style={{ minWidth: 180 }} /></Row>
          <div className="row wrap" style={{ gap: 6 }}>
            {POWERS.map((o) => <Chip key={o.p} on={(step.p ?? 2) === o.p} onClick={() => set({ p: o.p })} mono>{o.label}</Chip>)}
          </div>
          <Slider label="Power p" value={step.p ?? 2} min={-2} max={4} step={0.25} format={(v) => v.toFixed(2).replace(/\.?0+$/, "")} onChange={(v) => set({ p: v })}
            help="x^p. p = 2 squares, p = 0.5 is the square root, p = −1 flips into 1/x." />
          {(step.p === 0 || step.p === 1) && <span className="tiny" style={{ color: "var(--warning)" }}>{step.p === 0 ? "x⁰ is always 1 — useless as a feature." : "x¹ is just x again."}</span>}
        </>
      );
    case "bin":
      return (
        <>
          <Row label="Column"><Select value={step.column || ""} options={opts(numeric, step.column)} onChange={(v) => set({ column: v })} style={{ minWidth: 180 }} /></Row>
          <Slider label="Number of buckets" value={step.bins ?? 4} min={2} max={10} integer onChange={(v) => set({ bins: v })}
            help="Edges are learned from the training rows only (quantiles), so each bucket holds roughly the same number of rows. The result is a category." />
          <BucketPreview hist={src?.histogram} bins={step.bins ?? 4} />
        </>
      );
    case "formula":
      return <FormulaEditor value={step.expr ?? ""} onChange={(expr) => set({ expr })} columns={formulaCols} target={target} />;
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row wrap" style={{ gap: 10 }}>
      <span className="small muted" style={{ minWidth: 86 }}>{label}</span>
      {children}
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, danger }: { children: ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean }) {
  return (
    <motion.button whileTap={disabled ? undefined : { scale: 0.88 }} className="btn sm ghost icon" disabled={disabled} onClick={onClick} title={title}
      style={{ width: 28, height: 28, padding: 0, color: danger ? "var(--danger)" : undefined, opacity: disabled ? 0.35 : 1 }}>
      {children}
    </motion.button>
  );
}
