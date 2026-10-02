import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { ModelResult } from "../../../lib/types";
import { AnimatedNumber, InfoTip, Segmented } from "../../glass";
import { fmtMetric, isUnit, lowerBetter, metricHelp, metricLabel } from "../util";
import { AnomalyMap, AnomalyScores, TopAnomalies } from "./AnomalyViews";
import { ClusterMap, ClusterProfiles, TruthCheck } from "./ClusterViews";
import { Loadings, ReductionMap, Scree } from "./ReductionViews";

export type UnsupTab = "map" | "profiles" | "truth" | "scree" | "loadings" | "scores" | "top" | "settings";

const TILES: Record<string, string[]> = {
  clustering: ["silhouette", "davies_bouldin", "n_clusters", "ari", "inertia", "bic"],
  reduction: ["trustworthiness", "explained_2d", "explained_all", "n_components"],
  anomaly: ["roc_auc", "avg_precision", "recall", "precision", "flagged_share"],
};

/** A friendly verdict under the headline numbers. */
function verdict(metric: string, v: number): { text: string; tone: "good" | "ok" | "bad" } | null {
  const band = (good: number, ok: number, words: [string, string, string]) =>
    v >= good ? { text: words[0], tone: "good" as const } : v >= ok ? { text: words[1], tone: "ok" as const } : { text: words[2], tone: "bad" as const };
  switch (metric) {
    case "silhouette": return band(0.5, 0.25, ["crisp, well-separated groups", "some real structure", "groups blur together"]);
    case "davies_bouldin": return v <= 0.8 ? { text: "little overlap", tone: "good" } : v <= 1.5 ? { text: "some overlap", tone: "ok" } : { text: "heavy overlap", tone: "bad" };
    case "ari": case "nmi": return band(0.8, 0.5, ["matches the hidden truth", "partly matches the truth", "doesn't match the truth"]);
    case "trustworthiness": return band(0.95, 0.85, ["very faithful map", "mostly faithful", "map invents neighbours"]);
    case "explained_2d": return band(0.7, 0.4, ["most of the picture fits in 2-D", "a fair share fits in 2-D", "much is lost in 2-D"]);
    case "roc_auc": return band(0.9, 0.75, ["excellent ranking", "decent ranking", "weak ranking"]);
    case "avg_precision": return band(0.7, 0.4, ["top of the list is clean", "some false alarms on top", "top is mostly false alarms"]);
    case "recall": return band(0.8, 0.5, ["catches most anomalies", "misses quite a few", "misses most anomalies"]);
    case "precision": return band(0.7, 0.4, ["few false alarms", "some false alarms", "mostly false alarms"]);
    default: return null;
  }
}

/** Headline numbers for an unsupervised model, each with plain-language help and a verdict. */
export function UnsupMetricTiles({ task, metrics }: { task: string; metrics: Record<string, number> }) {
  const keys = (TILES[task] ?? []).filter((k) => metrics[k] !== undefined && metrics[k] !== null);
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 10 }}>
      {keys.map((k, i) => {
        const v = metrics[k];
        const unit = isUnit(k);
        const vd = verdict(k, v);
        return (
          <motion.div key={k} className="inset col" initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.gentle, delay: i * 0.04 }} style={{ padding: 12, gap: 3 }}>
            <span className="row small muted" style={{ gap: 5 }}>{metricLabel(k)}{metricHelp(k, task) && <InfoTip text={metricHelp(k, task)} />}</span>
            <b style={{ fontSize: 24, letterSpacing: "-0.02em" }} className="num">
              {k === "n_clusters" || k === "n_components" ? fmtMetric(k, v) : <AnimatedNumber value={unit ? v * 100 : v} format={(x) => (unit ? `${x.toFixed(1)}%` : Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(3))} />}
            </b>
            {k === "n_clusters" && metrics.noise_share ? <span className="tiny faint">+ {Math.round(metrics.noise_share * 100)}% left as noise</span> : null}
            {vd && <span className="tiny" style={{ fontWeight: 600, color: vd.tone === "good" ? "var(--success)" : vd.tone === "bad" ? "var(--danger)" : "var(--text-2)" }}>{vd.text}</span>}
            {!vd && lowerBetter(k) && <span className="tiny faint">lower is better</span>}
          </motion.div>
        );
      })}
    </div>
  );
}

