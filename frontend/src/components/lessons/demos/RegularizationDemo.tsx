import { AnimatePresence, motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import { Segmented, Slider } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, clamp, gauss, rng, useDone } from "./shared";

type Mode = "ridge" | "lasso";
interface Pt { x: number; y: number }

const DEG = 12;
const N_TRAIN = 14;
const A_MIN = 1e-9, A_MAX = 10;
const L_MIN = Math.log10(A_MIN), L_MAX = Math.log10(A_MAX);
const GRID = Array.from({ length: 41 }, (_, i) => 10 ** (L_MIN + (i * (L_MAX - L_MIN)) / 40));
const truth = (x: number) => 0.9 * Math.sin(2 * Math.PI * 0.8 * x) + 0.4 * x;
const YD: [number, number] = [-2, 2];
const SUP = ["¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹", "¹⁰", "¹¹", "¹²"];

const TRAIN: Pt[] = (() => {
  const r = rng(218);
  return Array.from({ length: N_TRAIN }, (_, i) => {
    const x = 0.02 + (0.96 * (i + 0.5 + 0.9 * (r() - 0.5))) / N_TRAIN;
    return { x, y: truth(x) + 0.3 * gauss(r) };
  });
})();
// Everything (plot, test dots) lives within the span of the training dots, so we judge interpolation, not extrapolation.
const X0 = TRAIN[0].x - 0.006, X1 = TRAIN[N_TRAIN - 1].x + 0.006;
const SAMPLES = Array.from({ length: 161 }, (_, i) => X0 + ((X1 - X0) * i) / 160);

function makeTest(seed: number): Pt[] {
  const r = rng(100 + seed * 7919);
  return Array.from({ length: 40 }, () => { const x = X0 + (X1 - X0) * r(); return { x, y: truth(x) + 0.3 * gauss(r) }; });
}

/** Powers t¹..t¹² of t = 2x − 1. */
function powers(x: number) {
  const t = 2 * x - 1, out: number[] = [];
  let p = 1;
  for (let k = 0; k < DEG; k++) { p *= t; out.push(p); }
  return out;
}

/** Tiny Gauss–Jordan solver with partial pivoting. */
function solve(A: number[][], b: number[]) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let q = c + 1; q < n; q++) if (Math.abs(M[q][c]) > Math.abs(M[piv][c])) piv = q;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (!M[c][c]) continue;
    for (let q = 0; q < n; q++) {
      if (q === c) continue;
      const k = M[q][c] / M[c][c];
      for (let j = c; j <= n; j++) M[q][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => (row[i] ? row[n] / row[i] : 0));
}

/**
 * Model y = ȳ + Σ wⱼ·zⱼ on standardised polynomial features zⱼ.
 * Objective: (1/2n)·RSS + α·penalty, with penalty ½‖w‖² (Ridge) or ‖w‖₁ (Lasso).
 */
function makeModel(train: Pt[]) {
  const F = train.map((p) => powers(p.x));
  const n = train.length;
  const mu = Array.from({ length: DEG }, (_, j) => F.reduce((s, f) => s + f[j], 0) / n);
  const sd = Array.from({ length: DEG }, (_, j) => Math.sqrt(F.reduce((s, f) => s + (f[j] - mu[j]) ** 2, 0) / n) || 1);
  const Z = F.map((f) => f.map((v, j) => (v - mu[j]) / sd[j]));
  const ym = train.reduce((s, p) => s + p.y, 0) / n;
  const G = Array.from({ length: DEG }, (_, i) => Array.from({ length: DEG }, (_, j) => Z.reduce((s, z) => s + z[i] * z[j], 0) / n));
  const c = Array.from({ length: DEG }, (_, j) => Z.reduce((s, z, k) => s + z[j] * (train[k].y - ym), 0) / n);

  const ridge = (a: number) => solve(G.map((row, i) => row.map((v, j) => v + (i === j ? a : 0))), c);
  /** Coordinate descent with soft-thresholding, warm-started from the Ridge solution (≈ the answer when α is tiny). */
  const lasso = (a: number) => {
    const w = ridge(a);
    for (let it = 0; it < 300; it++) {
      for (let j = 0; j < DEG; j++) {
        let rho = c[j];
        for (let k = 0; k < DEG; k++) if (k !== j) rho -= G[j][k] * w[k];
        w[j] = (Math.sign(rho) * Math.max(0, Math.abs(rho) - a)) / G[j][j];
      }
    }
    return w;
  };
  const predict = (w: number[], x: number) => { const f = powers(x); let s = ym; for (let j = 0; j < DEG; j++) s += (w[j] * (f[j] - mu[j])) / sd[j]; return s; };
  return { ridge, lasso, predict };
}

