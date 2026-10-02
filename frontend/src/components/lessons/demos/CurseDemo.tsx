import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider, Toggle } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, MeterBar, Stat, clamp, gauss, pct, rng, useDone } from "./shared";

/* ------------------------------------------------ data: 3 machine states seen by 3 real sensors + up to 60 noisy ones */

const PER = 120, GROUPS = 3, N = PER * GROUPS;
const INFO = 3, MAX_NOISE = 60, P = INFO + MAX_NOISE;
const SCREE_N = 8; // components shown on the scree plot
const BINS = 34;
const GROUP_COLORS = [C.neg, C.warn, C.purple];
const GROUP_NAMES = ["my state", "state B", "state C"];
const GOLD = "#E3A008";

interface Data { Z: Float64Array; g: Uint8Array; ref: number }

/**
 * The real sensors move together: the 3 states sit along one shared direction, so after standardizing,
 * PCA sees a single direction carrying ~3 columns' worth of variation. Noise columns are pure N(0, 1).
 * Everything is standardized once (per column), exactly like a StandardScaler before PCA.
 */
function makeData(): Data {
  const r = rng(42);
  const Z = new Float64Array(N * P), g = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    g[i] = Math.floor(i / PER);
    const t = g[i] - 1;
    for (let d = 0; d < INFO; d++) Z[i * P + d] = t * 1.6 + 0.35 * gauss(r);
    for (let d = INFO; d < P; d++) Z[i * P + d] = gauss(r);
  }
  for (let d = 0; d < P; d++) {
    let m = 0, v = 0;
    for (let i = 0; i < N; i++) m += Z[i * P + d];
    m /= N;
    for (let i = 0; i < N; i++) v += (Z[i * P + d] - m) ** 2;
    const s = Math.sqrt(v / N) || 1;
    for (let i = 0; i < N; i++) Z[i * P + d] = (Z[i * P + d] - m) / s;
  }
  // Reference point: the most typical member of state A (closest to its group's centre on the real sensors).
  let ref = 0, best = Infinity;
  const cen = Array.from({ length: INFO }, (_, d) => { let s = 0; for (let i = 0; i < PER; i++) s += Z[i * P + d]; return s / PER; });
  for (let i = 0; i < PER; i++) {
    let s = 0;
    for (let d = 0; d < INFO; d++) s += (Z[i * P + d] - cen[d]) ** 2;
    if (s < best) { best = s; ref = i; }
  }
  return { Z, g, ref };
}

/* ------------------------------------------------ PCA by power iteration (with deflation) on the correlation matrix */

interface Scree { vals: number[]; vecs: Float64Array[]; thr: number; keep: number; noiseWeight: number }

function pca(data: Data, cols: number): Scree {
  const { Z } = data;
  const A = new Float64Array(cols * cols);
  for (let a = 0; a < cols; a++)
    for (let b = a; b < cols; b++) {
      let s = 0;
      for (let i = 0; i < N; i++) s += Z[i * P + a] * Z[i * P + b];
      A[a * cols + b] = A[b * cols + a] = s / N;
    }
  const r = rng(7 + cols);
  const comps: { val: number; vec: Float64Array }[] = [];
  const w = new Float64Array(cols);
  for (let c = 0; c < Math.min(SCREE_N, cols); c++) {
    const v = new Float64Array(cols).map(() => r() - 0.5);
    let lam = 0;
    for (let it = 0; it < 260; it++) {
      for (let a = 0; a < cols; a++) { let s = 0; for (let b = 0; b < cols; b++) s += A[a * cols + b] * v[b]; w[a] = s; }
      let n = 0;
      for (let a = 0; a < cols; a++) n += w[a] * w[a];
      n = Math.sqrt(n);
      if (n < 1e-12) break;
      let delta = 0;
      for (let a = 0; a < cols; a++) { const nv = w[a] / n; delta += Math.abs(nv - v[a]); v[a] = nv; }
      lam = n;
      if (delta < 1e-9) break;
    }
    comps.push({ val: lam, vec: v });
    for (let a = 0; a < cols; a++) for (let b = 0; b < cols; b++) A[a * cols + b] -= lam * v[a] * v[b];
  }
  comps.sort((a, b) => b.val - a.val);
  // Pure noise still produces eigenvalues up to ≈ (1 + √(columns/rows))² (Marchenko–Pastur); keep what clears it by 15%.
  const thr = 1.15 * (1 + Math.sqrt(cols / N)) ** 2;
  const keep = clamp(comps.filter((c) => c.val > thr).length, 1, 3);
  let wn = 0, wt = 0;
  for (let c = 0; c < keep; c++) {
    const { val, vec } = comps[c];
    for (let d = 0; d < cols; d++) { wt += val * vec[d] ** 2; if (d >= INFO) wn += val * vec[d] ** 2; }
  }
  return { vals: comps.map((c) => c.val), vecs: comps.slice(0, keep).map((c) => c.vec), thr, keep, noiseWeight: wt ? wn / wt : 0 };
}

