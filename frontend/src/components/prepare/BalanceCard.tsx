import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "../../design/motion";
import { classColor } from "../../lib/colors";
import type { PipelineSpec } from "../../lib/types";
import { ClassBars } from "../charts";
import { Slider } from "../glass";
import type { CardProps } from "./CleanCard";
import { STAGE_ICONS, stageState } from "./FlowStrip";
import { SmoteDemo } from "./illustrations";
import { ChoiceGrid, Note, StageCard, SubHead } from "./StageCard";
import { fmtInt, patchPipeline, trainClassCounts } from "./state";

type RS = PipelineSpec["resample"];

/** Predicted class counts after resampling (before any cleaning step). */
function expectedCounts(mode: RS["mode"], labels: string[], counts: Record<string, number>, custom?: Record<string, number>) {
  const vals = labels.map((l) => counts[l] ?? 0);
  const present = vals.filter((v) => v > 0);
  if (!present.length) return vals;
  switch (mode) {
    case "oversample": return vals.map((v) => (v > 0 ? Math.max(...present) : 0));
    case "undersample": return vals.map((v) => (v > 0 ? Math.min(...present) : 0));
    case "middle": { const m = Math.round(present.reduce((a, b) => a + b, 0) / present.length); return vals.map((v) => (v > 0 ? m : 0)); }
    case "custom": return labels.map((l, i) => (vals[i] > 0 ? Math.max(1, Math.round(custom?.[l] ?? vals[i])) : 0));
    default: return vals;
  }
}

const ratio = (vals: number[]) => {
  const p = vals.filter((v) => v > 0);
  return p.length ? Math.max(...p) / Math.min(...p) : 1;
};