/** Which tabs make sense for this model's saved results. */
export function unsupTabs(task: string, d: Partial<ModelResult>, modelId: string, withSettings: boolean): { value: UnsupTab; label: string; disabled?: boolean }[] {
  const tabs: { value: UnsupTab; label: string; disabled?: boolean }[] = [];
  if (task === "clustering") {
    tabs.push({ value: "map", label: "🗺️ Map", disabled: !d.clusters?.points?.length });
    tabs.push({ value: "profiles", label: "🧬 Profiles", disabled: !d.clusters?.profiles?.length });
    if (d.clusters?.contingency) tabs.push({ value: "truth", label: "🙈 Truth check" });
  } else if (task === "reduction") {
    tabs.push({ value: "map", label: "🗺️ Map", disabled: !d.reduction?.points?.length });
    if (modelId === "pca") {
      tabs.push({ value: "scree", label: "📊 Scree", disabled: !d.reduction?.kept_curve?.length && !d.reduction?.explained?.length });
      tabs.push({ value: "loadings", label: "🧮 Loadings", disabled: !d.reduction?.loadings?.length });
    }
  } else {
    tabs.push({ value: "scores", label: "📊 Scores", disabled: !d.anomaly?.hist });
    tabs.push({ value: "map", label: "🗺️ Map", disabled: !d.anomaly?.points?.length });
    tabs.push({ value: "top", label: "🚩 Top anomalies", disabled: !d.anomaly?.top?.rows?.length });
  }
  if (withSettings) tabs.push({ value: "settings", label: "Settings" });
  return tabs;
}

/** Tabbed views of an unsupervised model (used on the Train results and the library model page). */
export function UnsupViews({ task, detail, metrics, modelId, liveSample, settings, height = 360 }: {
  task: string;
  detail: Partial<ModelResult>;
  metrics: Record<string, number>;
  modelId: string;
  /** exact 2-D points of the live k-means animation (same session only) */
  liveSample?: number[][] | null;
  settings?: ReactNode;
  height?: number;
}) {
  const tabs = unsupTabs(task, detail, modelId, !!settings);
  const first = tabs.find((t) => !t.disabled)?.value ?? "settings";
  const [tab, setTab] = useState<UnsupTab>(first);
  useEffect(() => {
    if (!tabs.find((t) => t.value === tab && !t.disabled)) setTab(first);
  }, [modelId, task]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ overflowX: "auto" }}>
        <Segmented value={tab} onChange={setTab} options={tabs} size="sm" />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={`${modelId}-${tab}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "map" && task === "clustering" && detail.clusters && <ClusterMap data={detail.clusters} liveSample={liveSample} height={height} modelId={modelId} />}
          {tab === "profiles" && detail.clusters && <ClusterProfiles data={detail.clusters} />}
          {tab === "truth" && detail.clusters && <TruthCheck data={detail.clusters} metrics={metrics} />}
          {tab === "map" && task === "reduction" && detail.reduction && <ReductionMap data={detail.reduction} modelId={modelId} height={height} />}
          {tab === "scree" && detail.reduction && <Scree data={detail.reduction} />}
          {tab === "loadings" && detail.reduction && <Loadings data={detail.reduction} />}
          {tab === "scores" && detail.anomaly && <AnomalyScores data={detail.anomaly} metrics={metrics} />}
          {tab === "map" && task === "anomaly" && detail.anomaly && <AnomalyMap data={detail.anomaly} height={height} />}
          {tab === "top" && detail.anomaly && <TopAnomalies data={detail.anomaly} />}
          {tab === "settings" && settings}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
