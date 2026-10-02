import { motion } from "framer-motion";
import { spring } from "../../design/motion";
import { useProject } from "../../lib/store";
import type { PipelineSpec } from "../../lib/types";
import { SplitBar } from "../charts";
import { NumberField, Segmented, Slider, Toggle } from "../glass";
import type { CardProps } from "./CleanCard";
import { STAGE_ICONS, stageState } from "./FlowStrip";
import { ScaleDemo } from "./illustrations";
import { SplitInfoView, SplitMethodPicker, SplitMethodSettings } from "./SplitMethod";
import { Note, StageCard, SubHead } from "./StageCard";
import { MODELS_NEED_SCALING, patchPipeline } from "./state";
import { textOn } from "../data/contrast";

export const SPLIT_COLORS = { train: "#0A84FF", val: "#BF5AF2", test: "#FF9F0A", resampled: "#30D158" };

export function SplitCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec, dataset, targetCol, isClf, report } = ctx;
  const sp = spec.split;
  const method = sp.method ?? "random";
  const info = report?.split_info;
  const n = Math.max(0, (dataset?.n_rows ?? 0) - (targetCol?.missing ?? 0));
  const test = Math.round(n * sp.test_size), val = Math.round(n * sp.val_size);
  const setTest = (v: number) => patchPipeline("split", { test_size: v, val_size: Math.min(sp.val_size, Math.round((0.8 - v) * 100) / 100) });
  const setVal = (v: number) => patchPipeline("split", { val_size: Math.min(v, Math.round((0.8 - sp.test_size) * 100) / 100) });
  return (
    <StageCard
      id="split" icon={STAGE_ICONS.split} title="Split train / validation / test" open={open} onToggle={onToggle} flash={flash}
      summary={stageState("split", spec, false)}
      why="We hide some rows from the model — like a final exam it never gets to study for — to check it really learned."
      info="Training rows are what the model learns from. Validation rows are used while training (early stopping, comparing settings). Test rows are locked away until the very end, so the final score shows how the model will do on brand-new data."
    >
      <div className="col" style={{ gap: 10 }}>
        <SubHead info="How rows are dealt into train / validation / test. The test only means something if it's truly new to the model — related rows (the same patient, or tomorrow's data) must not leak into training.">How to split</SubHead>
        <SplitMethodPicker ctx={ctx} />
        <SplitMethodSettings ctx={ctx} />
      </div>
      <div className="inset" style={{ padding: 14 }}>
        <SplitBar parts={[
          { label: "Train", value: Math.max(0, n - test - val), color: SPLIT_COLORS.train },
          { label: "Validation", value: val, color: SPLIT_COLORS.val },
          { label: "Test (locked away)", value: test, color: SPLIT_COLORS.test },
        ]} />
        {n > 0 && <div className="tiny faint" style={{ marginTop: 8 }}>Estimated from {n.toLocaleString()} usable rows{method === "group" ? " — with whole groups the real counts shift a little" : method === "time" ? ", oldest first" : ""}.</div>}
      </div>
      {info && (
        <div className="col" style={{ gap: 8 }}>
          <SubHead info="What the most recent preparation run actually did.">Last run</SubHead>
          <SplitInfoView info={info} />
        </div>
      )}
      <div className="row wrap" style={{ gap: 20 }}>
        <div style={{ flex: "1 1 220px" }}>
          <Slider label="Test size" help="Share of rows kept for the final exam. 15–25% is typical." value={sp.test_size} min={0.05} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={setTest} />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <Slider label="Validation size" help="Share of rows used to check progress while training. Set 0 to skip." value={sp.val_size} min={0} max={0.4} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={setVal} />
        </div>
      </div>
      <div className="row wrap" style={{ gap: 24 }}>
        {isClf && method === "random" && (
          <div style={{ flex: "1 1 240px" }}>
            <Toggle label="Keep class mix the same in every split" help="‘Stratify’: each split gets the same share of every class. Important when one class is rare — otherwise the test set might get almost none of it." checked={sp.stratify} onChange={(v) => patchPipeline("split", { stratify: v })} />
          </div>
        )}
        {method !== "time" && <div className="row" style={{ gap: 10 }}>
          <SubHead info="The random seed decides which rows land where. Same seed = same split every time, so results are reproducible.">Shuffle seed</SubHead>
          <NumberField value={sp.seed} min={0} max={1e6} onChange={(v) => patchPipeline("split", { seed: Math.round(v) })} width={84} />
          <motion.button className="btn sm ghost" whileTap={{ rotate: 180 }} transition={spring.snappy} title="New random seed" onClick={() => patchPipeline("split", { seed: Math.floor(Math.random() * 10000) })}>🎲</motion.button>
        </div>}
      </div>
    </StageCard>
  );
}

