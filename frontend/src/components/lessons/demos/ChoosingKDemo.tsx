import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Slider, Toggle } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, clamp, gauss, rng, useDone } from "./shared";

/* ------------------------------------------------ data: 5 hidden groups of shoppers */

interface Pt { x: number; y: number; t: number } // t = true (hidden) group
type XY = { x: number; y: number };
type Phase = "init" | "assign" | "update" | "done";
interface Frame { centres: XY[]; labels: Int8Array | null; iter: number; phase: Phase }

const W = 10, H = 7; // data space (kept at this aspect ratio on screen)
const K_MIN = 2, K_MAX = 8, TRUE_K = 5;
const BLOBS = [
  { x: 2.0, y: 1.9, s: 0.55, n: 60 },
  { x: 4.6, y: 2.3, s: 0.6, n: 55 },
  { x: 8.0, y: 1.8, s: 0.6, n: 64 },
  { x: 2.6, y: 5.3, s: 0.62, n: 58 },
  { x: 7.1, y: 5.1, s: 0.58, n: 63 },
];
const TRUTH = ["#0A84FF", "#FF375F", "#30D158", "#FF9F0A", "#BF5AF2"]; // one colour per hidden group
const EXTRA = [C.teal, C.indigo, "#AC8E68"]; // for clusters beyond the 5 real groups
const GOLD = "#E3A008";
const DELAY: Record<Phase, number> = { init: 950, assign: 720, update: 820, done: 0 };

function makePoints(): Pt[] {
  const r = rng(11);
  const pts: Pt[] = [];
  BLOBS.forEach((b, t) => {
    for (let i = 0; i < b.n; i++) pts.push({ x: clamp(b.x + b.s * gauss(r), 0.15, W - 0.15), y: clamp(b.y + b.s * 0.85 * gauss(r), 0.15, H - 0.15), t });
  });
  return pts;
}

/* ------------------------------------------------ k-means (Lloyd's algorithm) with k-means++ seeding */

const d2 = (a: XY, b: XY) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** k-means++: first centre at random, each next one picked with probability ∝ squared distance to the nearest centre so far. */
function kppInit(pts: Pt[], k: number, r: () => number): XY[] {
  const c: XY[] = [pts[Math.floor(r() * pts.length)]];
  const w = pts.map((p) => d2(p, c[0]));
  while (c.length < k) {
    const tot = w.reduce((a, b) => a + b, 0);
    let u = r() * tot, i = 0;
    while (i < pts.length - 1 && u > w[i]) { u -= w[i]; i++; }
    c.push(pts[i]);
    pts.forEach((p, j) => { w[j] = Math.min(w[j], d2(p, pts[i])); });
  }
  return c.map((p) => ({ x: p.x, y: p.y }));
}

function assign(pts: Pt[], centres: XY[]) {
  const lab = new Int8Array(pts.length);
  pts.forEach((p, i) => {
    let b = 0;
    for (let j = 1; j < centres.length; j++) if (d2(p, centres[j]) < d2(p, centres[b])) b = j;
    lab[i] = b;
  });
  return lab;
}

function moveCentres(pts: Pt[], lab: Int8Array, prev: XY[]): XY[] {
  const s = prev.map(() => ({ x: 0, y: 0, n: 0 }));
  pts.forEach((p, i) => { const c = s[lab[i]]; c.x += p.x; c.y += p.y; c.n++; });
  return s.map((c, j) => (c.n ? { x: c.x / c.n, y: c.y / c.n } : prev[j])); // an empty cluster keeps its centre
}

/** Every visual step of one run: drop centres → (assign → move) × n until no point changes group. */
function trajectory(pts: Pt[], k: number, seed: number): Frame[] {
  let centres = kppInit(pts, k, rng(seed));
  const frames: Frame[] = [{ centres, labels: null, iter: 0, phase: "init" }];
  let labels: Int8Array | null = null, iter = 0;
  for (let it = 1; it <= 40; it++) {
    const nl = assign(pts, centres);
    if (labels && nl.every((v, i) => v === labels![i])) break;
    labels = nl;
    iter = it;
    frames.push({ centres, labels, iter, phase: "assign" });
    centres = moveCentres(pts, labels, centres);
    frames.push({ centres, labels, iter, phase: "update" });
  }
  frames.push({ centres, labels, iter, phase: "done" });
  return frames;
}

function inertia(pts: Pt[], lab: Int8Array, centres: XY[]) {
  return pts.reduce((s, p, i) => s + d2(p, centres[lab[i]]), 0);
}

