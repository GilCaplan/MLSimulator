import { AnimatePresence, motion } from "framer-motion";
import type { PipelineSpec } from "../../lib/types";
import { Histogram } from "../charts";
import { NumberField, Segmented, Slider, Toggle } from "../glass";
import { fmt } from "../../lib/format";
import type { CardProps } from "./CleanCard";
import { STAGE_ICONS, stageState } from "./FlowStrip";
import { ChoiceGrid, Note, StageCard } from "./StageCard";
import { estimateFeatures, patchPipeline } from "./state";

type FsMethod = PipelineSpec["feature_select"]["method"];

export function SelectCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec } = ctx;
  const fs = spec.feature_select;
  const maxK = estimateFeatures(ctx);
  const usesK = !ctx.unsup && (fs.method === "kbest" || fs.method === "mutual_info" || fs.method === "model");
  return (
    <StageCard
      id="select" icon={STAGE_ICONS.select} title="Feature selection" open={open} onToggle={onToggle} flash={flash}
      summary={ctx.unsup && fs.method !== "variance" ? "all" : stageState("select", spec, false)}
      why="Keep only the most useful columns. Fewer, better features can mean faster training and less overfitting."
      info="Selection is decided using training rows only. With few features you usually don't need it; it shines when there are many columns relative to rows."
    >
      <ChoiceGrid<FsMethod>
        value={ctx.unsup && fs.method !== "variance" ? "none" : fs.method}
        min={150}
        compact
        onChange={(v) => patchPipeline("feature_select", { method: v, k: Math.min(fs.k, maxK) })}
        options={[
          { value: "none", icon: "📚", label: "Keep all", blurb: "Use every feature." },
          { value: "kbest", icon: "📐", label: "Best-k (stats)", blurb: "A quick statistical test ranks each feature on its own." },
          { value: "mutual_info", icon: "🔗", label: "Mutual information", blurb: "Also catches curvy, non-linear relationships." },
          { value: "variance", icon: "〰️", label: "Variance", blurb: "Drop features that barely change at all." },
          { value: "model", icon: "🌲", label: "Model-based", blurb: "A random forest votes on what matters." },
        ].filter((o) => !ctx.unsup || o.value === "none" || o.value === "variance") as { value: FsMethod; icon: string; label: string; blurb: string }[]}
      />
      {ctx.unsup && (
        <Note icon="🙈">The other methods rank columns by how well they predict the answer — and here there is no answer column. To trim noise, drop columns in <b>Clean</b> or merge them with <b>Reduce (PCA)</b>.</Note>
      )}
      <AnimatePresence initial={false} mode="wait">
        {usesK && (
          <motion.div key="k" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <Slider label={`Keep the best ${Math.min(fs.k, maxK)} of ~${maxK} features`} help="Counts encoded features (each one-hot column counts separately)." value={Math.min(fs.k, maxK)} min={1} max={Math.max(2, maxK)} integer onChange={(v) => patchPipeline("feature_select", { k: v })} />
          </motion.div>
        )}
        {fs.method === "variance" && (
          <motion.div key="t" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <Slider label="Minimum variance" help="Features whose (scaled) variance is at or below this are dropped. 0 removes only constant columns." value={fs.threshold ?? 0} min={0} max={1} step={0.01} onChange={(v) => patchPipeline("feature_select", { threshold: v })} />
          </motion.div>
        )}
      </AnimatePresence>
    </StageCard>
  );
}

export function TargetCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec, targetCol } = ctx;
  const skew = targetCol?.stats?.skew;
  const min = targetCol?.stats?.min;
  const canLog = min === undefined || min > -1;
  const skewed = skew !== undefined && skew > 1;
  return (
    <StageCard
      id="target" icon={STAGE_ICONS.target} title="Target: clean & transform" open={open} onToggle={onToggle} flash={flash}
      summary={stageState("target", spec, false)}
      why="Remove target values that can't be real (typos like $0 or $2 billion), and squash long-tailed targets with a log so models learn the typical cases."
      info="With log(1+y) the model learns on log-scaled values; predictions are converted back to the original units automatically, so metrics stay comparable. Needs every target value above −1."
    >
      <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 10, flex: "1 1 240px" }}>
          <Segmented<PipelineSpec["target_transform"]>
            value={spec.target_transform}
            onChange={(v) => patchPipeline("target_transform", v)}
            options={[{ value: "none", label: "Keep as is" }, { value: "log1p", label: "log(1 + y)", disabled: !canLog }]}
          />
          {skew !== undefined && (
            <span className="small muted">
              Skew of “{spec.target}”: <b className="num" style={{ color: skewed ? "var(--warning)" : "var(--text)" }}>{skew.toFixed(2)}</b>
              {skewed ? " — a long right tail; a log transform will probably help." : " — fairly symmetric; a transform is optional."}
            </span>
          )}
          {!canLog && <Note icon="🚫" tone="warn">Some target values are ≤ −1, so log(1+y) isn't possible.</Note>}
          <TargetRange ctx={ctx} />
        </div>
        {targetCol?.histogram && (
          <div className="inset" style={{ flex: "1 1 240px", padding: 12 }}>
            <div className="tiny faint" style={{ marginBottom: 6 }}>Distribution of “{spec.target}”</div>
            <Histogram data={targetCol.histogram} color={skewed ? "var(--warning)" : "var(--accent)"} height={80} />
          </div>
        )}
      </div>
    </StageCard>
  );
}

/** Keep only rows whose target lies in a plausible range (applied to all rows before splitting — it's data cleaning). */
function TargetRange({ ctx }: { ctx: CardProps["ctx"] }) {
  const tf = ctx.spec.target_filter ?? { enabled: false, min: null, max: null };
  const st = ctx.targetCol?.stats;
  const set = (patch: Partial<NonNullable<PipelineSpec["target_filter"]>>) => patchPipeline("target_filter", { ...tf, ...patch });
  return (
    <div className="inset col" style={{ padding: 12, gap: 10 }}>
      <Toggle
        label="Remove impossible target values"
        help="Rows whose target is outside the range are treated as data-entry errors and removed from every split. Only remove values that can't be real — rare but genuine values should stay."
        checked={tf.enabled}
        onChange={(v) => set({ enabled: v, min: tf.min ?? (st ? Math.max(0, st.q1 - 3 * (st.q3 - st.q1)) : null), max: tf.max ?? (st ? st.q3 + 6 * (st.q3 - st.q1) : null) })}
      />
      {st && (
        <span className="tiny muted">
          Now: min <b className="num">{fmt(st.min)}</b> · typical <b className="num">{fmt(st.q1)}–{fmt(st.q3)}</b> · max <b className="num" style={{ color: st.max > st.q3 + 20 * (st.q3 - st.q1) ? "var(--danger)" : undefined }}>{fmt(st.max)}</b>
        </span>
      )}
      {tf.enabled && (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted">Keep values from</span>
          <NumberField value={tf.min ?? 0} onChange={(v) => set({ min: v })} width={120} />
          <span className="small muted">to</span>
          <NumberField value={tf.max ?? 0} onChange={(v) => set({ max: v })} width={140} />
        </div>
      )}
    </div>
  );
}
