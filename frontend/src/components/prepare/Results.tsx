import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { spring, stagger } from "../../design/motion";
import { classColor } from "../../lib/colors";
import type { Histogram as H, PrepareReport } from "../../lib/types";
import { ClassBars, Histogram, SplitBar } from "../charts";
import { AnimatedNumber, Glass, InfoTip } from "../glass";
import { BeforeAfter } from "./BeforeAfter";
import { SplitInfoView } from "./SplitMethod";
import { SPLIT_COLORS } from "./SplitScaleCards";

function histogram(values: number[], bins = 24): H | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  const w = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const x of v) counts[Math.min(bins - 1, Math.floor((x - lo) / w))]++;
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * w), counts };
}

export function Results({ report, logTarget }: { report: PrepareReport; logTarget: boolean }) {
  const isClf = report.task === "classification";
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <Counters report={report} />
      {isClf && report.class_counts_after ? <BalanceResult report={report} /> : <TargetResult report={report} logTarget={logTarget} />}
      {isClf && report.before_points.length > 0 && <BeforeAfter report={report} />}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <SplitsResult report={report} />
        <FeaturesResult report={report} />
      </div>
    </motion.div>
  );
}

function Counters({ report }: { report: PrepareReport }) {
  const isClf = report.task === "classification";
  const tiles = [
    { icon: "📚", label: "training rows", value: report.splits.train, color: "var(--accent)", show: true },
    { icon: "✨", label: "synthetic rows", value: report.added, sign: "+", color: "var(--success)", show: isClf },
    { icon: "🧽", label: "rows removed by balancing", value: report.removed, sign: "−", color: "var(--danger)", show: isClf },
    { icon: "🎯", label: "outliers removed", value: report.outliers_removed, color: "var(--warning)", show: true },
    { icon: "👯", label: "duplicates found", value: report.duplicates_found ?? 0, color: "var(--warning)", show: !!report.duplicates_found },
    { icon: "🛠️", label: "features created", value: report.features_created?.length ?? 0, sign: "+", color: "var(--success)", show: !!report.features_created?.length },
    { icon: "🧮", label: "features", value: report.n_features, color: "var(--accent-2)", show: true },
  ].filter((t) => t.show);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
      {tiles.map((t, i) => (
        <Glass key={t.label} animate_in style={{ padding: "14px 16px" }}>
          <div className="row" style={{ gap: 8 }}>
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.1 + i * 0.06 }} style={{ fontSize: 18 }}>{t.icon}</motion.span>
            <b className="num" style={{ fontSize: 24, color: t.value ? t.color : "var(--text-3)", letterSpacing: -0.5 }}>
              {t.value > 0 && t.sign}<AnimatedNumber value={t.value} format={(v) => Math.round(v).toLocaleString()} duration={1.1} />
            </b>
          </div>
          <div className="small muted" style={{ marginTop: 2 }}>{t.label}</div>
        </Glass>
      ))}
    </div>
  );
}

function BalanceResult({ report }: { report: PrepareReport }) {
  const labels = report.classes ?? Object.keys(report.class_counts_after ?? {});
  const before = labels.map((l) => report.class_counts_before?.[l] ?? 0);
  const after = labels.map((l) => report.class_counts_after?.[l] ?? 0);
  const test = labels.map((l) => report.class_counts_test?.[l] ?? 0);
  const changed = before.some((b, i) => b !== after[i]);
  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>Class balance in training</h3>
          <InfoTip text="Dashed outline = training rows before balancing. Solid bar = what the models will actually learn from. Test rows are never resampled." />
        </div>
        <span className="small muted">{changed ? "Dashed = before · solid = after" : "Unchanged — no balancing applied"}</span>
      </div>
      <ClassBars labels={labels} before={changed ? before : undefined} after={after} colors={labels.map((l) => classColor(l, report.classes))} height={170} />
      {report.class_counts_test && (
        <div className="row wrap small" style={{ gap: 10, marginTop: 12 }}>
          <span className="muted">Test set (real-world mix):</span>
          {labels.map((l, i) => (
            <span key={l} className="row" style={{ gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: classColor(l, report.classes) }} />
              <span className="muted">{l}</span> <b className="num">{test[i].toLocaleString()}</b>
            </span>
          ))}
        </div>
      )}
    </Glass>
  );
}

