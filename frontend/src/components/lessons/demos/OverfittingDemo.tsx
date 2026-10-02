import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Slider } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, clamp, gauss, rng, useDone } from "./shared";

const MAX_DEG = 15;
const truth = (x: number) => 0.95 * Math.sin(2 * Math.PI * 0.85 * x) + 0.5 * x - 0.2;
const YD: [number, number] = [-2, 2];
const SAMPLES = Array.from({ length: 161 }, (_, i) => i / 160);

function makeData() {
  const r = rng(31);
  const N = 16;
  const train = Array.from({ length: N }, (_, i) => { const x = 0.03 + (0.94 * (i + 0.5 + 0.7 * (r() - 0.5))) / N; return { x, y: truth(x) + 0.24 * gauss(r) }; });
  const test = Array.from({ length: 70 }, () => { const x = 0.02 + 0.96 * r(); return { x, y: truth(x) + 0.24 * gauss(r) }; });
  return { train, test };
}

/** Chebyshev features T_0..T_d at t = 2x − 1 (much better conditioned than raw powers). */
function cheb(x: number, d: number) {
  const t = 2 * x - 1;
  const out = [1, t];
  for (let k = 2; k <= d; k++) out.push(2 * t * out[k - 1] - out[k - 2]);
  return out.slice(0, d + 1);
}

/** Least squares with a whisper of ridge (for numerical stability), solved by Gaussian elimination. */
function fitPoly(pts: { x: number; y: number }[], d: number) {
  const n = d + 1;
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (const p of pts) {
    const f = cheb(p.x, d);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] += f[i] * f[j]; A[i][n] += f[i] * p.y; }
  }
  for (let i = 0; i < n; i++) A[i][i] += 1e-9;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let rr = c + 1; rr < n; rr++) if (Math.abs(A[rr][c]) > Math.abs(A[piv][c])) piv = rr;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let rr = 0; rr < n; rr++) {
      if (rr === c || !A[c][c]) continue;
      const k = A[rr][c] / A[c][c];
      for (let j = c; j <= n; j++) A[rr][j] -= k * A[c][j];
    }
  }
  const w = A.map((row, i) => (row[i] ? row[n] / row[i] : 0));
  return (x: number) => cheb(x, d).reduce((s, f, i) => s + f * w[i], 0);
}

const rmse = (pts: { x: number; y: number }[], f: (x: number) => number) => Math.sqrt(pts.reduce((s, p) => s + (p.y - f(p.x)) ** 2, 0) / pts.length);

