import { AnimatePresence, motion } from "framer-motion";
import type { PipelineSpec } from "../../lib/types";
import { Segmented, Slider, Toggle } from "../glass";
import type { CardProps } from "./CleanCard";
import { STAGE_ICONS, stageState } from "./FlowStrip";
import { EncodeDemo } from "./illustrations";
import { Note, StageCard, SubHead } from "./StageCard";
import { patchPipeline } from "./state";

export function EncodeCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec, used } = ctx;
  const cats = used.filter((c) => c.role === "categorical");
  const has = cats.length > 0;
  return (
    <StageCard
      id="encode" icon={STAGE_ICONS.encode} title="Encode categories" open={open} onToggle={onToggle} flash={flash} dim={!has && !!ctx.dataset}
      summary={stageState("encode", spec, has)}
      why="Models only understand numbers, so words like “red” or “online” must be turned into numbers."
      info="One-hot makes a yes/no column per category — safe for every model. Ordinal gives each category a number (0, 1, 2…), which is compact but implies an order that may not exist; tree models usually don't mind."
    >
      {!has && ctx.dataset ? (
        <Note icon="🙌">Your columns are already numbers — nothing to encode here.</Note>
      ) : (
        <>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="small muted">Category columns:</span>
            {cats.map((c) => <span key={c.name} className="badge">🏷️ {c.name} <span className="faint">· {c.unique} values</span></span>)}
          </div>
          <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
            <div className="col" style={{ gap: 12, flex: "1 1 240px" }}>
              <Segmented<PipelineSpec["encode"]["method"]>
                value={spec.encode.method}
                onChange={(v) => patchPipeline("encode", { method: v })}
                options={[{ value: "onehot", label: "One-hot (yes/no columns)" }, { value: "ordinal", label: "Ordinal (0, 1, 2…)" }]}
              />
              <span className="small muted" style={{ lineHeight: 1.5 }}>
                {spec.encode.method === "onehot"
                  ? "Each category gets its own yes/no column. No fake order — the safe default."
                  : "Each category becomes a single number. Compact, great for trees, but linear models may read “2 > 1” as meaningful."}
              </span>
              <AnimatePresence initial={false}>
                {spec.encode.method === "onehot" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                    <Slider
                      label="Max categories per column"
                      help="Rare categories beyond this many are lumped together as “other”, so a column with thousands of values doesn't explode into thousands of features."
                      value={spec.encode.max_categories} min={2} max={50} integer
                      onChange={(v) => patchPipeline("encode", { max_categories: v })}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div style={{ flex: "1 1 260px" }}><EncodeDemo method={spec.encode.method} /></div>
          </div>
        </>
      )}
    </StageCard>
  );
}

export function OutliersCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec } = ctx;
  const o = spec.outliers;
  const iqr = o.method === "iqr";
  return (
    <StageCard
      id="outliers" icon={STAGE_ICONS.outliers} title="Outliers" open={open} onToggle={onToggle} flash={flash}
      summary={stageState("outliers", spec, false)}
      why="A few wild values (a typo, a sensor glitch) can drag a model off course. Optionally drop them."
      info="IQR: a row is an outlier if any number is far outside the middle half of the data (beyond Q1 − f·IQR or Q3 + f·IQR). Z-score: if any number is more than f standard deviations from the mean. Only numeric columns are checked."
    >
      <Toggle label="Remove extreme rows from training" checked={o.enabled} onChange={(v) => patchPipeline("outliers", { enabled: v })} />
      <AnimatePresence initial={false}>
        {o.enabled && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="col" style={{ gap: 14 }}>
              <div className="col" style={{ gap: 8 }}>
                <SubHead>How to spot them</SubHead>
                <Segmented<PipelineSpec["outliers"]["method"]>
                  value={o.method}
                  onChange={(v) => patchPipeline("outliers", { method: v, factor: v === "iqr" ? 1.5 : 3 })}
                  options={[{ value: "iqr", label: "IQR fences" }, { value: "zscore", label: "Z-score" }]}
                />
              </div>
              <Slider
                label={iqr ? "Fence width (× IQR)" : "Standard deviations"}
                help={iqr ? "1.5 is the classic box-plot rule. Bigger = only remove the most extreme rows." : "3 is a common choice. Bigger = more forgiving."}
                value={o.factor} min={iqr ? 0.5 : 1.5} max={iqr ? 5 : 6} step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => patchPipeline("outliers", { factor: v })}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Note icon="🛡️">Applies to training rows only — the validation and test rows stay untouched so the final score is honest.</Note>
    </StageCard>
  );
}