/* ------------------------------------------------ distances */

interface Result {
  refDist: { d: number; g: number }[];
  nearest: number; farthest: number; ratio: number;
  nnAcc: number; refNNSame: boolean;
  noiseShare: number; dims: number;
}

function distances(data: Data, cols: number, scree: Scree | null): Result {
  const { Z, g, ref } = data;
  // Build the coordinates the distance will use: raw columns, or projections onto the kept PCA directions.
  let dim: number, X: Float64Array;
  if (scree) {
    dim = scree.keep;
    X = new Float64Array(N * dim);
    for (let i = 0; i < N; i++) for (let c = 0; c < dim; c++) { let s = 0; const v = scree.vecs[c]; for (let d = 0; d < cols; d++) s += Z[i * P + d] * v[d]; X[i * dim + c] = s; }
  } else {
    dim = cols;
    X = new Float64Array(N * dim);
    for (let i = 0; i < N; i++) for (let d = 0; d < cols; d++) X[i * dim + d] = Z[i * P + d];
  }
  let ok = 0, shareSum = 0, pairs = 0;
  const refDist: { d: number; g: number }[] = [];
  let refNN = -1;
  for (let i = 0; i < N; i++) {
    let best = Infinity, bj = -1;
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      let sig = 0, noi = 0;
      for (let d = 0; d < dim; d++) {
        const q = (X[i * dim + d] - X[j * dim + d]) ** 2;
        if (!scree && d >= INFO) noi += q; else sig += q;
      }
      const s = sig + noi;
      if (s < best) { best = s; bj = j; }
      if (!scree && j > i && s > 0) { shareSum += noi / s; pairs++; }
      if (i === ref) refDist.push({ d: Math.sqrt(s), g: g[j] });
    }
    if (g[bj] === g[i]) ok++;
    if (i === ref) refNN = bj;
  }
  const ds = refDist.map((x) => x.d);
  const nearest = Math.min(...ds), farthest = Math.max(...ds);
  return {
    refDist, nearest, farthest, ratio: farthest ? nearest / farthest : 0,
    nnAcc: ok / N, refNNSame: g[refNN] === g[ref],
    noiseShare: scree ? scree.noiseWeight : pairs ? shareSum / pairs : 0, dims: dim,
  };
}

/* ------------------------------------------------ the demo */

