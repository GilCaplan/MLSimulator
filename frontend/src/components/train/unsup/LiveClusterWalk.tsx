import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import { fmt } from "../../../lib/format";
import type { LiveModel } from "../../../lib/store";
import { Sparkline, extent } from "../../charts";
import { InfoTip } from "../../glass";
import { setReplayEnd } from "../util";
import { MapCanvas, clusterColor, type MapCentre } from "./mapKit";

const PACE = 560;
const FAST = 170;

/**
 * "K-means walking": the live 2-D sample coloured by the current step's groups, with the centres gliding step by step and
 * an inertia sparkline. Steps often arrive faster than the eye can follow, so they're replayed at a watchable pace.
 */
export function LiveClusterWalk({ m, height = 200 }: { m: LiveModel; height?: number }) {
  const pts = m.clusterPoints ?? [];
  const steps = m.clusterSteps ?? [];
  const [idx, setIdx] = useState(-1);
  const gmm = m.model_id === "gmm";

  useEffect(() => {
    const backlog = steps.length - 1 - idx;
    if (backlog <= 0) {
      if (m.state === "done" || m.state === "failed") setReplayEnd(m.key, null);
      return;
    }
    const pace = backlog > 6 ? FAST : PACE;
    setReplayEnd(m.key, Date.now() + backlog * pace + 400);
    const t = setTimeout(() => setIdx((i) => i + 1), idx < 0 ? 700 : pace);
    return () => clearTimeout(t);
  }, [idx, steps.length, m.state, m.key]);
  useEffect(() => () => setReplayEnd(m.key, null), [m.key]);

  const domain = useMemo(() => {
    const [x0, x1] = extent(pts.map((p) => p[0])), [y0, y1] = extent(pts.map((p) => p[1]));
    const px = (x1 - x0) * 0.1, py = (y1 - y0) * 0.12;
    return { x: [x0 - px, x1 + px] as [number, number], y: [y0 - py, y1 + py] as [number, number] };
  }, [pts]);

  const step = idx >= 0 ? steps[idx] : null;
  const points = pts.map((p, i) => ({ x: p[0], y: p[1], r: 2.6, color: step ? clusterColor(step.labels[i] ?? -1) : "var(--text-3)", opacity: step ? 0.82 : 0.45 }));
  const centres: MapCentre[] = (step?.centroids_2d ?? []).map((c, i) => ({ id: i, x: c[0], y: c[1], color: clusterColor(i), label: String(i + 1) }));
  const trails = useMemo(() => {
    const t: Record<number, [number, number][]> = {};
    steps.slice(0, idx + 1).forEach((s) => s.centroids_2d.forEach((c, i) => { (t[i] ??= []).push([c[0], c[1]]); }));
    return t;
  }, [steps, idx]);
  const inertia = steps.slice(0, idx + 1).map((s) => s.inertia);
  const settled = idx >= 0 && idx === steps.length - 1 && (m.state === "done" || m.state === "evaluating");

  const phase = !step
    ? gmm ? "Placing starting bubbles…" : "Dropping starting centres…"
    : settled
      ? `✓ Settled after ${steps.length} step${steps.length === 1 ? "" : "s"} — the ${gmm ? "bubbles" : "centres"} stopped moving.`
      : idx === 0
        ? gmm ? "Step 1 · each point leans towards its likeliest bubble" : "Step 1 · every point joins its nearest centre"
        : gmm ? `Step ${idx + 1} · bubbles shift and stretch to fit their points` : `Step ${idx + 1} · centres walk to the middle of their group`;

  return (
    <div className="col" style={{ gap: 8 }}>
      <MapCanvas points={points} centres={centres} trails={trails} domain={domain} height={height}
        caption={pts.length ? `${pts.length} sample rows · 2-D view` : undefined}
        overlay={!pts.length ? <div className="col center tiny faint" style={{ position: "absolute", inset: 0 }}>Waiting for the data…</div> : undefined} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
          className="small" style={{ fontWeight: 560, color: settled ? "var(--success)" : "var(--text-2)" }}>
          {phase}
        </motion.span>
      </AnimatePresence>
      {inertia.length > 0 && (
        <div className="inset row between" style={{ padding: "6px 10px", gap: 10 }}>
          <span className="col" style={{ gap: 0 }}>
            <span className="row tiny faint" style={{ gap: 4 }}>
              {gmm ? "Misfit" : "Inertia"} ↓
              <InfoTip text={gmm
                ? "How badly the bubbles explain the points (negative log-likelihood). Each step should make it smaller — when it stops changing, the model is done."
                : "Total squared distance from every point to its centre. Each step can only make it smaller — when it stops dropping, k-means has converged."} />
            </span>
            <b className="num small">{fmt(inertia[inertia.length - 1], 4)}</b>
          </span>
          <Sparkline values={inertia} width={130} height={30} color="var(--accent-2)" />
        </div>
      )}
    </div>
  );
}

/** The k-means / GMM loop in three plain steps, with the active one gently cycling (shown beside the live walk). */
export function WalkExplainer({ gmm }: { gmm: boolean }) {
  const [on, setOn] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setOn((i) => (i + 1) % 3), 1700);
    return () => clearInterval(t);
  }, []);
  const steps = gmm
    ? [["🫧", "Lean", "each point gets a chance of belonging to every bubble"], ["🎈", "Reshape", "each bubble moves and stretches to fit the points leaning on it"], ["🔁", "Repeat", "until the fit stops improving"]]
    : [["🧲", "Join", "every point joins its nearest centre"], ["🚶", "Move", "each centre walks to the middle of its points"], ["🔁", "Repeat", "until no centre moves any more"]];
  return (
    <div className="col" style={{ gap: 8, paddingTop: 2 }}>
      <span className="eyebrow">How {gmm ? "a Gaussian Mixture" : "k-means"} works</span>
      {steps.map(([icon, title, text], i) => (
        <motion.div key={title} animate={{ opacity: on === i ? 1 : 0.55, x: on === i ? 4 : 0 }} transition={spring.gentle}
          className="inset row" style={{ gap: 10, padding: "8px 10px", alignItems: "flex-start", borderColor: on === i ? "var(--accent)" : undefined }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span className="small" style={{ lineHeight: 1.45 }}><b>{title}</b> <span className="muted">— {text}</span></span>
        </motion.div>
      ))}
    </div>
  );
}