const rmse = (pts: Pt[], f: (x: number) => number) => Math.sqrt(pts.reduce((s, p) => s + (p.y - f(p.x)) ** 2, 0) / pts.length);
const SUPD = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const fmtAlpha = (v: number) => {
  if (v <= A_MIN * 1.01) return "≈ 0";
  if (v >= 0.001) return String(Number(v.toPrecision(2)));
  const e = Math.floor(Math.log10(v) + 1e-9), m = Math.round(v / 10 ** e);
  return `${m === 10 ? 1 : m}×10⁻${[...String(-(m === 10 ? e + 1 : e))].map((c) => SUPD[+c]).join("")}`;
};
const fmtErr = (v: number) => (v >= 99 ? "99+" : v.toFixed(2));

export function RegularizationDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [alpha, setAlpha] = useState(A_MIN);
  const [mode, setMode] = useState<Mode>("ridge");
  const [testSeed, setTestSeed] = useState(0);

  const train = TRAIN;
  const model = useMemo(() => makeModel(train), [train]);
  const test = useMemo(() => makeTest(testSeed), [testSeed]);

  // The whole penalty path (for the error-vs-alpha chart); weights only depend on the training dots.
  const path = useMemo(() => GRID.map((a) => (mode === "ridge" ? model.ridge(a) : model.lasso(a))), [model, mode]);
  const pathErr = useMemo(() => path.map((w, i) => {
    const f = (x: number) => model.predict(w, x);
    return { a: GRID[i], train: rmse(train, f), test: rmse(test, f) };
  }), [path, model, train, test]);

  const w = useMemo(() => (mode === "ridge" ? model.ridge(alpha) : model.lasso(alpha)), [model, mode, alpha]);
  const f = (x: number) => model.predict(w, x);
  const trainErr = rmse(train, f), testErr = rmse(test, f);
  const nonZero = w.filter((v) => v !== 0).length;
  const curve = SAMPLES.map(f);

  // Sweet spot = the contiguous range of alphas whose test error is within 15% of the best.
  const zones = useMemo(() => {
    let best = 0;
    pathErr.forEach((e, i) => { if (e.test < pathErr[best].test) best = i; });
    const thr = pathErr[best].test * 1.15;
    let lo = best, hi = best;
    while (lo > 0 && pathErr[lo - 1].test <= thr) lo--;
    while (hi < pathErr.length - 1 && pathErr[hi + 1].test <= thr) hi++;
    return { lo: GRID[lo], hi: GRID[hi], best: GRID[best] };
  }, [pathErr]);
  const zone = alpha < zones.lo / 1.15 ? "over" : alpha > zones.hi * 1.15 ? "under" : "right";
  const zoneInfo = {
    over: { label: "Overfitting", color: C.pos },
    right: { label: "Sweet spot", color: C.ok },
    under: { label: "Underfitting", color: C.warn },
  }[zone];
  const biggest = Math.max(...w.map(Math.abs));

  const caption =
    zone === "over"
      ? <>With {alpha <= A_MIN * 1.01 ? "no" : "hardly any"} penalty the 12 weights balloon (the biggest is <b>{biggest >= 10 ? Math.round(biggest).toLocaleString() : biggest.toFixed(1)}</b>) and the curve contorts itself through the training dots, then swings between them. Test error <b>{fmtErr(testErr)}</b> vs train <b>{trainErr.toFixed(2)}</b>: <b>overfitting</b>. Raise the penalty.</>
      : zone === "right"
        ? mode === "lasso"
          ? <>Lasso kept just <b>{nonZero} of 12</b> weights and set the rest to <b>exactly 0</b>. The curve follows the real trend and ignores the noise: test error is near its lowest. <b>Sweet spot.</b></>
          : <>The penalty makes every weight earn its place, so they all shrink (but none hits zero). The curve follows the real trend and ignores the noise: test error is near its lowest. <b>Sweet spot.</b> Now try Lasso.</>
        : mode === "lasso" && nonZero === 0
          ? <>The penalty is so big that Lasso dropped <b>every</b> weight: the model just predicts the average, a flat line. It misses the wave on training and test alike: <b>underfitting</b>.</>
          : <>The penalty is so strong that even the useful weights get squashed: the curve flattens and misses the wave on training and test alike. <b>Underfitting.</b></>;

  const [wrapRef, { width: wrapW }] = useSize<HTMLDivElement>();
  const side = wrapW > 720;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 18, rowGap: 12, width: "100%", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 260px", maxWidth: 420 }}>
            <Slider label="Penalty on big weights (alpha)" help="How much each unit of weight costs the model. Every notch to the right multiplies the penalty, from none at all to enormous."
              value={alpha} min={A_MIN} max={A_MAX} log format={fmtAlpha}
              onChange={(v) => { setAlpha(v); if (v > A_MIN * 1.5) done(); }} />
          </div>
          <Segmented size="sm" value={mode} onChange={(v) => { setMode(v); done(); }}
            options={[{ value: "ridge", label: "Ridge (L2)" }, { value: "lasso", label: "Lasso (L1)" }]} />
          <button className="btn sm ghost" title="Draw a fresh set of held-out test dots" onClick={() => { setTestSeed((s) => s + 1); done(); }}>🎲 New test data</button>
          <motion.span key={zone} className="badge" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}
            style={{ background: `${zoneInfo.color}22`, color: zoneInfo.color, fontSize: 13, padding: "5px 12px", fontWeight: 700, marginLeft: "auto" }}>
            {zoneInfo.label}
          </motion.span>
        </div>
      }
      stats={
        <>
          <Stat label="Training error" value={trainErr} format={(v) => v.toFixed(2)} color={C.neg} sub="on the 14 dots it learned from" />
          <Stat label="Test error" value={Math.min(testErr, 99)} format={fmtErr} color={zone === "over" ? C.pos : C.indigo} sub="on new, unseen dots" emphasis={zone === "over"} />
          <Stat label="Weights in use" value={nonZero} format={(v) => `${Math.round(v)} / ${DEG}`} color={mode === "lasso" && nonZero < DEG ? C.purple : undefined}
            sub={mode === "ridge" ? "Ridge shrinks, never zeroes" : `${DEG - nonZero} set to exactly 0`} />
        </>
      }
      caption={caption}
      captionKey={`${zone}-${mode}-${zone === "under" && mode === "lasso" && nonZero === 0}`}
    >
      <div ref={wrapRef} style={{ display: "grid", gridTemplateColumns: side ? "1.4fr 1fr" : "1fr", gap: 12 }}>
        <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
          <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
            <b>Degree-12 curve</b>
            <Legend items={[{ color: C.neg, label: "Training dots" }, { color: "var(--text-3)", label: "Test dots", shape: "ring" }, { color: C.purple, label: "Model", shape: "line" }, { color: "var(--text-3)", label: "True pattern", shape: "dash" }]} />
          </div>
          <FitPlot train={train} test={test} curve={curve} height={side ? 352 : 250} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: side ? "1fr" : "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, minWidth: 0 }}>
          <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
            <div className="row between small" style={{ gap: 8 }}><b>The 12 weights</b><span className="tiny faint">log scale</span></div>
            <WeightBars w={w} />
          </div>
          <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
            <div className="row between small" style={{ gap: 8 }}><b>Error vs penalty</b><Legend items={[{ color: C.neg, label: "train", shape: "line" }, { color: C.pos, label: "test", shape: "line" }]} /></div>
            <AlphaCurve pts={pathErr} alpha={alpha} zones={zones} train={trainErr} test={testErr} />
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}

