import { motion } from "framer-motion";
import { useMemo } from "react";
import { spring, stagger } from "../../../design/motion";
import { classColor } from "../../../lib/colors";
import type { Histogram as H, PrepareReport } from "../../../lib/types";
import { Histogram } from "../../charts";
import { AnimatedNumber, Glass, InfoTip } from "../../glass";
import { Thumb } from "../../data/image/Thumb";
import { SPLIT_COLORS } from "../SplitScaleCards";

/** What the image pipeline produced: counts, the model's-eye view, augmentation variants and class mix per split. */
export function ImageResults({ report, datasetId, grayscale, stored, classTotals }: { report: PrepareReport; datasetId: string; grayscale: boolean; stored: number; classTotals?: Record<string, number> | null }) {
  const shape = (report.image_shape as number[] | null) ?? [];
  const isClf = report.task === "classification";
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <Counters report={report} shape={shape} />
      <ModelEye report={report} shape={shape} datasetId={datasetId} grayscale={grayscale} stored={stored} />
      {(report.augment_preview?.length ?? 0) > 0 && <AugmentStrip report={report} grayscale={grayscale} />}
      {isClf && report.class_counts_before ? <ClassSplits report={report} totals={classTotals ?? null} /> : <TargetSpread report={report} />}
      {report.warnings.length > 0 && (
        <Glass animate_in style={{ padding: 16 }}>
          <div className="col small" style={{ gap: 6 }}>
            {report.warnings.map((w) => <span key={w} style={{ color: "var(--warning)" }}>⚠️ {w}</span>)}
          </div>
        </Glass>
      )}
    </motion.div>
  );
}

function Counters({ report, shape }: { report: PrepareReport; shape: number[] }) {
  const tiles = [
    { icon: "📚", label: "training pictures", value: report.splits.train, color: SPLIT_COLORS.train },
    { icon: "🧭", label: "validation pictures", value: report.splits.val, color: SPLIT_COLORS.val },
    { icon: "🔒", label: "test pictures", value: report.splits.test, color: SPLIT_COLORS.test },
    { icon: "🧮", label: "numbers per picture", value: report.n_features, color: "var(--accent-2)" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
      {tiles.map((t, i) => (
        <Glass key={t.label} animate_in style={{ padding: "14px 16px" }}>
          <div className="row" style={{ gap: 8 }}>
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.1 + i * 0.06 }} style={{ fontSize: 18 }}>{t.icon}</motion.span>
            <b className="num" style={{ fontSize: 24, color: t.value ? t.color : "var(--text-3)", letterSpacing: -0.5 }}>
              <AnimatedNumber value={t.value} format={(v) => Math.round(v).toLocaleString()} duration={1.1} />
            </b>
          </div>
          <div className="small muted" style={{ marginTop: 2 }}>{t.label}{t.icon === "🧮" && shape.length === 3 ? ` (${shape.join("×")})` : ""}</div>
        </Glass>
      ))}
    </div>
  );
}

/** A few training pictures exactly as the model will receive them. */
function ModelEye({ report, shape, datasetId, grayscale, stored }: { report: PrepareReport; shape: number[]; datasetId: string; grayscale: boolean; stored: number }) {
  const size = shape[1] ?? 32;
  const ids = report.sample_images ?? [];
  if (!ids.length) return null;
  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>👁️ What the model sees</h3>
          <InfoTip text="Each picture is resized to the training resolution, optionally turned grey, and every pixel value is scaled to a number between 0 and 1." />
        </div>
        <span className="small muted num">{shape.join(" × ")} = {report.n_features.toLocaleString()} numbers between 0 and 1</span>
      </div>
      <div className="row wrap" style={{ gap: 10 }}>
        {ids.map((i, k) => <Thumb key={i} datasetId={datasetId} i={i} size={Math.min(size, stored)} box={72} grayscale={grayscale} delay={k * 0.05} />)}
      </div>
    </Glass>
  );
}