export function OverfittingDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [deg, setDeg] = useState(1);
  const data = useMemo(makeData, []);

  const all = useMemo(() => {
    const out = [];
    for (let d = 1; d <= MAX_DEG; d++) {
      const f = fitPoly(data.train, d);
      out.push({ d, f, train: rmse(data.train, f), test: rmse(data.test, f), curve: SAMPLES.map(f) });
    }
    return out;
  }, [data]);

  // "Just right" = the contiguous range of degrees whose test error is within 15% of the best.
  const zones = useMemo(() => {
    let best = 0;
    all.forEach((e, i) => { if (e.test < all[best].test) best = i; });
    const thr = all[best].test * 1.15;
    let lo = best, hi = best;
    while (lo > 0 && all[lo - 1].test <= thr) lo--;
    while (hi < all.length - 1 && all[hi + 1].test <= thr) hi++;
    return { lo: lo + 1, hi: hi + 1, best: best + 1 };
  }, [all]);

  const cur = all[deg - 1];
  const zone = deg < zones.lo ? "under" : deg > zones.hi ? "over" : "right";
  const zoneInfo = {
    under: { label: "Underfitting", color: C.warn },
    right: { label: "Just right", color: C.ok },
    over: { label: "Overfitting", color: C.pos },
  }[zone];

  const caption =
    zone === "under" ? <>Degree {deg} is too simple: it can't bend enough to follow the wave, so it misses training <i>and</i> new points alike — <b>underfitting</b>.</>
      : zone === "right" ? <>Degree {deg} captures the real wave and shrugs off the noise: training and test error are both low. <b>Just right.</b></>
        : <>Degree {deg} contorts itself through the training dots (train error <b>{cur.train.toFixed(2)}</b>) but swings wildly between them — on new points it's off by <b>{cur.test > 9.9 ? "a mile" : cur.test.toFixed(2)}</b>. <b>Overfitting.</b></>;

  const [wrapRef, { width: wrapW }] = useSize<HTMLDivElement>();
  const side = wrapW > 720;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 18, width: "100%" }}>
          <div style={{ flex: "1 1 280px", maxWidth: 480 }}>
            <Slider label="Model complexity (polynomial degree)" help="How many times the curve is allowed to bend. Degree 1 is a straight line." value={deg} min={1} max={MAX_DEG} integer
              onChange={(v) => { setDeg(v); if (v !== 1) done(); }} format={(v) => String(Math.round(v))} />
          </div>
          <motion.span key={zone} className="badge" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}
            style={{ background: `${zoneInfo.color}22`, color: zoneInfo.color, fontSize: 13, padding: "5px 12px", fontWeight: 700 }}>
            {zoneInfo.label}
          </motion.span>
        </div>
      }
      stats={
        <>
          <Stat label="Training error" value={cur.train} format={(v) => v.toFixed(2)} color={C.neg} sub="on the dots it learned from" />
          <Stat label="Test error" value={Math.min(cur.test, 99)} format={(v) => (v >= 99 ? "99+" : v.toFixed(2))} color={zone === "over" ? C.pos : C.indigo} sub="on new, unseen dots" emphasis={zone === "over"} />
          <Stat label="Gap (test − train)" value={Math.min(cur.test - cur.train, 99)} format={(v) => (v >= 99 ? "99+" : v.toFixed(2))} sub="big gap = memorising" />
        </>
      }
      caption={caption}
      captionKey={zone}
    >
      <div ref={wrapRef} style={{ display: "grid", gridTemplateColumns: side ? "1.6fr 1fr" : "1fr", gap: 12 }}>
        <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
          <div className="row wrap between small" style={{ gap: 8 }}>
            <b>The model's curve</b>
            <Legend items={[{ color: C.neg, label: "Training dots" }, { color: "var(--text-3)", label: "New (test) dots", shape: "ring" }, { color: C.purple, label: "Model", shape: "line" }, { color: "var(--text-3)", label: "True pattern", shape: "dash" }]} />
          </div>
          <FitPlot train={data.train} test={data.test} curve={cur.curve} />
        </div>
        <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
          <div className="row between small"><b>Error vs complexity</b></div>
          <UCurve all={all} deg={deg} zones={zones} />
        </div>
      </div>
    </DemoFrame>
  );
}

