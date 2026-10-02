import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useEffect, useMemo, useState } from "react";
import { spring, stagger } from "../../../design/motion";
import { withAlpha } from "../../../lib/colors";
import { fmt, pct } from "../../../lib/format";
import type { ClusterResult } from "../../../lib/types";
import { Sparkline } from "../../charts";
import { AnimatedNumber, InfoTip, Segmented } from "../../glass";
import { metricHelp, metricLabel } from "../util";
import { MapCanvas, MapLegend, clusterColor, clusterName, nearest, truthColor, truthLabels, type MapCentre } from "./mapKit";

const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: spring.gentle } };

/* ------------------------------------------------------------------ Map */

/**
 * The clusters on a 2-D map, with a toggle to colour by the hidden truth and a "replay k-means" button that animates
 * the saved iterations (centres walking, points switching groups).
 */
export function ClusterMap({ data, liveSample, height = 360, modelId }: { data: ClusterResult; liveSample?: number[][] | null; height?: number; modelId?: string }) {
  const labels = useMemo(() => truthLabels(data.points), [data.points]);
  const [by, setBy] = useState<"cluster" | "truth">("cluster");
  const [idx, setIdx] = useState<number | null>(null);
  const steps = data.steps ?? [];
  const playing = idx !== null;

  useEffect(() => {
    if (idx === null) return;
    if (idx >= steps.length - 1) {
      const t = setTimeout(() => setIdx(null), 1600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIdx(idx + 1), idx === 0 ? 900 : Math.max(220, Math.min(650, 5200 / steps.length)));
    return () => clearTimeout(t);
  }, [idx, steps.length]);

  const step = idx !== null ? steps[idx] : null;
  const exact = !!liveSample && !!steps[0] && liveSample.length === steps[0].labels.length;
  const total = Object.values(data.sizes).reduce((a, b) => a + b, 0);

  const points = step
    ? exact
      ? liveSample!.map((p, i) => ({ x: p[0], y: p[1], color: clusterColor(step.labels[i] ?? -1), r: 3 }))
      : data.points.map((p) => ({ x: p.x, y: p.y, color: clusterColor(nearest(p.x, p.y, step.centroids_2d)), r: 2.8 }))
    : data.points.map((p) => ({
        x: p.x, y: p.y, r: p.c < 0 ? 2.2 : 2.8, opacity: p.c < 0 ? 0.5 : 0.8,
        color: by === "truth" && labels ? truthColor(p.truth, labels) : clusterColor(p.c),
      }));
  const centres: MapCentre[] = step
    ? step.centroids_2d.map((c, i) => ({ id: i, x: c[0], y: c[1], color: clusterColor(i), label: String(i + 1) }))
    : (data.centroids_2d ?? []).map((c, i) => {
        const id = data.center_ids?.[i] ?? i;
        return { id, x: c[0], y: c[1], color: by === "truth" ? "#8e8e93" : clusterColor(id), label: String(id + 1) };
      });
  const trails = useMemo(() => {
    if (idx === null) return undefined;
    const t: Record<number, [number, number][]> = {};
    steps.slice(0, idx + 1).forEach((s) => s.centroids_2d.forEach((c, i) => { (t[i] ??= []).push([c[0], c[1]]); }));
    return t;
  }, [steps, idx]);

  const legend = by === "truth" && labels && !playing
    ? labels.map((l) => ({ color: truthColor(l, labels), label: l }))
    : Object.entries(data.sizes).map(([k, n]) => ({ color: clusterColor(Number(k)), label: clusterName(Number(k)), note: `${n.toLocaleString()} · ${pct(n / (total || 1), 0)}` }));

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 560, margin: 0 }}>
          Every dot is a row, squashed onto a flat map (PCA). Colour = the group the model put it in{centres.length ? "; the big rings are the group centres" : ""}.
          {labels ? " Flip to the hidden truth to see whether the groups match the real categories." : ""}
        </p>
        <div className="row" style={{ gap: 8 }}>
          {labels && <Segmented size="sm" value={by} onChange={(v) => { setBy(v); setIdx(null); }} options={[{ value: "cluster", label: "🫧 Clusters" }, { value: "truth", label: "🙈 Hidden truth" }]} />}
          {steps.length > 0 && (
            <motion.button whileTap={{ scale: 0.95 }} className={`btn sm ${playing ? "" : "gradient"}`} onClick={() => { setBy("cluster"); setIdx(playing ? null : 0); }}>
              {playing ? "■ Stop" : modelId === "gmm" ? "▶ Replay the fit" : "▶ Replay k-means"}
            </motion.button>
          )}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <MapCanvas points={points} centres={centres} trails={trails} height={height} caption="2-D projection (PCA) of your features" />
        <AnimatePresence>
          {step && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.snappy}
              className="glass strong row" style={{ position: "absolute", left: 10, top: 10, padding: "8px 12px", gap: 12, borderRadius: 14 }}>
              <span className="col" style={{ gap: 0 }}>
                <b className="small num">Step {idx! + 1} / {steps.length}</b>
                <span className="tiny muted">{idx === 0 ? "points join the nearest centre" : idx === steps.length - 1 ? "settled ✓" : "centres move to their group's middle"}</span>
              </span>
              <span className="col" style={{ gap: 0, alignItems: "flex-end" }}>
                <Sparkline values={steps.slice(0, idx! + 1).map((s) => s.inertia)} width={90} height={24} color="var(--accent-2)" />
                <span className="tiny faint num">{modelId === "gmm" ? "misfit" : "inertia"} {fmt(step.inertia, 4)}</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <MapLegend items={legend} />
      {step && !exact && <span className="tiny faint">Replay colours each dot by its nearest centre on this flat map — a close approximation of the real assignment.</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ Profiles */

const COUNTISH = /(^|_)(visits?|counts?|orders|purchases|trips|calls|items|clicks|sessions|n|num)(_|$)/i;

function phrase(f: { feature: string; z: number }) {
  const name = f.feature.replace(/_/g, " ");
  const strong = Math.abs(f.z) >= 1.2;
  const word = COUNTISH.test(f.feature) ? (f.z > 0 ? "more" : "fewer") : f.z > 0 ? "higher" : "lower";
  return `${strong ? "much " : ""}${word} ${name}`;
}

/** Auto caption for a cluster: its most distinctive features in plain words. */
export function describeCluster(top: { feature: string; z: number }[]): string {
  const strong = top.filter((t) => Math.abs(t.z) >= 0.35).slice(0, 3);
  if (!strong.length) return "Close to average on everything — the “typical” group.";
  const s = strong.map(phrase).join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + " than average.";
}

/** One card per cluster: its size and what makes it different (z-scores vs the overall average, raw means). */
export function ClusterProfiles({ data }: { data: ClusterResult }) {
  const profiles = data.profiles ?? [];
  const total = Object.values(data.sizes).reduce((a, b) => a + b, 0) || 1;
  const maxZ = Math.max(1.5, ...profiles.flatMap((p) => p.top.map((t) => Math.abs(t.z))));
  if (!profiles.length) return <p className="small muted">No numeric columns to profile.</p>;
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        What makes each group special? Bars show how far the group's average sits from the overall average, in “typical spreads” (z-scores):
        <b style={{ color: "var(--text)" }}> right = higher</b>, <b style={{ color: "var(--text)" }}>left = lower</b>. The numbers are the group's real average vs everyone's.
        <InfoTip text="A z-score of +1 means the group's average is one standard deviation above the overall average — clearly different. Values near 0 mean the group is typical on that column." />
      </p>
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
        {profiles.map((p) => {
          const col = clusterColor(p.cluster);
          const share = p.size / total;
          return (
            <motion.div key={p.cluster} variants={rise} className="inset col" style={{ padding: 14, gap: 10, borderColor: withAlpha(col.startsWith("#") ? col : "#8e8e93", 0.35) }}>
              <div className="row between">
                <span className="row" style={{ gap: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 7, background: col, boxShadow: `0 0 0 3px ${withAlpha(col, 0.25)}` }} />
                  <b>{clusterName(p.cluster)}</b>
                </span>
                <span className="small muted num">{p.size.toLocaleString()} rows · <b style={{ color: "var(--text)" }}>{pct(share, 0)}</b></span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--fill)", overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ ...spring.gentle, delay: 0.15 }} style={{ height: "100%", background: col, borderRadius: 3 }} />
              </div>
              <span className="small" style={{ lineHeight: 1.45, fontWeight: 560 }}>{p.cluster < 0 ? "Points in sparse areas that don't belong to any dense group." : describeCluster(p.top)}</span>
              <div className="col" style={{ gap: 7 }}>
                {p.top.map((t, i) => {
                  const w = Math.min(1, Math.abs(t.z) / maxZ) * 50;
                  return (
                    <div key={t.feature} className="col" style={{ gap: 2 }}>
                      <div className="row between tiny">
                        <span className="truncate" style={{ fontWeight: 600, maxWidth: "55%" }} title={t.feature}>{t.feature}</span>
                        <span className="num faint">{fmt(t.mean, 3)} <span style={{ opacity: 0.7 }}>vs {fmt(t.overall, 3)} avg</span></span>
                      </div>
                      <div style={{ position: "relative", height: 9, borderRadius: 5, background: "var(--fill)" }}>
                        <span style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1.5, background: "var(--text-3)" }} />
                        <motion.span initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ ...spring.gentle, delay: 0.2 + i * 0.05 }}
                          style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 5, background: t.z >= 0 ? col : "var(--text-3)", opacity: t.z >= 0 ? 0.9 : 0.7, ...(t.z >= 0 ? { left: "50%" } : { right: "50%" }) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ Truth check */

function grade(metric: string, v: number) {
  if (metric === "purity") return v >= 0.9 ? "excellent" : v >= 0.75 ? "good" : v >= 0.55 ? "so-so" : "weak";
  return v >= 0.85 ? "excellent" : v >= 0.65 ? "good" : v >= 0.35 ? "partial" : "weak";
}

/** Truth × cluster table plus ARI / NMI / purity: do the discovered groups match the real (hidden) categories? */
export function TruthCheck({ data, metrics }: { data: ClusterResult; metrics: Record<string, number> }) {
  const ct = data.contingency;
  if (!ct) return <p className="small muted">No truth column was kept, so there's nothing to compare with.</p>;
  const rowTot = ct.matrix.map((r) => r.reduce((a, b) => a + b, 0));
  const colTot = ct.cols.map((_, j) => ct.matrix.reduce((a, r) => a + r[j], 0));
  const insights: { icon: string; text: string }[] = [];
  ct.cols.forEach((c, j) => {
    const shares = ct.rows.map((name, i) => ({ name, s: ct.matrix[i][j] / (colTot[j] || 1) })).sort((a, b) => b.s - a.s);
    if (shares[0] && shares[1] && shares[0].s < 0.7 && shares[1].s >= 0.2)
      insights.push({ icon: "🧩", text: `${clusterName(c)} mixes “${shares[0].name}” (${pct(shares[0].s, 0)}) and “${shares[1].name}” (${pct(shares[1].s, 0)}) — two real groups merged into one. More clusters might pull them apart.` });
  });
  ct.rows.forEach((name, i) => {
    const shares = ct.cols.map((c, j) => ({ c, s: ct.matrix[i][j] / (rowTot[i] || 1) })).sort((a, b) => b.s - a.s);
    if (shares[0] && shares[1] && shares[0].s < 0.65 && shares[1].s >= 0.25)
      insights.push({ icon: "✂️", text: `“${name}” is split between ${clusterName(shares[0].c)} and ${clusterName(shares[1].c)} — one real group cut in two.` });
  });
  const keys = ["ari", "nmi", "purity"].filter((k) => metrics[k] !== undefined);

  return (
    <div className="col" style={{ gap: 16 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        The models never saw the real categories — we hid them. Now we peek: each row of the table is a real category, each column a discovered cluster.
        <b style={{ color: "var(--text)" }}> A perfect match has one bright cell per row and per column.</b> (Cluster numbers are arbitrary — only who ends up together matters.)
      </p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {keys.map((k, i) => (
          <motion.div key={k} className="inset col" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: i * 0.06 }} style={{ padding: 12, gap: 3 }}>
            <span className="row small muted" style={{ gap: 5 }}>{metricLabel(k)}<InfoTip text={metricHelp(k) ?? ""} /></span>
            <b style={{ fontSize: 24, letterSpacing: "-0.02em" }} className="num">
              <AnimatedNumber value={metrics[k]} format={(v) => (k === "purity" ? pct(v, 1) : v.toFixed(2))} />
            </b>
            <span className="tiny" style={{ color: grade(k, metrics[k]) === "weak" ? "var(--danger)" : grade(k, metrics[k]) === "excellent" ? "var(--success)" : "var(--text-2)", fontWeight: 600 }}>{grade(k, metrics[k])} agreement</span>
          </motion.div>
        ))}
      </div>
      <div className="inset scroll" style={{ padding: 14, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `minmax(110px, auto) repeat(${ct.cols.length}, minmax(58px, 1fr)) 60px`, gap: 4, minWidth: 120 + ct.cols.length * 62 }}>
          <span className="tiny faint" style={{ alignSelf: "end" }}>truth ↓ · cluster →</span>
          {ct.cols.map((c) => (
            <span key={c} className="row tiny" style={{ gap: 5, justifyContent: "center", fontWeight: 650 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: clusterColor(c) }} />{c < 0 ? "noise" : c + 1}
            </span>
          ))}
          <span className="tiny faint" style={{ textAlign: "right" }}>rows</span>
          {ct.rows.map((name, i) => (
            <Fragment key={name}>
              <span className="small truncate" style={{ alignSelf: "center", fontWeight: 600 }} title={name}>{name}</span>
              {ct.matrix[i].map((v, j) => {
                const s = v / (rowTot[i] || 1);
                const col = clusterColor(ct.cols[j]);
                return (
                  <motion.div key={j} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.gentle, delay: (i + j) * 0.025 }}
                    title={`${name} → ${clusterName(ct.cols[j])}: ${v} rows (${pct(s, 0)} of ${name})`}
                    style={{ height: 38, borderRadius: 8, background: v ? withAlpha(col, 0.1 + 0.8 * s) : "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: s > 0.5 ? 700 : 500, color: s > 0.55 ? "white" : v ? "var(--text)" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                    {v || "·"}
                  </motion.div>
                );
              })}
              <span className="small num faint" style={{ alignSelf: "center", textAlign: "right" }}>{rowTot[i]}</span>
            </Fragment>
          ))}
        </div>
      </div>
      {insights.length > 0 ? (
        <div className="col" style={{ gap: 6 }}>
          {insights.slice(0, 4).map((x, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: 0.3 + i * 0.08 }} className="row small" style={{ gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
              <span>{x.icon}</span><span>{x.text}</span>
            </motion.div>
          ))}
        </div>
      ) : (
        <span className="small" style={{ color: "var(--success)", fontWeight: 600 }}>✓ Every cluster lines up with one real category — the model rediscovered the hidden groups on its own.</span>
      )}
      <div className="row small muted" style={{ gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
        <span>💡</span>
        <span>This is why a hidden truth column is so valuable: silhouette only says the groups are <i>crisp</i>, not that they're <i>right</i>. In real projects you rarely have one — so you check the profiles and ask “do these groups make sense?”</span>
      </div>
    </div>
  );
}