function FitPlot({ train, test, curve, height }: { train: Pt[]; test: Pt[]; curve: number[]; height: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const clip = useId().replace(/:/g, "");
  const sx = (x: number) => 8 + ((x - X0) / (X1 - X0)) * (width - 16);
  const sy = (y: number) => height - 8 - ((y - YD[0]) / (YD[1] - YD[0])) * (height - 16);
  const path = (ys: number[]) => ys.map((y, i) => `${i ? "L" : "M"}${sx(SAMPLES[i]).toFixed(1)},${sy(clamp(y, YD[0] - 1.5, YD[1] + 1.5)).toFixed(1)}`).join("");
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Fitted curve over the training and test points">
          <defs><clipPath id={clip}><rect width={width} height={height} rx={10} /></clipPath></defs>
          <line x1={0} x2={width} y1={sy(0)} y2={sy(0)} stroke="var(--hairline)" />
          <path d={path(SAMPLES.map(truth))} fill="none" stroke="var(--text-3)" strokeWidth={1.5} strokeDasharray="5 5" />
          <AnimatePresence initial={false}>
            {test.map((p, i) => (
              <motion.circle key={`${p.x}-${i}`} cx={sx(p.x)} cy={sy(p.y)} r={3.2} fill="none" stroke="var(--text-3)" strokeWidth={1.1}
                initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, delay: i * 0.008 }} style={{ transformOrigin: `${sx(p.x)}px ${sy(p.y)}px` }} />
            ))}
          </AnimatePresence>
          <g clipPath={`url(#${clip})`}>
            <motion.path initial={false} animate={{ d: path(curve) }} transition={{ type: "spring", stiffness: 140, damping: 22 }}
              fill="none" stroke={C.purple} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 6px ${C.purple}55)` }} />
          </g>
          {train.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4.6} fill={C.neg} stroke="var(--bg)" strokeWidth={1.2} />)}
        </svg>
      )}
    </div>
  );
}

/** Signed log scale so a weight of 3,000 and a weight of 0.05 both stay visible. */
const W_LIN = 0.05, W_MAX = 5000;
const wScale = (v: number) => Math.sign(v) * Math.min(1, Math.log10(1 + Math.abs(v) / W_LIN) / Math.log10(1 + W_MAX / W_LIN));

function WeightBars({ w }: { w: number[] }) {
  const H = 148, half = (H - 18) / 2;
  const ticks = [1, 100];
  return (
    <div style={{ position: "relative", height: H, paddingLeft: 30 }} role="img" aria-label={`Weights: ${w.map((v) => (v === 0 ? "0" : v.toPrecision(2))).join(", ")}`}>
      {/* gridlines at ±1 and ±100 */}
      {ticks.flatMap((t) => [t, -t]).map((t) => (
        <div key={t} style={{ position: "absolute", left: 30, right: 0, top: half - wScale(t) * half, borderTop: "1px dashed var(--hairline)" }}>
          <span className="tiny faint" style={{ position: "absolute", left: -30, top: -7, fontSize: 9.5, width: 26, textAlign: "right" }}>{t > 0 ? "+" : "−"}{Math.abs(t)}</span>
        </div>
      ))}
      <div style={{ position: "absolute", left: 30, right: 0, top: half, borderTop: "1.5px solid var(--text-3)" }} />
      <div style={{ position: "absolute", left: 30, right: 0, top: 0, height: H, display: "flex", gap: 3 }}>
        {w.map((v, j) => {
          const s = wScale(v);
          const zero = v === 0;
          return (
            <div key={j} title={`weight on x${SUP[j]}: ${zero ? "exactly 0" : v.toPrecision(3)}`} style={{ flex: 1, minWidth: 0, position: "relative", height: H }}>
              <div style={{
                position: "absolute", left: "14%", right: "14%", top: 0, height: half, transformOrigin: "50% 100%",
                transform: `scaleY(${Math.abs(s) < 0.004 && !zero ? (s < 0 ? -0.012 : 0.012) : s})`,
                transition: "transform .6s cubic-bezier(.34,1.2,.64,1), background .4s",
                background: s >= 0 ? `linear-gradient(180deg, ${C.purple}, ${C.purple}aa)` : `linear-gradient(0deg, ${C.teal}, ${C.teal}aa)`,
                borderRadius: 4,
              }} />
              <AnimatePresence>
                {zero && (
                  <motion.span key="z" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring.pop}
                    style={{ position: "absolute", left: "6%", right: "6%", top: half - 8, height: 16, borderRadius: 6, background: "var(--glass-strong)", border: `1.5px solid ${C.purple}`,
                      fontSize: 10, fontWeight: 750, color: C.purple, display: "flex", alignItems: "center", justifyContent: "center" }}>0</motion.span>
                )}
              </AnimatePresence>
              <span className="tiny muted" style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center", fontSize: 10 }}>x{SUP[j]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlphaCurve({ pts, alpha, zones, train, test }: {
  pts: { a: number; train: number; test: number }[]; alpha: number; zones: { lo: number; hi: number; best: number }; train: number; test: number;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 168;
  const m = { l: 30, r: 10, t: 18, b: 30 };
  const yMin = 0.1, yMax = 20;
  const L = (v: number) => Math.log10(clamp(v, yMin, yMax));
  const sx = (a: number) => m.l + ((Math.log10(a) - L_MIN) / (L_MAX - L_MIN)) * (width - m.l - m.r);
  const sy = (v: number) => height - m.b - ((L(v) - L(yMin)) / (L(yMax) - L(yMin))) * (height - m.t - m.b);
  const line = (key: "train" | "test") => pts.map((e, i) => `${i ? "L" : "M"}${sx(e.a).toFixed(1)},${sy(e[key]).toFixed(1)}`).join("");
  const bx = (a: number) => clamp(sx(a), m.l, width - m.r);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Training and test error across penalty values">
          <rect x={bx(zones.lo)} y={m.t} width={Math.max(2, bx(zones.hi) - bx(zones.lo))} height={height - m.t - m.b} fill={C.ok} opacity={0.12} rx={3} />
          <text x={(bx(zones.lo) + bx(zones.hi)) / 2} y={m.t - 5} textAnchor="middle" fontSize={9.5} fontWeight={650} fill={C.ok}>sweet spot</text>
          {[1, 10].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" />
              <text x={m.l - 4} y={sy(v) + 3} textAnchor="end" fontSize={9.5} fill="var(--text-3)">{v}</text>
            </g>
          ))}
          <path d={line("train")} fill="none" stroke={C.neg} strokeWidth={2.2} strokeLinejoin="round" />
          <motion.path initial={false} animate={{ d: line("test") }} transition={spring.gentle} fill="none" stroke={C.pos} strokeWidth={2.2} strokeLinejoin="round" />
          <text x={m.l + 2} y={height - m.b + 13} fontSize={9.5} fill="var(--text-3)">none</text>
          <text x={width - m.r} y={height - m.b + 13} textAnchor="end" fontSize={9.5} fill="var(--text-3)">huge</text>
          <text x={(m.l + width - m.r) / 2} y={height - 3} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">← wiggly · penalty (alpha) · flat →</text>
          <text transform={`translate(10 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill="var(--text-2)">error (log)</text>
          <motion.line initial={false} animate={{ x1: sx(alpha), x2: sx(alpha) }} transition={spring.snappy} y1={m.t} y2={height - m.b} stroke="var(--text-3)" strokeDasharray="3 3" />
          <motion.circle initial={false} animate={{ cx: sx(alpha), cy: sy(train) }} transition={spring.snappy} r={4.5} fill={C.neg} stroke="var(--bg)" strokeWidth={1.5} />
          <motion.circle initial={false} animate={{ cx: sx(alpha), cy: sy(test) }} transition={spring.snappy} r={5.5} fill={C.pos} stroke="var(--bg)" strokeWidth={1.5} />
        </svg>
      )}
    </div>
  );
}