function FitPlot({ train, test, curve }: { train: { x: number; y: number }[]; test: { x: number; y: number }[]; curve: number[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 270;
  const sx = (x: number) => 8 + x * (width - 16);
  const sy = (y: number) => height - 8 - ((y - YD[0]) / (YD[1] - YD[0])) * (height - 16);
  const path = (ys: number[]) => ys.map((y, i) => `${i ? "L" : "M"}${sx(SAMPLES[i]).toFixed(1)},${sy(clamp(y, YD[0] - 1.5, YD[1] + 1.5)).toFixed(1)}`).join("");
  const truthD = useMemo(() => (width ? path(SAMPLES.map(truth)) : ""), [width]);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          <defs><clipPath id="mlp-ovf-clip"><rect width={width} height={height} rx={10} /></clipPath></defs>
          <line x1={0} x2={width} y1={sy(0)} y2={sy(0)} stroke="var(--hairline)" />
          <path d={truthD} fill="none" stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="5 5" />
          {test.map((p, i) => <circle key={`t${i}`} cx={sx(p.x)} cy={sy(p.y)} r={3.2} fill="none" stroke="var(--text-3)" strokeWidth={1.1} />)}
          <g clipPath="url(#mlp-ovf-clip)">
            <motion.path initial={false} animate={{ d: path(curve) }} transition={{ type: "spring", stiffness: 120, damping: 20 }}
              fill="none" stroke={C.purple} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 6px ${C.purple}55)` }} />
          </g>
          {train.map((p, i) => <circle key={`r${i}`} cx={sx(p.x)} cy={sy(p.y)} r={4.6} fill={C.neg} stroke="var(--bg)" strokeWidth={1.2} />)}
        </svg>
      )}
    </div>
  );
}

function UCurve({ all, deg, zones }: { all: { d: number; train: number; test: number }[]; deg: number; zones: { lo: number; hi: number } }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 222;
  const m = { l: 30, r: 10, t: 22, b: 30 };
  // Log-scale error axis so both the gentle dip and the explosion fit on one chart.
  const yMax = 3, yMin = 0.02;
  const L = (v: number) => Math.log10(clamp(v, yMin, yMax));
  const sx = (d: number) => m.l + ((d - 1) / (MAX_DEG - 1)) * (width - m.l - m.r);
  const sy = (v: number) => height - m.b - ((L(v) - L(yMin)) / (L(yMax) - L(yMin))) * (height - m.t - m.b);
  const line = (key: "train" | "test") => all.map((e, i) => `${i ? "L" : "M"}${sx(e.d).toFixed(1)},${sy(e[key]).toFixed(1)}`).join("");
  const cur = all[deg - 1];
  const bands = [
    { from: 0.5, to: zones.lo - 0.5, label: "underfitting", color: C.warn },
    { from: zones.lo - 0.5, to: zones.hi + 0.5, label: "just right", color: C.ok },
    { from: zones.hi + 0.5, to: MAX_DEG + 0.5, label: "overfitting", color: C.pos },
  ];
  const bx = (d: number) => clamp(sx(d), m.l, width - m.r);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          {bands.map((b) => b.to > b.from && (
            <g key={b.label}>
              <rect x={bx(b.from)} y={m.t} width={Math.max(0, bx(b.to) - bx(b.from))} height={height - m.t - m.b} fill={b.color} opacity={0.09} />
              <text x={(bx(b.from) + bx(b.to)) / 2} y={m.t - 7} textAnchor="middle" fontSize={9.5} fontWeight={650} fill={b.color}>{bx(b.to) - bx(b.from) > 46 ? b.label : ""}</text>
            </g>
          ))}
          <path d={line("train")} fill="none" stroke={C.neg} strokeWidth={2.2} strokeLinejoin="round" />
          <path d={line("test")} fill="none" stroke={C.pos} strokeWidth={2.2} strokeLinejoin="round" />
          {all.filter((e) => e.test > yMax).slice(0, 1).map((e) => (
            <text key="cap" x={width - m.r - 2} y={m.t + 11} textAnchor="end" fontSize={9.5} fill={C.pos}>↑ off the chart</text>
          ))}
          {[1, 5, 10, 15].map((d) => <text key={d} x={sx(d)} y={height - m.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{d}</text>)}
          <text x={(m.l + width - m.r) / 2} y={height - 3} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">complexity (degree)</text>
          <text transform={`translate(11 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">error (log scale)</text>
          <motion.line initial={false} animate={{ x1: sx(deg), x2: sx(deg) }} transition={spring.snappy} y1={m.t} y2={height - m.b} stroke="var(--text-3)" strokeDasharray="3 3" />
          <motion.circle initial={false} animate={{ cx: sx(deg), cy: sy(cur.train) }} transition={spring.snappy} r={5} fill={C.neg} stroke="var(--bg)" strokeWidth={1.5} />
          <motion.circle initial={false} animate={{ cx: sx(deg), cy: sy(cur.test) }} transition={spring.snappy} r={5.5} fill={C.pos} stroke="var(--bg)" strokeWidth={1.5} />
          <g fontSize={10} fontWeight={600}>
            <text x={width - m.r} y={sy(all[MAX_DEG - 1].train) - 6} textAnchor="end" fill={C.neg}>train</text>
            <text x={sx(Math.min(MAX_DEG - 1, zones.hi + 1)) - 8} y={sy(all[Math.min(MAX_DEG - 1, zones.hi)].test) - 2} textAnchor="end" fill={C.pos}>test</text>
          </g>
        </svg>
      )}
    </div>
  );
}
