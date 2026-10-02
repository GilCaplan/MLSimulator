import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring, stagger } from "../../../design/motion";
import { pct } from "../../../lib/format";
import type { ReductionResult } from "../../../lib/types";
import { linear, useSize } from "../../charts";
import { InfoTip } from "../../glass";
import { MapCanvas, MapLegend, truthColor, truthLabels } from "./mapKit";

const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: spring.gentle } };

/** The 2-D embedding, coloured by the hidden truth when there is one. */
export function ReductionMap({ data, modelId, height = 380 }: { data: ReductionResult; modelId: string; height?: number }) {
  const labels = useMemo(() => truthLabels(data.points), [data.points]);
  const points = data.points.map((p) => ({ x: p.x, y: p.y, r: 2.8, color: labels ? truthColor(p.truth, labels) : "#5E5CE6", opacity: labels ? 0.8 : 0.55 }));
  const tsne = modelId === "tsne";
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        All your columns, folded onto one flat picture. Rows that are alike should land near each other.
        {labels ? " Colours come from the hidden truth column — the model never saw them, so clean islands of colour mean the real structure survived." : " Look for islands, bridges and stragglers."}
      </p>
      <MapCanvas points={points} height={height} caption={tsne ? "t-SNE map" : "PCA map · directions of most variation"} />
      {labels && <MapLegend items={labels.map((l) => ({ color: truthColor(l, labels), label: l }))} />}
      {tsne && (
        <div className="inset row" style={{ gap: 10, padding: "10px 12px", alignItems: "flex-start" }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span className="small" style={{ lineHeight: 1.55 }}>
            <b>Read t-SNE maps carefully.</b>{" "}
            <span className="muted">t-SNE keeps <i>neighbours</i> together, but the size of an island and the distance between islands mean almost nothing. Two far-apart islands aren't necessarily more different than two close ones. It also can't place new rows on an existing map.</span>
          </span>
        </div>
      )}
      {data.kl_divergence !== undefined && <span className="tiny faint">KL divergence {data.kl_divergence.toFixed(3)} — how much neighbourhood information the map lost (lower is better, only comparable on the same data).</span>}
    </div>
  );
}