/** Mean silhouette: (b − a) / max(a, b), a = mean distance to own cluster, b = to the nearest other cluster. */
function silhouette(pts: Pt[], lab: Int8Array, k: number) {
  const n = pts.length;
  let total = 0;
  const sum = new Float64Array(k), cnt = new Int32Array(k);
  for (let i = 0; i < n; i++) {
    sum.fill(0); cnt.fill(0);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      sum[lab[j]] += Math.sqrt(d2(pts[i], pts[j]));
      cnt[lab[j]]++;
    }
    const own = lab[i];
    if (!cnt[own]) continue; // singleton → silhouette 0
    const a = sum[own] / cnt[own];
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== own && cnt[c]) b = Math.min(b, sum[c] / cnt[c]);
    if (b < Infinity) total += (b - a) / Math.max(a, b);
  }
  return total / n;
}

/** Compare clusters with the hidden groups: how many real groups got glued together, how many got cut up. */
function vsTruth(pts: Pt[], lab: Int8Array, k: number) {
  const cont = Array.from({ length: k }, () => new Array(TRUE_K).fill(0));
  pts.forEach((p, i) => cont[lab[i]][p.t]++);
  const home = Array.from({ length: TRUE_K }, (_, t) => cont.reduce((b, row, c) => (row[t] > cont[b][t] ? c : b), 0));
  const major = cont.map((row) => row.reduce((b, v, t) => (v > row[b] ? t : b), 0));
  let merged = 0, split = 0;
  for (let c = 0; c < k; c++) merged += Math.max(0, home.filter((h) => h === c).length - 1);
  for (let t = 0; t < TRUE_K; t++) split += Math.max(0, major.filter((m, c) => m === t && cont[c][t] > 0).length - 1);
  return { merged, split, cont };
}

/** Give each cluster the colour of the real group it mostly captured (greedy matching), so a perfect k changes nothing. */
function clusterColours(cont: number[][]) {
  const k = cont.length;
  const pairs: [number, number, number][] = [];
  cont.forEach((row, c) => row.forEach((v, t) => pairs.push([v, c, t])));
  pairs.sort((a, b) => b[0] - a[0]);
  const col: (string | null)[] = new Array(k).fill(null);
  const usedT = new Set<number>();
  for (const [v, c, t] of pairs) if (v > 0 && col[c] === null && !usedT.has(t)) { col[c] = TRUTH[t]; usedT.add(t); }
  let e = 0;
  return col.map((c) => c ?? EXTRA[e++ % EXTRA.length]);
}

/** Pick the best-of-6 seeded k-means++ start for each k (so the animated run and the charts always agree). */
function sweep(pts: Pt[]) {
  const out: Record<number, { frames: Frame[]; inertia: number; sil: number; colours: string[] }> = {};
  for (let k = K_MIN; k <= K_MAX; k++) {
    let best: { frames: Frame[]; inertia: number } | null = null;
    for (let s = 1; s <= 6; s++) {
      const frames = trajectory(pts, k, k * 100 + s);
      const last = frames[frames.length - 1];
      const inr = inertia(pts, last.labels!, last.centres);
      if (!best || inr < best.inertia - 1e-9) best = { frames, inertia: inr };
    }
    const last = best!.frames[best!.frames.length - 1];
    out[k] = { ...best!, sil: silhouette(pts, last.labels!, k), colours: clusterColours(vsTruth(pts, last.labels!, k).cont) };
  }
  return out;
}

/** Elbow = the k farthest from the straight chord between the first and last inertia (the “kneedle” idea). */
function elbowOf(vals: number[]) {
  const n = vals.length, lo = Math.min(...vals), hi = Math.max(...vals);
  const ys = vals.map((v) => (v - lo) / (hi - lo || 1));
  let best = 0, bd = -1;
  ys.forEach((y, i) => { const x = i / (n - 1), chord = 1 - x, d = chord - y; if (d > bd) { bd = d; best = i; } });
  return best + K_MIN;
}

/* ------------------------------------------------ the demo */

