import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { ModelResult } from "../../../lib/types";
import { LineChart, type Series } from "../../charts";
import { AnimatedNumber, InfoTip, Segmented } from "../../glass";
import { fmtMetric, isUnit, lowerBetter, metricHelp, metricLabel, vsBaseline } from "../util";
import { ExampleUsers } from "./ExampleUsers";
import { LongTail } from "./LongTail";
import { TasteMap } from "./TasteMap";

export type RecTab = "recs" | "tail" | "map" | "curve" | "settings";

const TILES = ["ndcg_at_10", "recall_at_10", "hit_rate", "coverage", "novelty", "rmse"];

/** Plain-language headline for each tile. */
const SAYS: Record<string, (v: number) => string> = {
  ndcg_at_10: () => "hits near the top count more",
  recall_at_10: (v) => `finds ${Math.round(v * 100)}% of the films they went on to like`,
  hit_rate: (v) => `${Math.round(v * 100)}% of viewers get at least one hit`,
  coverage: (v) => `${Math.round(v * 100)}% of the catalogue gets shown`,
  novelty: (v) => (v < 0.15 ? "sticks to blockbusters" : v > 0.6 ? "digs deep into niche titles" : "mixes hits with discoveries"),
  rmse: (v) => `star guesses off by ~${v.toFixed(1)} on average`,
};

/** Headline numbers for a recommender, each with a plain sentence and (optionally) the "Most popular" comparison. */
export function RecsysTiles({ metrics, reference }: { metrics: Record<string, number>; reference?: Record<string, number> | null }) {
  const keys = TILES.filter((k) => metrics[k] !== undefined && metrics[k] !== null);
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))", gap: 10 }}>
      {keys.map((k, i) => {
        const v = metrics[k];
        const unit = isUnit(k);
        const ref = reference?.[k];
        const vs = ref !== undefined && k !== "novelty" ? vsBaseline(k, v, ref) : null;
        return (
          <motion.div key={k} className="inset col" initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.gentle, delay: i * 0.04 }} style={{ padding: 12, gap: 3 }}>
            <span className="row small muted" style={{ gap: 5 }}>{metricLabel(k)}{metricHelp(k, "recommendation") && <InfoTip text={metricHelp(k, "recommendation")} />}</span>
            <b style={{ fontSize: 24, letterSpacing: "-0.02em" }} className="num">
              <AnimatedNumber value={unit ? v * 100 : v} format={(x) => (unit ? `${x.toFixed(1)}%` : x.toFixed(3))} />
            </b>
            <span className="tiny" style={{ color: "var(--text-2)", lineHeight: 1.35 }}>{SAYS[k]?.(v)}</span>
            {vs && (
              <span className="tiny num" style={{ color: vs.delta > 0 ? "var(--success)" : vs.delta < 0 ? "var(--danger)" : "var(--text-3)" }}>
                🔥 most popular {fmtMetric(k, ref)} · {vs.text}
              </span>
            )}
            {!vs && lowerBetter(k) && <span className="tiny faint">lower is better</span>}
          </motion.div>
        );
      })}
    </div>
  );
}

/** Which recommender tabs make sense for these saved results. */
export function recTabs(d: Partial<ModelResult>, withSettings: boolean): { value: RecTab; label: string; disabled?: boolean }[] {
  const r = d.recsys;
  const tabs: { value: RecTab; label: string; disabled?: boolean }[] = [
    { value: "recs", label: "🍿 Recommendations", disabled: !r?.examples?.length },
    { value: "tail", label: "📉 Long tail", disabled: !r?.long_tail?.popularity?.length },
  ];
  if (r?.item_map?.length) tabs.push({ value: "map", label: "🗺️ Taste map" });
  if (d.curve?.points?.length) tabs.push({ value: "curve", label: "📈 Learning curve" });
  if (withSettings) tabs.push({ value: "settings", label: "Settings" });
  return tabs;
}

/** Tabbed views of a recommender (Train results and the library model page). */
export function RecsysViews({ detail, metrics, modelId, settings, height = 380 }: {
  detail: Partial<ModelResult>;
  metrics: Record<string, number>;
  modelId: string;
  settings?: ReactNode;
  height?: number;
}) {
  const tabs = recTabs(detail, !!settings);
  const first = tabs.find((t) => !t.disabled)?.value ?? "settings";
  const [tab, setTab] = useState<RecTab>(first);
  useEffect(() => {
    if (!tabs.find((t) => t.value === tab && !t.disabled)) setTab(first);
  }, [modelId]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = detail.recsys;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ overflowX: "auto" }}>
        <Segmented value={tab} onChange={setTab} options={tabs} size="sm" />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={`${modelId}-${tab}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "recs" && r && <ExampleUsers data={r} explains={modelId === "item_knn"} />}
          {tab === "tail" && r?.long_tail && <LongTail data={r.long_tail} coverage={metrics.coverage} novelty={metrics.novelty} />}
          {tab === "map" && r?.item_map && <TasteMap items={r.item_map} height={height} />}
          {tab === "curve" && detail.curve && <RecCurve curve={detail.curve} />}
          {tab === "settings" && settings}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function RecCurve({ curve }: { curve: NonNullable<ModelResult["curve"]> }) {
  const pts = curve.points;
  const series: Series[] = [
    { name: "Training ratings", color: "#0A84FF", points: pts.map((p) => ({ x: p.step, y: p.train_loss })) },
    ...(pts.some((p) => p.val_loss != null) ? [{ name: "Held-out ratings", color: "#FF375F", points: pts.map((p) => ({ x: p.step, y: p.val_loss })) }] : []),
  ];
  const last = pts[pts.length - 1];
  return (
    <div className="col" style={{ gap: 10 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        Alternating least squares takes turns: fix the films' taste vectors and solve the best vector for every viewer, then fix the viewers and solve for every film.
        Each round the guessed star ratings get closer — <b>RMSE</b> is how many stars off they are. If the held-out line flattens while the training line keeps falling, more rounds won't help (and more factors may start memorising).
      </p>
      <LineChart series={series} height={240} xLabel={curve.x_label} yLabel="RMSE (stars)" />
      {last && <span className="tiny faint num">After {last.step} rounds: {last.train_loss?.toFixed(3)} stars off on training ratings{last.val_loss != null ? ` · ${last.val_loss.toFixed(3)} on held-out ratings` : ""}.</span>}
    </div>
  );
}