/** Scree plot: variation per component (bars), running total (line), noise floor and the components that stand out. */
export function Scree({ data, height = 260 }: { data: ReductionResult; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const kept = data.kept_curve ?? [];
  const per = kept.map((k, i) => k.kept - (i ? kept[i - 1].kept : 0));
  if (!per.length && data.explained?.length) per.push(...data.explained);
  const cum = kept.length ? kept.map((k) => k.kept) : data.cumulative ?? [];
  const chosen = data.explained?.length ?? 0;
  const tail = per.slice(Math.floor(per.length / 2)).sort((a, b) => a - b);
  const floor = per.length >= 4 ? tail[Math.floor(tail.length / 2)] : Math.min(...per);
  let standOut = per.findIndex((v) => v < floor * 2);
  if (standOut < 0) standOut = per.length;
  standOut = Math.max(1, standOut);
  const m = { l: 36, r: 40, t: 12, b: 26 };
  const n = per.length;
  const bw = n ? (width - m.l - m.r) / n : 0;
  const maxV = Math.max(...per, 0.01);
  const sy = linear(0, maxV * 1.1, height - m.b, m.t);
  const sc = linear(0, 1, height - m.b, m.t);
  const x = (i: number) => m.l + i * bw;
  const shown = hover ?? standOut - 1;

  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        PCA lines up new directions from most to least important. Each bar is how much of the data's variation one direction carries; the line is the running total.
        Real structure shows up as a few <b style={{ color: "var(--text)" }}>tall bars that stand out above the flat noise floor</b> — keep those, and the flat tail is mostly noise.
      </p>
      <div ref={ref} className="inset" style={{ width: "100%", height, padding: 0, position: "relative" }}>
        {width > 0 && n > 0 && (
          <svg width={width} height={height}>
            <defs>
              <linearGradient id="screeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5E5CE6" />
                <stop offset="100%" stopColor="#0A84FF" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={sc(t)} y2={sc(t)} stroke="var(--hairline)" />
                <text x={width - m.r + 6} y={sc(t) + 3.5} fontSize={10} fill="var(--text-3)">{Math.round(t * 100)}%</text>
              </g>
            ))}
            {per.map((v, i) => {
              const out = i < standOut;
              return (
                <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
                  <rect x={x(i)} y={m.t} width={bw} height={height - m.t - m.b} fill="transparent" />
                  <motion.rect x={x(i) + bw * 0.14} width={Math.max(2, bw * 0.72)} rx={Math.min(4, bw / 4)}
                    initial={{ y: height - m.b, height: 0 }} animate={{ y: sy(v), height: height - m.b - sy(v) }} transition={{ ...spring.gentle, delay: i * 0.03 }}
                    fill={out ? "url(#screeGrad)" : "var(--text-3)"} opacity={out ? (hover === null || hover === i ? 1 : 0.6) : hover === i ? 0.7 : 0.35} />
                  {i < chosen && <rect x={x(i) + bw * 0.14} y={height - m.b + 3} width={Math.max(2, bw * 0.72)} height={3} rx={1.5} fill="var(--accent-2)" />}
                  {(n <= 15 || i % Math.ceil(n / 15) === 0) && <text x={x(i) + bw / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--text-3)">{i + 1}</text>}
                </g>
              );
            })}
            <line x1={m.l} x2={width - m.r} y1={sy(floor)} y2={sy(floor)} stroke="var(--danger)" strokeDasharray="5 4" strokeWidth={1.5} opacity={0.75} />
            <text x={width - m.r - 4} y={sy(floor) - 5} textAnchor="end" fontSize={10.5} fill="var(--danger)" fontWeight={600}>noise floor</text>
            <motion.path d={cum.map((c, i) => `${i ? "L" : "M"}${x(i) + bw / 2},${sc(c)}`).join("")} fill="none" stroke="var(--success)" strokeWidth={2.5} strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut", delay: 0.3 }} />
            {cum.map((c, i) => <circle key={i} cx={x(i) + bw / 2} cy={sc(c)} r={i === shown ? 5 : 2.5} fill="var(--success)" stroke="var(--glass-strong)" strokeWidth={1.5} />)}
            <text x={m.l - 6} y={m.t + 8} textAnchor="end" fontSize={10} fill="var(--text-3)">{pct(maxV, 0)}</text>
          </svg>
        )}
      </div>
      <div className="row wrap small" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--grad)" }} />stands out ({standOut})</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--text-3)", opacity: 0.5 }} />noise level</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--success)" }} />running total</span>
        {chosen > 0 && <span className="row" style={{ gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--accent-2)" }} />kept by this model ({chosen})</span>}
        <span className="grow" />
        {n > 0 && (
          <motion.span key={shown} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="small num" style={{ fontWeight: 560 }}>
            Component {shown + 1}: {pct(per[shown] ?? 0, 1)} · first {shown + 1} keep <span style={{ color: "var(--success)" }}>{pct(cum[shown] ?? 0, 0)}</span>
          </motion.span>
        )}
      </div>
      <div className="inset row" style={{ gap: 10, padding: "10px 12px", alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>🎯</span>
        <span className="small" style={{ lineHeight: 1.55 }}>
          The first <b>{standOut}</b> component{standOut === 1 ? "" : "s"} clearly rise above the noise floor and keep <b>{pct(cum[standOut - 1] ?? 0, 0)}</b> of the variation.
          <span className="muted"> {chosen > standOut ? ` This model keeps ${chosen} — the extra ones mostly carry noise.` : chosen && chosen < standOut ? ` This model keeps only ${chosen}, so some real structure is thrown away.` : " That's a sensible number to keep."}</span>
        </span>
      </div>
    </div>
  );
}

function loadCaption(top: { feature: string; w: number }[]) {
  const strong = top.filter((t) => Math.abs(t.w) >= 0.25);
  const up = strong.filter((t) => t.w > 0).slice(0, 3).map((t) => t.feature.replace(/_/g, " "));
  const down = strong.filter((t) => t.w < 0).slice(0, 3).map((t) => t.feature.replace(/_/g, " "));
  if (!up.length && !down.length) return "A blend of many small contributions.";
  return [up.length ? `grows with ${up.join(", ")}` : "", down.length ? `shrinks with ${down.join(", ")}` : ""].filter(Boolean).join("; ");
}

/** The recipe behind each PCA direction: which original columns push it up or down. */
export function Loadings({ data }: { data: ReductionResult }) {
  const loads = data.loadings ?? [];
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        Each new direction is a mix of your original columns. Long bars to the right push it up, bars to the left push it down — together they tell you what the direction “means”.
        <InfoTip text="These weights are called loadings. Columns that move together (like height and weight) tend to load on the same component." />
      </p>
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
        {loads.map((l) => {
          const max = Math.max(0.3, ...l.top.map((t) => Math.abs(t.w)));
          return (
            <motion.div key={l.component} variants={rise} className="inset col" style={{ padding: 14, gap: 9 }}>
              <div className="row between">
                <b>Component {l.component}</b>
                {data.explained?.[l.component - 1] !== undefined && <span className="badge accent">{pct(data.explained[l.component - 1], 0)} of variation</span>}
              </div>
              <span className="small" style={{ lineHeight: 1.45, fontWeight: 560 }}>{loadCaption(l.top).replace(/^./, (c) => c.toUpperCase())}.</span>
              {l.top.map((t, i) => (
                <div key={t.feature} className="col" style={{ gap: 2 }}>
                  <div className="row between tiny">
                    <span className="truncate" style={{ fontWeight: 600, maxWidth: "70%" }} title={t.feature}>{t.feature}</span>
                    <span className="num faint">{t.w > 0 ? "+" : ""}{t.w.toFixed(2)}</span>
                  </div>
                  <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--fill)" }}>
                    <span style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1.5, background: "var(--text-3)" }} />
                    <motion.span initial={{ width: 0 }} animate={{ width: `${(Math.abs(t.w) / max) * 50}%` }} transition={{ ...spring.gentle, delay: 0.15 + i * 0.05 }}
                      style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 4, background: t.w >= 0 ? "#0A84FF" : "#FF375F", ...(t.w >= 0 ? { left: "50%" } : { right: "50%" }) }} />
                  </div>
                </div>
              ))}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