export function ChoosingKDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const pts = useMemo(makePoints, []);
  const all = useMemo(() => sweep(pts), [pts]);
  const [run, setRun] = useState({ k: 3, idx: 0, n: 0 });
  const [truth, setTruth] = useState(false);

  const k = run.k;
  const frames = all[k].frames;
  const idx = Math.min(run.idx, frames.length - 1);
  const frame = frames[idx];
  const running = idx < frames.length - 1;

  // Step clock: advance one frame at a time while a run is in progress.
  useEffect(() => {
    if (run.idx >= all[run.k].frames.length - 1) return;
    const f = all[run.k].frames[run.idx];
    const pace = Math.max(0.4, 1 - 0.13 * Math.max(0, f.iter - 2)); // later rounds barely move — go faster
    const t = setTimeout(() => setRun((r) => ({ ...r, idx: r.idx + 1 })), DELAY[f.phase] * pace);
    return () => clearTimeout(t);
  }, [run, all]);

  const sils = useMemo(() => Array.from({ length: K_MAX - K_MIN + 1 }, (_, i) => all[i + K_MIN].sil), [all]);
  const inrs = useMemo(() => Array.from({ length: K_MAX - K_MIN + 1 }, (_, i) => all[i + K_MIN].inertia), [all]);
  const bestK = sils.indexOf(Math.max(...sils)) + K_MIN;
  const elbowK = useMemo(() => elbowOf(inrs), [inrs]);

  // Live numbers for whatever the picture currently shows.
  const live = useMemo(() => {
    const lab = frame.labels ?? assign(pts, frame.centres);
    const vt = vsTruth(pts, lab, k);
    return { sil: silhouette(pts, lab, k), inertia: inertia(pts, lab, frame.centres), merged: vt.merged, split: vt.split };
  }, [frame, pts, k]);

  const setK = (v: number) => { if (v !== run.k) { setRun((r) => ({ k: v, idx: 0, n: r.n + 1 })); done(); } };
  const onRun = () => {
    if (running) setRun((r) => ({ ...r, idx: all[r.k].frames.length - 1 }));
    else setRun((r) => ({ ...r, idx: 0, n: r.n + 1 }));
    done();
  };

  const s = all[k].sil.toFixed(2);
  const caption = running
    ? frame.phase === "init"
      ? <><b>k-means++</b> drops {k} starting centres, each one placed far from the others so they start out spread across the data.</>
      : frame.phase === "assign"
        ? <>Round {frame.iter}: every point joins its <b>nearest centre</b> and takes its colour.</>
        : <>Round {frame.iter}: each centre glides to the <b>middle (mean)</b> of its points. Then everyone checks again who's nearest…</>
    : k === TRUE_K
      ? truth
        ? <>The hidden groups and the clusters line up one-to-one: no colour changed. Silhouette peaks here (<b>{s}</b>) and the elbow bends here too.</>
        : <>Settled after <b>{frame.iter}</b> rounds. With k = {k} the groups are crisp: silhouette <b>{s}</b> is the best of any k, and the elbow bends right here. Flip on the hidden truth to check.</>
      : k < TRUE_K
        ? truth
          ? <>See the outlines holding <b>two colours</b>? Those are different real groups that k-means glued together, because you asked for only {k}.</>
          : <>k-means gave you exactly {k} groups, as asked, by <b>merging</b> real ones (silhouette {s}). The silhouette chart peaks at k = {bestK}. Try “Show the hidden truth”.</>
        : truth
          ? <>One real colour now sits in <b>two outlines</b>: k-means cut a natural group in half just to use up all {k} centres.</>
          : <>More centres always lower the inertia, but past the elbow it's mostly <b>splitting</b> real groups (silhouette drops to {s}). More groups ≠ better groups.</>;
  const captionKey = running ? `run-${frame.phase === "init" ? "init" : "loop"}` : `done-${Math.sign(k - TRUE_K)}-${truth}`;

  const [wrapRef, { width: wrapW }] = useSize<HTMLDivElement>();
  const side = wrapW > 700;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 18, rowGap: 12, width: "100%", alignItems: "center" }}>
          <div style={{ flex: "1 1 220px", maxWidth: 340 }}>
            <Slider label="Number of groups to find (k)" value={k} min={K_MIN} max={K_MAX} integer onChange={(v) => setK(Math.round(v))} format={(v) => `k = ${Math.round(v)}`}
              help="K-means always returns exactly this many groups, whether or not the data really has that many." />
          </div>
          <button className="btn sm primary" style={{ minWidth: 140 }} onClick={onRun}>{running ? "⏭ Skip to the end" : "▶ Run k-means"}</button>
          <Toggle label="Show the hidden truth" checked={truth} onChange={(v) => { setTruth(v); done(); }}
            help="Colour each point by the real customer type it came from (k-means never sees this)." />
        </div>
      }
      stats={
        <>
          <Stat key={`sil-${!running && k === bestK}`} label="Silhouette" value={live.sil} format={(v) => v.toFixed(2)} color={!running && k === bestK ? GOLD : undefined} emphasis={!running && k === bestK} sub="crisp groups · higher is better" />
          <Stat label="Inertia" value={live.inertia} format={(v) => Math.round(v).toLocaleString()} color={C.indigo} sub="spread inside groups · lower = tighter" />
          <Stat label="Real groups merged" value={live.merged} format={(v) => String(Math.round(v))} color={live.merged ? C.pos : C.ok} sub="glued into another group" />
          <Stat label="Real groups split" value={live.split} format={(v) => String(Math.round(v))} color={live.split ? C.warn : C.ok} sub="cut into pieces" />
        </>
      }
      caption={caption}
      captionKey={captionKey}
    >
      <div ref={wrapRef} style={{ display: "grid", gridTemplateColumns: side ? "1.55fr 1fr" : "1fr", gap: 12 }}>
        <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
          <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
            <b>🛍 300 shoppers, 2 features</b>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={running ? "run" : "done"} className="badge" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={spring.pop}
                style={running ? undefined : { background: `${C.ok}22`, color: C.ok }}>
                {running ? (frame.iter ? `round ${frame.iter}` : "placing centres") : `✓ stable after ${frame.iter} round${frame.iter === 1 ? "" : "s"}`}
              </motion.span>
            </AnimatePresence>
          </div>
          <ClusterPlot pts={pts} frame={frame} colours={all[k].colours} truth={truth} runKey={`${run.n}-${k}`} />
          <Legend items={truth
            ? [...TRUTH.map((c, i) => ({ color: c, label: `type ${i + 1}` })), { color: "var(--text-3)", label: "cluster outline", shape: "dash" as const }]
            : [{ color: "var(--text-2)", label: "centre", shape: "ring" as const }, frame.labels ? { color: all[k].colours[0], label: "colour = cluster" } : { color: "var(--text-3)", label: "not assigned yet" }]} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: side || wrapW < 520 ? "1fr" : "1fr 1fr", gap: 12, alignContent: "start" }}>
          <div className="inset col" style={{ padding: 12, gap: 4, minWidth: 0 }}>
            <div className="row between small"><b>Silhouette vs k</b><span className="tiny faint">higher = crisper</span></div>
            <KChart values={sils} k={k} gold={bestK} goldLabel="best" fmt={(v) => v.toFixed(2)} color={C.purple} />
          </div>
          <div className="inset col" style={{ padding: 12, gap: 4, minWidth: 0 }}>
            <div className="row between small"><b>Inertia elbow</b><span className="tiny faint">look for the bend</span></div>
            <KChart values={inrs} k={k} gold={elbowK} goldLabel="elbow" fmt={(v) => Math.round(v).toLocaleString()} color={C.indigo} />
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}