export function CurseDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const data = useMemo(makeData, []);
  const [noise, setNoise] = useState(0);
  const [usePca, setUsePca] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Results are cached per slider value (and PCA on/off) so scrubbing back and forth stays instant.
  const screeCache = useRef(new Map<number, Scree>());
  const distCache = useRef(new Map<string, Result>());
  const screeFor = (D: number) => {
    let s = screeCache.current.get(D);
    if (!s) { s = pca(data, INFO + D); screeCache.current.set(D, s); }
    return s;
  };
  const resultFor = (D: number, on: boolean) => {
    const key = `${D}-${on}`;
    let r = distCache.current.get(key);
    if (!r) { r = distances(data, INFO + D, on ? screeFor(D) : null); distCache.current.set(key, r); }
    return r;
  };
  const scree = useMemo(() => screeFor(noise), [noise, data]);
  const res = useMemo(() => resultFor(noise, usePca), [noise, usePca, data]);
  const xMax = useMemo(() => Math.ceil(resultFor(MAX_NOISE, false).farthest * 1.04), [data]);

  // "▶ Add noise" sweeps the slider up, one column at a time.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setNoise((n) => {
        if (n >= MAX_NOISE) { setPlaying(false); return n; }
        return Math.min(MAX_NOISE, n + 2);
      });
    }, 140);
    return () => clearInterval(t);
  }, [playing]);

  const onPlay = () => {
    if (playing) setPlaying(false);
    else { if (noise >= MAX_NOISE) setNoise(0); setUsePca(false); setPlaying(true); }
    done();
  };

  const cols = INFO + noise;
  const bucket = usePca ? "pca" : noise === 0 ? "clean" : noise < 30 ? "some" : "lots";
  const caption = {
    clean: <>Using only the <b>3 real sensors</b>, your own state (blue) sits close and the other states are clearly farther away. Your nearest neighbour is practically next door (<b>{res.nearest.toFixed(1)}</b>) while the farthest is <b>{res.farthest.toFixed(1)}</b> away. Now add noisy columns.</>,
    some: <>Every noisy column adds random differences to <b>every</b> distance. With {noise} of them the coloured humps slide right, squeeze together and start to overlap: nearest is now <b>{pct(res.ratio)}</b> of farthest, and {pct(res.nnAcc)} of points still find a neighbour from their own state. Keep going.</>,
    lots: <>With {noise} noisy columns all the colours pile into <b>one narrow hump</b>: your nearest point is <b>{pct(res.ratio)}</b> as far as your farthest, so everyone looks about equally far. Only <b>{pct(res.nnAcc)}</b> of nearest neighbours share a state (pure guessing: 33%). Try “Let PCA find the signal”.</>,
    pca: <>The 3 real sensors move <b>together</b>, so PCA finds one direction carrying ~{scree.vals[0].toFixed(1)} columns' worth of variation, far above the noise floor. Measuring distance along {scree.keep === 1 ? "just that direction" : `those ${scree.keep} directions`} instead of {cols} columns, the states separate again: <b>{pct(res.nnAcc)}</b> of neighbours are back in the right state.</>,
  }[bucket];

  const [wrapRef, { width: wrapW }] = useSize<HTMLDivElement>();
  const side = wrapW > 720;
  const ratioColor = res.ratio > 0.5 ? C.pos : res.ratio > 0.3 ? C.warn : C.ok;
  const accColor = res.nnAcc < 0.7 ? C.pos : res.nnAcc < 0.9 ? C.warn : C.ok;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 18, rowGap: 12, width: "100%", alignItems: "center" }}>
          <div style={{ flex: "1 1 240px", maxWidth: 360 }}>
            <Slider label="Noisy columns added" value={noise} min={0} max={MAX_NOISE} integer onChange={(v) => { setPlaying(false); setNoise(Math.round(v)); done(); }}
              format={(v) => `${Math.round(v)}`} help="Columns of pure random numbers (think: sensors that measure nothing useful) added next to the 3 real sensors." />
          </div>
          <button className="btn sm" style={{ minWidth: 118 }} onClick={onPlay}>{playing ? "⏸ Pause" : noise >= MAX_NOISE ? "↺ Start over" : "▶ Add noise"}</button>
          <Toggle label="Let PCA find the signal" checked={usePca} onChange={(v) => { setPlaying(false); setUsePca(v); done(); }}
            help="Standardize, run PCA, keep only the components that stand out above the noise floor on the scree plot, and measure distances in that small space." />
        </div>
      }
      stats={
        <>
          <Stat label="Columns in each distance" value={res.dims} format={(v) => String(Math.round(v))} color={usePca ? C.ok : undefined}
            sub={usePca ? `PCA direction${res.dims === 1 ? "" : "s"} kept (of ${cols})` : `3 real + ${noise} noisy`} />
          <Stat key={`r-${res.ratio > 0.5}`} label="Nearest ÷ farthest" value={res.ratio} color={ratioColor} emphasis={res.ratio > 0.5} sub="for the 📍 point · 100% = all equal" />
          <Stat key={`a-${res.nnAcc < 0.7}`} label="Nearest neighbour in my state" value={res.nnAcc} color={accColor} emphasis={res.nnAcc < 0.7} sub="all 360 points · guessing = 33%" />
          <Stat label="Noise share of each distance" value={res.noiseShare} color={res.noiseShare > 0.5 ? C.pos : undefined} sub={usePca ? "PCA weight on noisy columns" : "how much is random"} />
        </>
      }
      caption={caption}
      captionKey={bucket}
    >
      <div ref={wrapRef} style={{ display: "grid", gridTemplateColumns: side ? "1.45fr 1fr" : "1fr", gap: 12 }}>
        <div className="inset col" style={{ padding: 12, gap: 8, minWidth: 0 }}>
          <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
            <b>📍 Distances from one reading to the other 359</b>
            <Legend items={GROUP_NAMES.map((n, i) => ({ color: GROUP_COLORS[i], label: n, shape: "square" as const }))} />
          </div>
          <DistHist res={res} xMax={xMax} height={side ? 222 : 168} />
        </div>
        <div className="col" style={{ gap: 12, minWidth: 0 }}>
          <div className="inset col" style={{ padding: 12, gap: 12 }}>
            <RatioMeter ratio={res.ratio} color={ratioColor} />
            <MeterBar label="Nearest neighbour from my own state" value={res.nnAcc} color={accColor} height={14}
              note={<>my own nearest neighbour: {res.refNNSame ? <b style={{ color: C.ok }}>same state ✓</b> : <b style={{ color: C.pos }}>a different state ✗</b>}</>} />
          </div>
          <div className="inset col" style={{ padding: 12, gap: 4, opacity: usePca ? 1 : 0.92, transition: "opacity .3s" }}>
            <div className="row between small" style={{ gap: 8 }}>
              <b>🧮 PCA scree plot</b>
              <span className="tiny faint">{cols} columns, standardized</span>
            </div>
            <ScreeChart scree={scree} active={usePca} />
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}