/** Original + augmented variants made by the pipeline, flipping in one by one. */
function AugmentStrip({ report, grayscale }: { report: PrepareReport; grayscale: boolean }) {
  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>🪄 Augmented training pictures</h3>
          <InfoTip text="Made by the real pipeline with your settings. During training each picture gets a fresh random variant every time it's used, so the model practically never sees the exact same picture twice." />
        </div>
        <span className="small muted">Same answer, different pixels — the model learns what really matters.</span>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {report.augment_preview!.map((row, r) => (
          <div key={row.i} className="inset row" style={{ padding: 8, gap: 8, overflowX: "auto" }}>
            <div className="col" style={{ gap: 3, alignItems: "center", flexShrink: 0 }}>
              <img src={row.original} alt="" width={64} height={64} style={{ borderRadius: 10, boxShadow: "0 0 0 2px var(--accent)", imageRendering: "pixelated", filter: grayscale ? "grayscale(1)" : "none" }} />
              <span className="tiny faint">original</span>
            </div>
            <span className="faint" style={{ fontSize: 16, padding: "0 2px" }}>→</span>
            {row.variants.map((v, k) => (
              <motion.div key={k} className="col" style={{ gap: 3, alignItems: "center", flexShrink: 0 }}
                initial={{ opacity: 0, rotateY: 90, scale: 0.8 }} animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                transition={{ ...spring.gentle, delay: 0.2 + r * 0.12 + k * 0.07 }}>
                <img src={v} alt="" width={64} height={64} style={{ borderRadius: 10, imageRendering: "pixelated", boxShadow: "0 1px 4px rgba(0,0,0,.12)", filter: grayscale ? "grayscale(1)" : "none" }} />
                <span className="tiny faint">variant {k + 1}</span>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </Glass>
  );
}

/** Pictures per class in the training and test splits. */
function ClassSplits({ report, totals }: { report: PrepareReport; totals: Record<string, number> | null }) {
  const labels = report.classes ?? Object.keys(report.class_counts_before ?? {});
  const train = labels.map((l) => report.class_counts_before?.[l] ?? 0);
  const test = labels.map((l) => report.class_counts_test?.[l] ?? 0);
  // validation counts aren't in the report: whatever of each class is neither train nor test
  const val = labels.map((l, i) => (totals?.[l] !== undefined ? Math.max(0, totals[l] - train[i] - test[i]) : 0));
  const max = Math.max(1, ...train.map((t, i) => t + val[i] + test[i]));
  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>⚖️ Classes in each split</h3>
          <InfoTip text="Each class is split in the same proportion, so the test exam has a fair mix of every class." />
        </div>
        <span className="row small muted" style={{ gap: 12 }}>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: SPLIT_COLORS.train }} />train</span>
          {val.some(Boolean) && <span className="row" style={{ gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: SPLIT_COLORS.val }} />validation</span>}
          <span className="row" style={{ gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: SPLIT_COLORS.test }} />test</span>
        </span>
      </div>
      <div className="col" style={{ gap: 8 }}>
        {labels.map((l, i) => (
          <div key={l} className="row" style={{ gap: 10 }}>
            <span className="row small truncate" style={{ width: 110, gap: 6, flexShrink: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: classColor(l, labels), flexShrink: 0 }} />
              <span className="truncate" title={l}>{l}</span>
            </span>
            <div className="row grow" style={{ height: 18, gap: 2 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(train[i] / max) * 100}%` }} transition={{ ...spring.gentle, delay: i * 0.04 }}
                style={{ height: "100%", background: SPLIT_COLORS.train, borderRadius: "6px 2px 2px 6px", opacity: 0.85 }} />
              {val[i] > 0 && <motion.div initial={{ width: 0 }} animate={{ width: `${(val[i] / max) * 100}%` }} transition={{ ...spring.gentle, delay: 0.08 + i * 0.04 }}
                style={{ height: "100%", background: SPLIT_COLORS.val, borderRadius: 2, opacity: 0.85 }} />}
              <motion.div initial={{ width: 0 }} animate={{ width: `${(test[i] / max) * 100}%` }} transition={{ ...spring.gentle, delay: 0.15 + i * 0.04 }}
                style={{ height: "100%", background: SPLIT_COLORS.test, borderRadius: "2px 6px 6px 2px", opacity: 0.85 }} />
            </div>
            <span className="num small muted" style={{ width: 110, textAlign: "right" }}>{[train[i], ...(val.some(Boolean) ? [val[i]] : []), test[i]].map((v) => v.toLocaleString()).join(" · ")}</span>
          </div>
        ))}
      </div>
    </Glass>
  );
}

function TargetSpread({ report }: { report: PrepareReport }) {
  const hist = useMemo<H | null>(() => {
    const v = (report.target_hist_train?.values ?? []).filter(Number.isFinite);
    if (!v.length) return null;
    let lo = Math.min(...v), hi = Math.max(...v);
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
    const bins = 24, w = (hi - lo) / bins;
    const counts = new Array(bins).fill(0);
    for (const x of v) counts[Math.min(bins - 1, Math.floor((x - lo) / w))]++;
    return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * w), counts };
  }, [report]);
  if (!hist) return null;
  return (
    <Glass animate_in>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 16 }}>📊 Answers in the training pictures</h3>
        <InfoTip text="The spread of the numbers the model will learn to predict. Gaps mean the model sees few examples of those values." />
      </div>
      <Histogram data={hist} color={SPLIT_COLORS.train} height={150} />
    </Glass>
  );
}
