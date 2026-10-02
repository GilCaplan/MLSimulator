import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { spring } from "../../design/motion";
import { ramp, withAlpha } from "../../lib/colors";
import { fmt, pct } from "../../lib/format";
import type { AssignResponse, SavedModel } from "../../lib/types";
import { extent } from "../charts";
import { InfoTip, Spinner } from "../glass";
import { describeCluster } from "../train/unsup/ClusterViews";
import { MapCanvas, clusterColor, clusterName, truthColor, truthLabels, type MapPoint } from "../train/unsup/mapKit";
import { Swap } from "./shared";

const RED = "#FF375F";

/** The training map behind the "you are here" dot (clusters / map / anomaly points saved with the model). */
function useMapPoints(model: SavedModel): { points: MapPoint[]; raw: { x: number; y: number; truth?: string }[] } {
  const d = model.detail ?? {};
  return useMemo(() => {
    const task = model.task as string;
    if (task === "clustering" && d.clusters) {
      return { raw: d.clusters.points, points: d.clusters.points.map((p) => ({ x: p.x, y: p.y, r: 2.4, color: clusterColor(p.c), opacity: 0.45 })) };
    }
    if (task === "anomaly" && d.anomaly) {
      const [lo, hi] = extent(d.anomaly.points.map((p) => p.score));
      return { raw: d.anomaly.points, points: d.anomaly.points.map((p) => ({ x: p.x, y: p.y, r: 2.2, color: ramp((p.score - lo) / (hi - lo || 1)), opacity: 0.45 })) };
    }
    if (d.reduction) {
      const labels = truthLabels(d.reduction.points);
      return { raw: d.reduction.points, points: d.reduction.points.map((p) => ({ x: p.x, y: p.y, r: 2.4, color: labels ? truthColor(p.truth, labels) : "#5E5CE6", opacity: 0.45 })) };
    }
    return { raw: [], points: [] };
  }, [model.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Majority hidden-truth label among the 12 nearest map points. */
function neighbours(raw: { x: number; y: number; truth?: string }[], at: number[] | undefined) {
  if (!at || !raw.length || raw[0].truth === undefined) return null;
  const near = raw.map((p) => ({ t: String(p.truth), d: (p.x - at[0]) ** 2 + (p.y - at[1]) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 12);
  const counts: Record<string, number> = {};
  for (const n of near) counts[n.t] = (counts[n.t] ?? 0) + 1;
  const [label, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { label, n, of: near.length };
}

/** The answer side of the playground for unsupervised models: which group, how unusual, where on the map. */
export function AssignPanel({ model, result, busy }: { model: SavedModel; result: AssignResponse | null; busy: boolean }) {
  const task = model.task as string;
  const { points, raw } = useMapPoints(model);
  const labels = useMemo(() => truthLabels(raw), [raw]);

  if (!result) {
    return (
      <div className="col center" style={{ minHeight: 280, gap: 14, textAlign: "center" }}>
        <motion.div animate={{ scale: [1, 1.12, 1], rotate: [0, 8, -8, 0] }} transition={{ repeat: Infinity, duration: 2.2 }} style={{ fontSize: 40 }}>🧭</motion.div>
        <div className="row" style={{ gap: 8 }}><Spinner size={15} color="var(--accent)" /><b>Warming up the model…</b></div>
        <span className="small muted" style={{ maxWidth: 260 }}>The first answer takes a moment while the model loads into memory.</span>
      </div>
    );
  }

  const at = result.coords?.[0];
  const near = neighbours(raw, at);
  const tsne = model.model_id === "tsne";
  const header = (
    <div className="row between">
      <span className="eyebrow">{task === "clustering" ? "This row belongs to" : task === "anomaly" ? "The verdict" : "On the map"}</span>
      <AnimatePresence>
        {busy && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="row tiny faint" style={{ gap: 6 }}>
            <Spinner size={11} /> updating
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );

  let pulse: { x: number; y: number; color: string; label?: string } | null = null;
  let body: React.ReactNode = null;

  if (task === "clustering") {
    const c = result.cluster?.[0] ?? -1;
    const col = clusterColor(c);
    const profile = model.detail?.clusters?.profiles?.find((p) => p.cluster === c);
    const dist = result.distances?.[0] ?? [];
    const ids = result.center_ids ?? dist.map((_, i) => i);
    const order = dist.map((d, i) => ({ d, id: ids[i] })).sort((a, b) => a.d - b.d);
    const maxD = Math.max(...dist, 1e-6);
    if (at) pulse = { x: at[0], y: at[1], color: col, label: "you" };
    body = (
      <>
        <div className="col center" style={{ gap: 6, textAlign: "center" }}>
          <Swap k={String(c)}>
            <div className="row" style={{ gap: 12, justifyContent: "center" }}>
              <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2 }} style={{ width: 22, height: 22, borderRadius: 11, background: col, boxShadow: `0 0 0 6px ${withAlpha(col, 0.22)}` }} />
              <span style={{ fontSize: 40, fontWeight: 760, letterSpacing: "-0.035em", color: col, textShadow: `0 6px 28px ${withAlpha(col, 0.35)}` }}>{clusterName(c)}</span>
            </div>
          </Swap>
          <span className="small muted" style={{ maxWidth: 320, lineHeight: 1.5 }}>
            {c < 0 ? "It sits in a sparse area — too far from every dense group to join one." : profile ? <>Members of this group: <b style={{ color: "var(--text)" }}>{describeCluster(profile.top).replace(/\.$/, "").toLowerCase()}</b>.</> : "The group whose centre is nearest."}
          </span>
        </div>
        {order.length > 0 && (
          <div className="inset" style={{ padding: 14 }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <span className="small row" style={{ fontWeight: 600, gap: 6 }}>Distance to each group's centre <InfoTip text="Measured in the prepared (scaled) feature space. A row joins the group whose centre is closest — shorter bar = closer." /></span>
              <span className="tiny faint">shorter = closer</span>
            </div>
            <div className="col" style={{ gap: 7 }}>
              {order.map((o, i) => (
                <motion.div key={o.id} layout transition={spring.gentle} className="row" style={{ gap: 10 }}>
                  <span className="row small" style={{ width: 92, gap: 6, fontWeight: i === 0 ? 700 : 500 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: clusterColor(o.id) }} />{clusterName(o.id)}
                  </span>
                  <div className="grow" style={{ height: 10, borderRadius: 5, background: "var(--fill)", overflow: "hidden" }}>
                    <motion.div animate={{ width: `${Math.max(3, (o.d / maxD) * 100)}%` }} transition={spring.gentle}
                      style={{ height: "100%", borderRadius: 5, background: clusterColor(o.id), opacity: i === 0 ? 1 : 0.45 }} />
                  </div>
                  <span className="num tiny" style={{ width: 92, textAlign: "right", whiteSpace: "nowrap", color: i === 0 ? "var(--text)" : "var(--text-3)", fontWeight: i === 0 ? 700 : 400 }}>
                    {fmt(o.d, 2)}{i === 0 ? " ← closest" : ""}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  } else if (task === "anomaly") {
    const s = result.score?.[0] ?? 0;
    const thr = result.threshold ?? model.detail?.anomaly?.threshold ?? 0;
    const flagged = (result.anomaly?.[0] ?? 0) === 1;
    const hist = model.detail?.anomaly?.hist;
    const lo = Math.min(hist?.edges[0] ?? s, s), hi = Math.max(hist?.edges[hist.edges.length - 1] ?? s, s);
    const t = (s - lo) / (hi - lo || 1), tt = (thr - lo) / (hi - lo || 1);
    let below = 0, total = 0;
    hist?.counts.forEach((c, i) => { total += c; const mid = (hist.edges[i] + hist.edges[i + 1]) / 2; if (mid < s) below += c; });
    const col = flagged ? RED : "var(--success)";
    if (at) pulse = { x: at[0], y: at[1], color: flagged ? RED : "#30D158", label: "you" };
    body = (
      <>
        <div className="col center" style={{ gap: 4, textAlign: "center" }}>
          <Swap k={flagged ? "a" : "n"}>
            <div style={{ fontSize: 38, fontWeight: 760, letterSpacing: "-0.035em", color: col, lineHeight: 1.15 }}>{flagged ? "⚑ Unusual!" : "✓ Looks normal"}</div>
          </Swap>
          <span className="small muted">
            Score <b className="num" style={{ color: "var(--text)" }}>{fmt(s, 3)}</b>{total ? (below / total >= 0.5
              ? <> · stranger than <b style={{ color: "var(--text)" }}>{pct(below / total, 0)}</b> of the training rows</>
              : <> · more typical than <b style={{ color: "var(--text)" }}>{pct(1 - below / total, 0)}</b> of the training rows</>) : null}
          </span>
        </div>
        <div className="inset" style={{ padding: "16px 16px 12px" }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="small" style={{ fontWeight: 600 }}>Normal ↔ unusual</span>
            <InfoTip text="The track spans the scores of the training rows. Anything past the red line (the model's threshold) is flagged as an anomaly." />
          </div>
          <div style={{ position: "relative", height: 14, borderRadius: 7, background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.4)}, ${ramp(0.75)}, ${ramp(1)})`, opacity: 0.9 }}>
            <div style={{ position: "absolute", left: `${Math.max(0, Math.min(1, tt)) * 100}%`, top: -7, bottom: -7, width: 3, marginLeft: -1.5, borderRadius: 2, background: RED }} />
            <motion.div animate={{ left: `${Math.max(0, Math.min(1, t)) * 100}%` }} transition={spring.snappy}
              style={{ position: "absolute", top: "50%", width: 24, height: 24, marginLeft: -12, marginTop: -12, borderRadius: 12, background: "white", boxShadow: "0 2px 10px rgba(0,0,0,0.3)", border: `3px solid ${flagged ? RED : "#30D158"}` }} />
          </div>
          <div className="row between tiny faint num" style={{ marginTop: 8 }}>
            <span>typical</span>
            <span style={{ color: RED }}>threshold {fmt(thr, 3)}</span>
            <span>very unusual</span>
          </div>
        </div>
      </>
    );
  } else {
    if (at && !tsne) pulse = { x: at[0], y: at[1], color: "#BF5AF2", label: "you" };
    body = tsne ? (
      <div className="inset row" style={{ gap: 10, padding: "12px 14px", alignItems: "flex-start" }}>
        <span style={{ fontSize: 20 }}>🗺️</span>
        <span className="small" style={{ lineHeight: 1.55 }}>
          <b>t-SNE can't place new rows.</b> <span className="muted">It arranges the training rows all at once and has no formula for a newcomer — to map new data you'd re-run it. PCA can: it's just a fixed rotation of your columns.</span>
        </span>
      </div>
    ) : (
      <div className="col center" style={{ gap: 4, textAlign: "center" }}>
        <span className="small muted">This row lands at</span>
        <Swap k={at ? `${at[0].toFixed(1)},${at[1].toFixed(1)}` : "-"}>
          <div className="num" style={{ fontSize: 30, fontWeight: 740, letterSpacing: "-0.03em" }}>({at ? fmt(at[0], 2) : "—"}, {at ? fmt(at[1], 2) : "—"})</div>
        </Swap>
        <span className="tiny faint">first two PCA directions</span>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {header}
      {body}
      {points.length > 0 && !(tsne && task === "reduction") && (
        <div className="col" style={{ gap: 6 }}>
          <MapCanvas points={points} pulse={pulse} height={210} caption="training rows · 2-D map" />
          {near && labels && (
            <span className="tiny muted row" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: truthColor(near.label, labels) }} />
              Its nearest neighbours on the map are mostly <b style={{ color: "var(--text)" }}>“{near.label}”</b> ({near.n} of {near.of}, hidden truth)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