function TargetResult({ report, logTarget }: { report: PrepareReport; logTarget: boolean }) {
  const values = report.target_hist_train?.values ?? [];
  const raw = useMemo(() => histogram(values), [values]);
  const canLog = values.length > 0 && values.every((v) => v > -1);
  const logged = useMemo(() => (canLog ? histogram(values.map((v) => Math.log1p(v))) : null), [values, canLog]);
  if (!raw) return null;
  return (
    <Glass animate_in>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontSize: 16 }}>Target values in training</h3>
        <InfoTip text="How the numbers you're predicting are spread across the training rows. A long tail to the right often means a log transform will help." />
      </div>
      <div className="grid" style={{ gridTemplateColumns: logged ? "repeat(auto-fit, minmax(240px, 1fr))" : "1fr", gap: 16 }}>
        <div className="inset" style={{ padding: 12 }}>
          <div className="tiny faint" style={{ marginBottom: 6 }}>Original units</div>
          <Histogram data={raw} height={130} />
        </div>
        {logged && (
          <div className="inset" style={{ padding: 12, opacity: logTarget ? 1 : 0.7 }}>
            <div className="tiny faint" style={{ marginBottom: 6 }}>{logTarget ? "What the models learn on: log(1 + y)" : "What log(1 + y) would look like"}</div>
            <Histogram data={logged} height={130} color="var(--accent-2)" />
          </div>
        )}
      </div>
    </Glass>
  );
}

function SplitsResult({ report }: { report: PrepareReport }) {
  const s = report.splits;
  const delta = s.train - s.train_before_resample;
  return (
    <Glass animate_in>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 16 }}>Splits</h3>
        <InfoTip text="Actual row counts after cleaning. The test rows stay locked away until the final evaluation." />
      </div>
      <SplitBar parts={[
        { label: "Train", value: s.train, color: SPLIT_COLORS.train },
        { label: "Validation", value: s.val, color: SPLIT_COLORS.val },
        { label: "Test", value: s.test, color: SPLIT_COLORS.test },
      ]} />
      <div className="small muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
        Training rows before balancing: <b className="num" style={{ color: "var(--text)" }}>{s.train_before_resample.toLocaleString()}</b>
        {delta !== 0 && (
          <span className="badge" style={{ marginLeft: 8, color: delta > 0 ? "var(--success)" : "var(--danger)" }}>
            {delta > 0 ? "+" : "−"}{Math.abs(delta).toLocaleString()} after balancing
          </span>
        )}
      </div>
      {report.split_info && (report.split_info.method !== "random" || report.split_info.group_column) && (
        <div style={{ marginTop: 12 }}><SplitInfoView info={report.split_info} compact /></div>
      )}
    </Glass>
  );
}

export function FeaturesResult({ report }: { report: PrepareReport }) {
  const names = report.feature_names_out;
  const shown = names.slice(0, 40);
  return (
    <Glass animate_in>
      <div className="row between" style={{ gap: 8, marginBottom: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>Features the models will see</h3>
          <InfoTip text="The final columns after encoding and selection. One-hot columns look like ‘column_value’." />
        </div>
        <span className="badge accent num">{names.length}</span>
      </div>
      <motion.div variants={stagger(0.015)} initial="hidden" animate="show" className="row wrap" style={{ gap: 5 }}>
        {shown.map((n, i) => (
          <motion.span key={`${n}-${i}`} variants={{ hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1 } }} className="badge mono" style={{ fontSize: 11 }}>
            {(report.features_created ?? []).some((f) => n === f || n.startsWith(`${f}_`)) ? "✨ " : report.categorical_columns.some((c) => n.startsWith(`${c}_`)) ? "🏷️ " : ""}{n}
          </motion.span>
        ))}
        {names.length > shown.length && <span className="badge">+{names.length - shown.length} more</span>}
      </motion.div>
      <AnimatePresence>
        {report.warnings.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="col" style={{ gap: 6, marginTop: 14 }}>
            <span className="eyebrow">Heads-up</span>
            {report.warnings.map((w) => (
              <div key={w} className="row small" style={{ gap: 8, alignItems: "flex-start", padding: "7px 10px", borderRadius: 10, background: "rgba(255,159,10,.12)" }}>
                <span>⚠️</span><span className="muted" style={{ lineHeight: 1.45 }}>{w}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </Glass>
  );
}

/** Placeholder shown while the very first run is in progress. */
export function ResultsSkeleton() {
  return (
    <div className="col" style={{ gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 76, borderRadius: "var(--r-lg)" }} />)}
      </div>
      <div className="skeleton" style={{ height: 220, borderRadius: "var(--r-lg)" }} />
      <div className="skeleton" style={{ height: 360, borderRadius: "var(--r-lg)" }} />
    </div>
  );
}
