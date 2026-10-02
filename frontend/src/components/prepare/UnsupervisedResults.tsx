import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring, stagger } from "../../design/motion";
import type { PrepareReport } from "../../lib/types";
import { Scatter, SplitBar } from "../charts";
import { AnimatedNumber, Glass, InfoTip, Segmented } from "../glass";
import { FeaturesResult } from "./Results";

/** Prepare results for clustering / reduction / anomaly projects: counters, the rows on a map, hold-out and features. */
export function UnsupervisedResults({ report, task }: { report: PrepareReport & { truth?: string | null }; task: string }) {
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <Counters report={report} />
      <RowsMap report={report} task={task} />
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <HoldoutResult report={report} />
        <FeaturesResult report={report} />
      </div>
    </motion.div>
  );
}

function Counters({ report }: { report: PrepareReport }) {
  const tiles = [
    { icon: "🔭", label: "rows to explore", value: report.splits.train, color: "var(--accent)", show: true },
    { icon: "🫙", label: "rows held out", value: report.splits.test, color: "var(--warning)", show: report.splits.test > 0 },
    { icon: "🎯", label: "outliers removed", value: report.outliers_removed, color: "var(--warning)", show: true },
    { icon: "👯", label: "duplicates found", value: report.duplicates_found ?? 0, color: "var(--warning)", show: !!report.duplicates_found },
    { icon: "🛠️", label: "features created", value: report.features_created?.length ?? 0, sign: "+", color: "var(--success)", show: !!report.features_created?.length },
    { icon: "🧮", label: "features the models compare", value: report.n_features, color: "var(--accent-2)", show: true },
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

type Colour = "truth" | "plain";

const MAP_COPY: Record<string, string> = {
  clustering: "If you can already see clumps, the clustering models will have an easy time. One big blob? They'll have to work harder.",
  reduction: "This is a quick PCA view of the prepared features — the models on the next step will draw their own, better maps.",
  anomaly: "Most rows should form a crowd. Dots far from it are the kind of thing the detectors will flag.",
};

/** The prepared training rows flattened to 2-D, optionally coloured by the hidden truth. */
function RowsMap({ report, task }: { report: PrepareReport & { truth?: string | null }; task: string }) {
  const truth = report.truth ?? null;
  const [colour, setColour] = useState<Colour>(truth ? "truth" : "plain");
  const classes = useMemo(() => {
    // most common first — the same order (and colours) as the Data page's answer-key bars
    const n = new Map<string, number>();
    for (const p of report.before_points) if (p.label !== null && p.label !== undefined) n.set(String(p.label), (n.get(String(p.label)) ?? 0) + 1);
    return Array.from(n.keys()).sort((a, b) => n.get(b)! - n.get(a)! || a.localeCompare(b));
  }, [report]);
  const points = useMemo(
    () => (colour === "truth" && truth ? report.before_points : report.before_points.map((p) => ({ ...p, label: null }))),
    [report, colour, truth],
  );
  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 10, marginBottom: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>Your prepared rows on a map</h3>
          <InfoTip text="Every prepared row squashed to 2 dimensions with PCA so we can draw it. Close dots are rows the models will consider similar — after cleaning, encoding and scaling." />
        </div>
        {truth && (
          <Segmented<Colour> size="sm" value={colour} onChange={setColour}
            options={[{ value: "truth", label: `🙈 Colour by “${truth}”` }, { value: "plain", label: "What the models see" }]} />
        )}
      </div>
      <p className="small muted" style={{ marginBottom: 10 }}>
        {colour === "truth" && truth
          ? <>Colours come from the hidden “{truth}” column — the models <b>don't</b> get them. </>
          : <>No colours: this is exactly what the models get — just dots. </>}
        {MAP_COPY[task] ?? MAP_COPY.clustering}
      </p>
      <div className="inset" style={{ padding: 10 }}>
        <Scatter points={points} classes={colour === "truth" ? classes : null} height={320} radius={3} showLegend={colour === "truth" && !!truth} />
      </div>
      {report.before_points.length < report.splits.train && <div className="tiny faint" style={{ marginTop: 6 }}>Showing a sample of rows to keep things smooth.</div>}
    </Glass>
  );
}

function HoldoutResult({ report }: { report: PrepareReport }) {
  const s = report.splits;
  return (
    <Glass animate_in>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 16 }}>Rows</h3>
        <InfoTip text="Discovery rows are what the models learn the structure from. Held-out rows (if any) are assigned afterwards as a reality check." />
      </div>
      <SplitBar parts={[
        { label: "Discover on", value: s.train, color: "#0A84FF" },
        { label: "Held out", value: s.test, color: "#FF9F0A" },
      ]} />
      <div className="small muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
        {s.test > 0
          ? <>The models will never see the <b className="num" style={{ color: "var(--text)" }}>{s.test.toLocaleString()}</b> held-out rows while discovering.</>
          : <>Every row is used for discovery — no hold-out.</>}
      </div>
    </Glass>
  );
}