export function BalanceCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec, report } = ctx;
  const rs = spec.resample;
  const counts = trainClassCounts(ctx);
  const labels = (report?.task === "classification" && report.classes) || (counts ? Object.keys(counts) : []);
  const before = counts ? labels.map((l) => counts[l] ?? 0) : [];
  const after = counts ? expectedCounts(rs.mode, labels, counts, rs.target_counts) : [];
  const colors = labels.map((l) => classColor(l, labels));
  const usesOver = rs.mode === "oversample" || rs.mode === "middle" || rs.mode === "custom";
  const usesUnder = rs.mode === "undersample" || rs.mode === "middle" || rs.mode === "custom";
  const r0 = ratio(before), r1 = ratio(after);
  const maxCount = Math.max(1, ...before);
  const customFull = Object.fromEntries(labels.map((l, i) => [l, Math.round(rs.target_counts?.[l] ?? before[i])]));
  const minorIdx = before.length ? before.indexOf(Math.min(...before.filter((v) => v > 0))) : -1;
  const majorIdx = before.length ? before.indexOf(Math.max(...before)) : -1;

  return (
    <StageCard
      id="balance" icon={STAGE_ICONS.balance} title="Balance classes" open={open} onToggle={onToggle} flash={flash}
      summary={stageState("balance", spec, false)}
      why="If one class is rare (like fraud), a model can score well by ignoring it. Rebalancing the training rows makes it pay attention."
      info="Resampling changes the training rows only. Validation and test rows keep the real-world mix, so scores stay honest. Oversampling adds rows (copies or synthetic ones), undersampling removes rows, cleaning removes confusing rows near the class border."
    >
      {/* modes */}
      <ChoiceGrid<RS["mode"]>
        value={rs.mode}
        min={150}
        onChange={(v) => patchPipeline("resample", { mode: v, ...(v === "custom" && !rs.target_counts ? { target_counts: customFull } : {}) })}
        options={[
          { value: "none", icon: "🚫", label: "None", blurb: "Train on the classes as they are." },
          { value: "oversample", icon: "🌱", label: "Grow the rare classes", blurb: "Add rows until every class matches the biggest." },
          { value: "undersample", icon: "✂️", label: "Shrink the common classes", blurb: "Remove rows until every class matches the smallest." },
          { value: "middle", icon: "🤝", label: "Meet in the middle", blurb: "Grow small classes and shrink big ones to the average." },
          { value: "custom", icon: "🎚️", label: "Custom counts", blurb: "Choose exactly how many rows each class gets." },
        ]}
      />

      {/* expected effect */}
      {counts ? (
        <div className="inset row wrap" style={{ padding: 14, gap: 18, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <SubHead info="Dashed outline = training rows today. Solid bar = what the model would train on with this setting (estimated before any cleaning).">Training rows per class</SubHead>
            <div style={{ marginTop: 10 }}><ClassBars labels={labels} before={before} after={after} colors={colors} height={130} /></div>
          </div>
          <div className="col" style={{ gap: 8, flex: "0 1 190px" }}>
            <RatioTile label="Imbalance now" value={r0} />
            <motion.span animate={{ y: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ alignSelf: "center", color: "var(--accent)" }}>↓</motion.span>
            <RatioTile label="After balancing" value={r1} good={r1 < r0 - 0.01 || r1 <= 1.5} />
          </div>
        </div>
      ) : (
        <Note icon="🔎">Run the preparation once to see how many training rows each class has.</Note>
      )}

      {/* custom sliders */}
      <AnimatePresence initial={false}>
        {rs.mode === "custom" && counts && (
          <Reveal key="custom">
            <SubHead info="Lower than today = remove rows with the undersampling technique below. Higher = create rows with the oversampling technique.">Rows per class</SubHead>
            <div className="col" style={{ gap: 10 }}>
              {labels.map((l, i) => {
                const target = customFull[l];
                const diff = target - before[i];
                return (
                  <div key={l} className="row" style={{ gap: 12 }}>
                    <span className="row truncate" style={{ gap: 6, width: 120, flexShrink: 0 }} title={l}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: colors[i], flexShrink: 0 }} />
                      <b className="small truncate">{l}</b>
                    </span>
                    <div className="grow">
                      <Slider fixedRenderer="slider" value={target} min={1} max={Math.max(3 * maxCount, 10)} integer format={fmtInt}
                        onChange={(v) => patchPipeline("resample", { target_counts: { ...customFull, [l]: v } })} />
                    </div>
                    <span className="tiny num" style={{ width: 92, textAlign: "right", color: diff > 0 ? "var(--success)" : diff < 0 ? "var(--danger)" : "var(--text-3)", fontWeight: 650 }}>
                      {fmtInt(before[i])} → {diff === 0 ? "same" : `${diff > 0 ? "+" : "−"}${fmtInt(Math.abs(diff))}`}
                    </span>
                  </div>
                );
              })}
              <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => patchPipeline("resample", { target_counts: Object.fromEntries(labels.map((l, i) => [l, before[i]])) })}>↺ Reset to today's counts</button>
            </div>
          </Reveal>
        )}
      </AnimatePresence>

      {/* oversampling technique */}
      <AnimatePresence initial={false}>
        {usesOver && (
          <Reveal key="over">
            <SubHead info="Random copies duplicate existing rows. The SMOTE family invents new, plausible rows by blending neighbours of the same class — less likely to make the model memorise.">How to grow the rare classes</SubHead>
            <div className="row wrap" style={{ gap: 14, alignItems: "flex-start" }}>
              <div style={{ flex: "2 1 300px" }}>
                <ChoiceGrid<RS["over"]>
                  value={rs.over} min={150} compact
                  onChange={(v) => patchPipeline("resample", { over: v })}
                  options={[
                    { value: "random", icon: "📄", label: "Random copies", blurb: "Duplicates existing rare rows." },
                    { value: "smote", icon: "✨", label: "SMOTE", blurb: "Creates new points between neighbours.", tag: "popular" },
                    { value: "borderline_smote", icon: "🧭", label: "Borderline-SMOTE", blurb: "Focuses on the tricky border." },
                    { value: "adasyn", icon: "🎯", label: "ADASYN", blurb: "Creates more points where it's hardest." },
                    { value: "svm_smote", icon: "🛡️", label: "SVM-SMOTE", blurb: "Uses an SVM to find the border, then fills it in." },
                  ]}
                />
              </div>
              <div className="col" style={{ flex: "1 1 220px", gap: 6 }}>
                <SmoteDemo color={colors[minorIdx] ?? undefined} other={colors[majorIdx] ?? undefined} />
                <span className="tiny muted" style={{ lineHeight: 1.45 }}>
                  {rs.over === "random" ? "Random copying would just stack duplicates on the existing dots. SMOTE (shown) blends neighbours instead." : "Pick a rare point and one of its neighbours, then place a new point somewhere on the line between them."}
                </span>
              </div>
            </div>
            {rs.over !== "random" && (
              <Slider label="Neighbours to blend between (k)" help="How many nearby same-class points are candidates for blending. Small k = new points stay very local; large k = more variety. Lowered automatically if a class is tiny."
                value={rs.k_neighbors} min={1} max={15} integer onChange={(v) => patchPipeline("resample", { k_neighbors: v })} />
            )}
          </Reveal>
        )}
      </AnimatePresence>

      {/* undersampling technique */}
      <AnimatePresence initial={false}>
        {usesUnder && (
          <Reveal key="under">
            <SubHead info="Undersampling throws rows away, so it's fastest and avoids invented data — but you lose information. Good when you have lots of rows.">How to shrink the common classes</SubHead>
            <ChoiceGrid<RS["under"]>
              value={rs.under} min={160} compact
              onChange={(v) => patchPipeline("resample", { under: v })}
              options={[
                { value: "random", icon: "🎲", label: "Random", blurb: "Drops randomly chosen rows." },
                { value: "nearmiss", icon: "📍", label: "NearMiss", blurb: "Keeps the rows closest to the rare class." },
                { value: "cluster_centroids", icon: "🫧", label: "Cluster centroids", blurb: "Replaces groups of rows by their centre point." },
              ]}
            />
          </Reveal>
        )}
      </AnimatePresence>

      {/* cleaning */}
      <div className="col" style={{ gap: 10 }}>
        <SubHead info="Cleaning runs after growing/shrinking and removes rows that sit confusingly close to another class. It can be used on its own too.">Tidy the border (optional)</SubHead>
        <ChoiceGrid<RS["clean"]>
          value={rs.clean} min={160} compact
          onChange={(v) => patchPipeline("resample", { clean: v })}
          options={[
            { value: "none", icon: "—", label: "None", blurb: "Leave the border as is." },
            { value: "tomek", icon: "🔗", label: "Tomek links", blurb: "Remove confusing pairs on the border." },
            { value: "enn", icon: "🗳️", label: "ENN", blurb: "Remove points that disagree with their neighbours." },
          ]}
        />
      </div>

      <Note icon="🛡️">Balancing only touches training rows — validation and test keep the real-world mix, so the final score stays honest.</Note>
    </StageCard>
  );
}

function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ height: spring.gentle, opacity: { duration: 0.2 } }} style={{ overflow: "hidden" }}>
      <div className="col" style={{ gap: 10, paddingTop: 2 }}>{children}</div>
    </motion.div>
  );
}

function RatioTile({ label, value, good }: { label: string; value: number; good?: boolean }) {
  return (
    <div className="col" style={{ gap: 0, alignItems: "center", padding: "6px 10px", borderRadius: 12, background: good ? "color-mix(in srgb, var(--success) 14%, transparent)" : value > 4 ? "color-mix(in srgb, var(--warning) 14%, transparent)" : "var(--fill)" }}>
      <span className="tiny faint">{label}</span>
      <AnimatePresence mode="wait">
        <motion.b key={value.toFixed(1)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="num" style={{ fontSize: 17 }}>
          {value < 1.05 ? "1 : 1" : `${value >= 10 ? Math.round(value) : value.toFixed(1)} : 1`}
        </motion.b>
      </AnimatePresence>
    </div>
  );
}
