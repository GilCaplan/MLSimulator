import { useMemo, useState } from "react";
import { Slider, Toggle } from "../../glass";
import { Gauge, useSize } from "../../charts";
import { motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, MiniConfusion, Stat, clipLine, gauss, rng, useDone } from "./shared";

interface Tx { id: string; x: number; y: number; fraud: boolean; synthetic?: boolean }
const TOTAL = 200;
const DX: [number, number] = [-2.8, 3.8];
const DY: [number, number] = [-2.6, 3.6];

// Fixed pools so moving the slider swaps dots in and out instead of reshuffling everything.
function pools() {
  const r = rng(5);
  const legit: Tx[] = [], fraud: Tx[] = [];
  for (let i = 0; i < TOTAL; i++) legit.push({ id: `l${i}`, x: 0.85 * gauss(r) - 0.3, y: 0.8 * gauss(r) - 0.2, fraud: false });
  for (let i = 0; i < TOTAL; i++) fraud.push({ id: `f${i}`, x: 1.25 + 0.8 * gauss(r), y: 1.05 + 0.8 * gauss(r), fraud: true });
  return { legit, fraud };
}

/** SMOTE: new rare-class points on the line between a rare point and one of its nearest rare neighbours. */
function smote(fraud: Tx[], target: number, seed: number): Tx[] {
  const r = rng(seed);
  const out: Tx[] = [];
  if (!fraud.length) return out;
  for (let i = 0; i < target; i++) {
    const a = fraud[i % fraud.length];
    let b = a;
    if (fraud.length > 1) {
      const near = fraud.filter((f) => f !== a).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y)).slice(0, 3);
      b = near[Math.floor(r() * near.length)];
    }
    const t = fraud.length > 1 ? r() : 0;
    const jitter = fraud.length > 1 ? 0.07 : 0.2;
    out.push({ id: `s${i}`, x: a.x + t * (b.x - a.x) + jitter * gauss(r), y: a.y + t * (b.y - a.y) + jitter * gauss(r), fraud: true, synthetic: true });
  }
  return out;
}

/** Plain logistic regression by gradient descent (2 features + bias). */
function logistic(pts: Tx[]) {
  let w0 = 0, w1 = 0, w2 = 0;
  const lr = 0.4;
  for (let it = 0; it < 400; it++) {
    let g0 = 0, g1 = 0, g2 = 0;
    for (const p of pts) {
      const z = w0 + w1 * p.x + w2 * p.y;
      const e = 1 / (1 + Math.exp(-z)) - (p.fraud ? 1 : 0);
      g0 += e; g1 += e * p.x; g2 += e * p.y;
    }
    w0 -= (lr * g0) / pts.length; w1 -= (lr * g1) / pts.length; w2 -= (lr * g2) / pts.length;
  }
  return { w0, w1, w2 };
}

export function ImbalanceDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [rate, setRate] = useState(2);
  const [useSmote, setUseSmote] = useState(false);
  const pool = useMemo(pools, []);

  const nFraud = Math.max(1, Math.round((TOTAL * rate) / 100));
  const real = useMemo(() => [...pool.legit.slice(0, TOTAL - nFraud), ...pool.fraud.slice(0, nFraud)], [pool, nFraud]);
  const fraudPts = useMemo(() => real.filter((p) => p.fraud), [real]);
  const synth = useMemo(() => (useSmote ? smote(fraudPts, Math.min(90, Math.max(0, TOTAL - 2 * nFraud)), 9) : []), [useSmote, fraudPts, nFraud]);
  const model = useMemo(() => (useSmote ? logistic([...real, ...synth]) : null), [useSmote, real, synth]);

  // Evaluate on the REAL transactions only — the test set is never rebalanced.
  const m = useMemo(() => {
    let tp = 0, fn = 0, fp = 0, tn = 0;
    for (const p of real) {
      const flag = model ? model.w0 + model.w1 * p.x + model.w2 * p.y > 0 : false;
      if (p.fraud) flag ? tp++ : fn++;
      else flag ? fp++ : tn++;
    }
    return { tp, fn, fp, tn, acc: (tp + tn) / TOTAL, recall: tp / Math.max(1, tp + fn), precision: tp + fp ? tp / (tp + fp) : 0 };
  }, [real, model]);

  const caption = !useSmote
    ? rate >= 25
      ? <>With {Math.round(rate)}% fraud, saying "legit" every time only scores <b>{Math.round(m.acc * 100)}%</b> — accuracy looked great before simply because fraud was rare.</>
      : <>Only <b>{nFraud} of {TOTAL}</b> transactions are fraud. A model that always says "legit" scores <b>{Math.round(m.acc * 100)}% accuracy</b> — and catches <b>zero</b> frauds.</>
    : <>SMOTE added <b>{synth.length}</b> synthetic frauds (ringed) between real ones. Trained on that, the model catches <b>{Math.round(m.recall * 100)}%</b> of real fraud, though only <b>{Math.round(m.precision * 100)}%</b> of its alarms are real.</>;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 24, rowGap: 12, width: "100%" }}>
          <div style={{ flex: "1 1 260px", maxWidth: 420 }}>
            <Slider label="Fraud rate" value={rate} min={0.5} max={50} log onChange={(v) => { setRate(v); done(); }} format={(v) => `${v < 10 ? v.toFixed(1) : Math.round(v)}%`} />
          </div>
          <Toggle label="Rebalance with SMOTE" checked={useSmote} onChange={(v) => { setUseSmote(v); done(); }}
            help="SMOTE creates new training examples of the rare class on the line between two real ones. Only the training rows change — we still score on the real transactions." />
        </div>
      }
      caption={caption}
      captionKey={`${useSmote}-${!useSmote && rate >= 25}`}
    >
      <ImbalanceBody real={real} synth={synth} model={model} m={m} useSmote={useSmote} />
    </DemoFrame>
  );
}