/* ------------------------------------------------ stacked distance histogram (CSS height transitions) */

function DistHist({ res, xMax, height: Hh }: { res: Result; xMax: number; height: number }) {
  const bw = xMax / BINS;
  const counts = Array.from({ length: BINS }, () => [0, 0, 0]);
  res.refDist.forEach(({ d, g }) => { counts[clamp(Math.floor(d / bw), 0, BINS - 1)][g]++; });
  const max = Math.max(1, ...counts.map((c) => c[0] + c[1] + c[2]));
  const pos = (d: number) => `${clamp(d / xMax, 0, 1) * 100}%`;
  const ticks = Array.from({ length: Math.floor(xMax / 2) + 1 }, (_, i) => i * 2);
  const ease = "cubic-bezier(.32,.72,0,1)";
  return (
    <div className="col" style={{ gap: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: Hh, position: "relative" }}>
        {counts.map((c, i) => (
          <div key={i} title={`${(i * bw).toFixed(1)}–${((i + 1) * bw).toFixed(1)}: ${c[0] + c[1] + c[2]} points`}
            style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column-reverse" }}>
            {c.map((v, g) => (
              <div key={g} style={{
                height: (v / max) * (Hh - 4), background: GROUP_COLORS[g], opacity: 0.88,
                borderRadius: g === 2 || (g === 1 && !c[2]) || (g === 0 && !c[1] && !c[2]) ? "3px 3px 0 0" : 0,
                transition: `height .55s ${ease} ${i * 8}ms`,
              }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ height: 1, background: "var(--hairline)" }} />
      {/* nearest ↔ farthest bracket */}
      <div style={{ position: "relative", height: 34 }}>
        <div style={{ position: "absolute", top: 9, height: 6, left: pos(res.nearest), width: `calc(${pos(res.farthest)} - ${pos(res.nearest)})`, minWidth: 2,
          borderRadius: 3, background: "var(--fill-2)", transition: `left .55s ${ease}, width .55s ${ease}` }} />
        {[{ d: res.nearest, label: "nearest", c: C.ok }, { d: res.farthest, label: "farthest", c: C.pos }].map((m) => (
          <div key={m.label} style={{ position: "absolute", top: 2, left: pos(m.d), transform: "translateX(-50%)", transition: `left .55s ${ease}`, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: `7px solid ${m.c}` }} />
            <span style={{ width: 10, height: 10, borderRadius: 5, background: m.c, border: "2px solid var(--glass-strong)", marginTop: -1 }} />
            <span className="tiny num" style={{ color: m.c, fontWeight: 700, whiteSpace: "nowrap", fontSize: 10.5 }}>{m.label} {m.d.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "relative", height: 14 }}>
        {ticks.map((t) => (
          <span key={t} className="tiny faint num" style={{ position: "absolute", left: pos(t), transform: `translateX(${t === 0 ? "0" : t >= xMax - 1 ? "-100%" : "-50%"})`, fontSize: 10 }}>{t}</span>
        ))}
      </div>
      <div className="tiny faint" style={{ textAlign: "center", marginTop: 2 }}>distance (standardized units) →</div>
    </div>
  );
}

/* ------------------------------------------------ nearest ÷ farthest gauge */

function RatioMeter({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row between small" style={{ gap: 8 }}>
        <span style={{ fontWeight: 560 }}>Nearest ÷ farthest</span>
        <span className="num" style={{ fontWeight: 700, fontSize: 15, color }}>{pct(ratio)}</span>
      </div>
      <div style={{ position: "relative", height: 14, borderRadius: 7, background: `linear-gradient(90deg, ${C.ok}55, ${C.warn}55 45%, ${C.pos}66)` }}>
        <motion.div initial={false} animate={{ left: `${clamp(ratio, 0, 1) * 100}%` }} transition={spring.gentle}
          style={{ position: "absolute", top: -4, width: 22, height: 22, marginLeft: -11, borderRadius: 11, background: color, border: "3px solid var(--glass-strong)", boxShadow: `0 2px 8px ${color}88` }} />
      </div>
      <div className="row between tiny faint"><span>near ≪ far: clear groups</span><span>everyone equally far</span></div>
    </div>
  );
}

/* ------------------------------------------------ scree plot */

function ScreeChart({ scree, active }: { scree: Scree; active: boolean }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 132;
  const m = { l: 22, r: 6, t: 16, b: 18 };
  const yMax = Math.max(3.3, scree.vals[0] * 1.08);
  const n = SCREE_N;
  const plotW = width - m.l - m.r, plotH = height - m.t - m.b;
  const bw = plotW / n;
  const sy = (v: number) => m.t + (1 - v / yMax) * plotH;
  const thrY = sy(Math.min(scree.thr, yMax));
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block" }}>
          {[0, 1, 2, 3].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" />
              <text x={m.l - 5} y={sy(v) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--text-3)">{v}</text>
            </g>
          ))}
          {Array.from({ length: n }, (_, i) => {
            const v = scree.vals[i] ?? 0;
            const kept = i < scree.keep;
            const h = (v / yMax) * plotH;
            const fill = kept ? (active ? GOLD : C.indigo) : "var(--text-3)";
            return (
              <g key={i}>
                <rect x={m.l + i * bw + bw * 0.16} width={bw * 0.68} y={m.t} height={plotH} rx={4} fill="transparent">
                  <title>{`PC${i + 1}: ${v.toFixed(2)} columns' worth of variation${kept ? " (kept)" : ""}`}</title>
                </rect>
                <rect x={m.l + i * bw + bw * 0.16} width={bw * 0.68} y={m.t + plotH - h} height={h} rx={4} fill={fill} opacity={kept ? 0.95 : 0.45}
                  style={{ transition: "y .55s cubic-bezier(.32,.72,0,1), height .55s cubic-bezier(.32,.72,0,1), fill .3s, opacity .3s", pointerEvents: "none" }} />
                <text x={m.l + i * bw + bw / 2} y={height - 5} textAnchor="middle" fontSize={9.5} fontWeight={kept ? 700 : 400} fill={kept ? "var(--text)" : "var(--text-3)"}>PC{i + 1}</text>
              </g>
            );
          })}
          <line x1={m.l} x2={width - m.r} y1={thrY} y2={thrY} stroke={C.pos} strokeWidth={1.4} strokeDasharray="5 4" style={{ transition: "y1 .55s, y2 .55s" }} />
          <text x={width - m.r} y={thrY - 4} textAnchor="end" fontSize={9.5} fontWeight={650} fill={C.pos} style={{ transition: "y .55s" }}>noise floor</text>
          <text x={m.l + bw * 0.5 + bw * 0.34 + 4} y={Math.max(m.t + 9, sy(scree.vals[0] ?? 0) + 10)} fontSize={9.5} fontWeight={700} fill={active ? GOLD : C.indigo}>
            {active ? "← kept: the signal" : "← stands out"}
          </text>
          <text transform={`translate(8 ${m.t + plotH / 2}) rotate(-90)`} textAnchor="middle" fontSize={9} fill="var(--text-3)">columns' worth</text>
        </svg>
      )}
    </div>
  );
}