export function ScaleCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec, project } = ctx;
  const registry = useProject((s) => s.registry);
  const needy = Array.from(new Set(project.models.map((m) => m.model_id))).filter((id) => MODELS_NEED_SCALING.has(id));
  const label = (id: string) => registry.find((r) => r.id === id);
  const off = spec.scale.method === "none";
  return (
    <StageCard
      id="scale" icon={STAGE_ICONS.scale} title="Scale numbers" open={open} onToggle={onToggle} flash={flash}
      summary={stageState("scale", spec, false)}
      why={ctx.unsup
        ? <><b>Distances need scaling.</b> Groups, maps and outliers are all about how far apart rows are — unscaled, one big-number column decides everything.</>
        : "Puts features on similar ranges, so “income in dollars” doesn't drown out “age in years”."}
      info="Scalers are fitted on the training rows only, then applied to validation/test. Distance-based models (KNN, SVM, clustering, PCA) and gradient-trained models (linear models, neural nets) care a lot; tree models don't care at all."
    >
      {ctx.unsup && <DistanceNote off={off} />}
      <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 12, flex: "1 1 240px" }}>
          <Segmented<PipelineSpec["scale"]["method"]>
            value={spec.scale.method}
            onChange={(v) => patchPipeline("scale", { method: v })}
            options={[{ value: "none", label: "None" }, { value: "standard", label: "Standard" }, { value: "minmax", label: "Min-max" }, { value: "robust", label: "Robust" }]}
          />
          {needy.length > 0 ? (
            <div className="col" style={{ gap: 6 }}>
              <span className="small muted">These models of yours need scaling:</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {needy.map((id) => <span key={id} className={`badge ${off ? "danger" : "success"}`}>{label(id)?.emoji} {label(id)?.label ?? id}</span>)}
              </div>
              {off && <Note icon="⚠️" tone="warn">Scaling is off but these models compare distances or use gradients — expect worse results.</Note>}
            </div>
          ) : (
            <span className="small muted">None of your models depend on scale (trees don't care), but scaling never hurts.</span>
          )}
        </div>
        <div style={{ flex: "1 1 260px" }}><ScaleDemo method={spec.scale.method} /></div>
      </div>
    </StageCard>
  );
}

/** Unsupervised projects: why scaling matters so much when everything is measured in distances. */
function DistanceNote({ off }: { off: boolean }) {
  const rows = [
    { name: "age", raw: 34, w: off ? 0.04 : 0.5, color: "#0A84FF" },
    { name: "income", raw: 52000, w: off ? 0.96 : 0.5, color: "#FF9F0A" },
  ];
  return (
    <div className="inset col" style={{ padding: 14, gap: 10, borderLeft: `3px solid ${off ? "var(--warning)" : "var(--success)"}` }}>
      <span className="small" style={{ lineHeight: 1.5, color: "var(--text-2)" }}>
        How much each column counts when measuring the distance between two shoppers {off ? <b style={{ color: "var(--warning)" }}>without scaling</b> : <b style={{ color: "var(--success)" }}>with scaling</b>}:
      </span>
      <div className="row" style={{ height: 26, borderRadius: 9, overflow: "hidden", gap: 2 }}>
        {rows.map((r) => (
          <motion.div key={r.name} animate={{ flexGrow: r.w }} transition={spring.gentle}
            style={{ flexBasis: 0, height: "100%", background: r.color, color: textOn(r.color), fontSize: 11, fontWeight: 650, display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", overflow: "hidden", minWidth: 4 }}>
            {r.w > 0.15 ? `${r.name} · ${Math.round(r.w * 100)}%` : ""}
          </motion.div>
        ))}
      </div>
      <span className="tiny muted">{off ? "Income is measured in thousands, so it swamps age — the groups would be decided by income alone." : "Both columns now have a fair say in who counts as “similar”."}</span>
    </div>
  );
}