/* ------------------------------------------------ scatter: points + gliding centres */

function hull(ps: XY[]): XY[] {
  if (ps.length < 3) return ps;
  const s = [...ps].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: XY[] = [], up: XY[] = [];
  for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of s.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function ClusterPlot({ pts, frame, colours, truth, runKey }: { pts: Pt[]; frame: Frame; colours: string[]; truth: boolean; runKey: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const pad = 10;
  let plotW = Math.max(0, width - 2 * pad), plotH = (plotW * H) / W;
  if (plotH > 330) { plotH = 330; plotW = (plotH * W) / H; }
  const ox = (width - plotW) / 2;
  const sx = (x: number) => ox + (x / W) * plotW;
  const sy = (y: number) => pad + (1 - y / H) * plotH;
  const done = frame.phase === "done";
  const hulls = useMemo(() => {
    if (!done || !frame.labels) return [];
    return frame.centres.map((_, c) => hull(pts.filter((_, i) => frame.labels![i] === c)));
  }, [done, frame, pts]);
  const height = plotH + 2 * pad;
  return (
    <div ref={ref} style={{ width: "100%", height: width ? height : 240 }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block" }}>
          <style>{`.mlp-km-pt{transition:fill .45s ease, opacity .45s ease}.mlp-km-c{transition:transform .75s cubic-bezier(.32,.72,0,1)}@keyframes mlpKmPop{from{transform:scale(0)}60%{transform:scale(1.25)}to{transform:scale(1)}}@keyframes mlpKmFade{from{opacity:0}to{opacity:1}}`}</style>
          <rect x={ox} y={pad} width={plotW} height={plotH} rx={12} fill="var(--fill)" opacity={0.45} />
          {hulls.map((h, c) => h.length > 0 && (
            <path key={`${runKey}-h${c}`} d={`M${h.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("L")}Z`}
              fill={colours[c]} fillOpacity={truth ? 0.08 : 0.1} stroke={colours[c]} strokeOpacity={truth ? 0.9 : 0.35} strokeWidth={truth ? 2 : 1.5} strokeLinejoin="round"
              strokeDasharray={truth ? "5 4" : undefined} style={{ animation: "mlpKmFade .6s both" }} />
          ))}
          {pts.map((p, i) => {
            const lab = frame.labels ? frame.labels[i] : -1;
            const fill = truth ? TRUTH[p.t] : lab >= 0 ? colours[lab] : "var(--text-3)";
            return (
              <circle key={i} className="mlp-km-pt" cx={sx(p.x)} cy={sy(p.y)} r={3.6} fill={fill} opacity={truth || lab >= 0 ? 0.9 : 0.55}
                stroke="var(--glass-strong)" strokeWidth={0.8} style={{ transitionDelay: `${(i * 37) % 260}ms` }} />
            );
          })}
          {frame.centres.map((c, j) => (
            <g key={`${runKey}-${j}`} className="mlp-km-c" style={{ transform: `translate(${sx(c.x)}px, ${sy(c.y)}px)` }}>
              <g style={{ animation: `mlpKmPop .5s ${j * 90}ms both` }}>
                <circle r={11} fill={colours[j]} opacity={0.22} />
                <circle r={7.5} fill={colours[j]} stroke="white" strokeWidth={2.5} style={{ filter: `drop-shadow(0 2px 4px ${colours[j]}88)` }} />
                <path d="M-3,0H3M0,-3V3" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
              </g>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------ small "metric vs k" line chart */

function KChart({ values, k, gold, goldLabel, fmt, color }: { values: number[]; k: number; gold: number; goldLabel: string; fmt: (v: number) => string; color: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 122;
  const m = { l: 8, r: 8, t: 18, b: 20 };
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const sx = (kk: number) => m.l + 10 + ((kk - K_MIN) / (K_MAX - K_MIN)) * (width - m.l - m.r - 20);
  const sy = (v: number) => m.t + (1 - (v - lo) / span) * (height - m.t - m.b);
  const v = values[k - K_MIN], gv = values[gold - K_MIN];
  const path = values.map((y, i) => `${i ? "L" : "M"}${sx(i + K_MIN).toFixed(1)},${sy(y).toFixed(1)}`).join("");
  const anchor = gold === K_MAX ? "end" : gold === K_MIN ? "start" : "middle";
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
          <rect x={sx(gold) - 11} y={m.t - 4} width={22} height={height - m.t - m.b + 8} rx={7} fill={GOLD} opacity={0.13} />
          <motion.line initial={false} animate={{ x1: sx(k), x2: sx(k) }} transition={spring.snappy} y1={m.t - 4} y2={height - m.b + 4} stroke="var(--text-3)" strokeDasharray="3 3" />
          <path d={path} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          {values.map((y, i) => <circle key={i} cx={sx(i + K_MIN)} cy={sy(y)} r={3} fill={color} />)}
          <circle cx={sx(gold)} cy={sy(gv)} r={7} fill="none" stroke={GOLD} strokeWidth={2.4} />
          <text x={sx(gold)} y={m.t - 7} textAnchor={anchor} fontSize={9.5} fontWeight={700} fill={GOLD}>★ {goldLabel}: k={gold}</text>
          <motion.circle initial={false} animate={{ cx: sx(k), cy: sy(v) }} transition={spring.snappy} r={5.5} fill={color} stroke="white" strokeWidth={2} />
          {Array.from({ length: K_MAX - K_MIN + 1 }, (_, i) => i + K_MIN).map((kk) => (
            <text key={kk} x={sx(kk)} y={height - 5} textAnchor="middle" fontSize={10} fontWeight={kk === k ? 700 : 400} fill={kk === k ? "var(--text)" : "var(--text-3)"}>{kk}</text>
          ))}
          <motion.text initial={false} animate={{ x: sx(k) + (k >= K_MAX - 1 ? -9 : 9), y: clamp(sy(v) + (v > (lo + hi) / 2 ? 14 : -8), m.t + 8, height - m.b - 2) }} transition={spring.snappy}
            textAnchor={k >= K_MAX - 1 ? "end" : "start"} fontSize={10.5} fontWeight={700} fill="var(--text)">{fmt(v)}</motion.text>
        </svg>
      )}
    </div>
  );
}