function ImbalanceBody({ real, synth, model, m, useSmote }: {
  real: Tx[]; synth: Tx[]; model: { w0: number; w1: number; w2: number } | null;
  m: { tp: number; fn: number; fp: number; tn: number; acc: number; recall: number; precision: number }; useSmote: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const side = width > 720;
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: side ? "1.25fr 1fr" : "1fr", gap: 12 }}>
      <div className="inset col" style={{ padding: 12, gap: 8, minWidth: 0 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <b>{useSmote ? "Model trained on SMOTE-balanced data" : "Model: always says “legit”"}</b>
          <Legend items={[{ color: "#8E8E93", label: "Legit" }, { color: C.pos, label: "Fraud" }, ...(useSmote ? [{ color: C.pos, label: "Synthetic", shape: "ring" as const }] : [])]} />
        </div>
        <TxPlot real={real} synth={synth} model={model} />
      </div>
      <div className="col" style={{ gap: 10 }}>
        <div className="inset row" style={{ padding: "10px 6px 4px", justifyContent: "space-around", flexWrap: "wrap" }}>
          <Gauge value={m.acc} label="Accuracy" color={C.indigo} size={side ? 150 : 160} />
          <Gauge value={m.recall} label="Recall · fraud caught" color={m.recall > 0.5 ? C.ok : C.pos} size={side ? 150 : 160} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 10 }}>
          <Stat label="Precision" value={m.precision} sub="alarms that are real" color={useSmote ? C.warn : "var(--text-3)"} format={(v) => (useSmote ? `${Math.round(v * 100)}%` : "—")} />
          <div className="inset" style={{ padding: 10 }}>
            <MiniConfusion tp={m.tp} fn={m.fn} fp={m.fp} tn={m.tn} posLabel="fraud" negLabel="legit" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TxPlot({ real, synth, model }: { real: Tx[]; synth: Tx[]; model: { w0: number; w1: number; w2: number } | null }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 270;
  const sx = (v: number) => ((v - DX[0]) / (DX[1] - DX[0])) * width;
  const sy = (v: number) => height - ((v - DY[0]) / (DY[1] - DY[0])) * height;
  // Decision boundary w0 + w1 x + w2 y = 0  →  y = -(w0 + w1 x) / w2
  const seg = model && Math.abs(model.w2) > 1e-9 ? clipLine(-model.w0 / model.w2, -model.w1 / model.w2, DX[0], DX[1], DY[0], DY[1]) : null;
  // Polygon of the "flagged" side: corners of the box on the positive side + the boundary segment.
  let flagged = "";
  if (model && seg) {
    const corners: [number, number][] = [[DX[0], DY[0]], [DX[1], DY[0]], [DX[1], DY[1]], [DX[0], DY[1]]];
    const pts: [number, number][] = [[seg.x1, seg.y1], [seg.x2, seg.y2], ...corners.filter(([x, y]) => model.w0 + model.w1 * x + model.w2 * y > 0)];
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    pts.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    flagged = pts.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  }
  const all = [...real, ...synth];
  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative", borderRadius: 12, overflow: "hidden" }}>
      {width > 0 && (
        <svg width={width} height={height}>
          <style>{`.mlp-tx{transition:transform .7s cubic-bezier(.32,.72,0,1), opacity .4s}.mlp-txpop{animation:mlpTxPop .55s cubic-bezier(.34,1.56,.64,1) backwards}@keyframes mlpTxPop{from{opacity:0;transform:var(--t) scale(0)}to{opacity:1;transform:var(--t) scale(1)}}`}</style>
          {model ? (
            <motion.polygon key="flag" points={flagged} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} fill={C.pos} fillOpacity={0.1} />
          ) : (
            <rect width={width} height={height} fill="#8E8E93" fillOpacity={0.06} />
          )}
          {seg && (
            <motion.line initial={{ pathLength: 0 }} animate={{ pathLength: 1, x1: sx(seg.x1), y1: sy(seg.y1), x2: sx(seg.x2), y2: sy(seg.y2) }} transition={spring.gentle}
              stroke={C.pos} strokeWidth={2} strokeDasharray="6 4" opacity={0.8} />
          )}
          <text x={10} y={18} fontSize={11} fill="var(--text-3)">{model ? "" : "Everything here → “legit”"}</text>
          {model && <text x={width - 10} y={18} textAnchor="end" fontSize={11} fontWeight={600} fill={C.pos}>flagged as fraud</text>}
          {all.map((p, i) => {
            const t = `translate(${sx(p.x)}px, ${sy(p.y)}px)`;
            const c = p.fraud ? C.pos : "#8E8E93";
            return (
              <g key={p.id} className={`mlp-tx ${p.synthetic || p.fraud ? "mlp-txpop" : ""}`} style={{ transform: t, ["--t" as string]: t, animationDelay: p.synthetic ? `${(i % 50) * 14}ms` : undefined }}>
                {p.synthetic && <circle r={6.4} fill="none" stroke={c} strokeWidth={1.2} opacity={0.75} />}
                <circle r={p.fraud && !p.synthetic ? 4.6 : 3.6} fill={c} fillOpacity={p.synthetic ? 0.55 : p.fraud ? 0.95 : 0.45} stroke={p.fraud && !p.synthetic ? "var(--bg)" : "none"} strokeWidth={1} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
