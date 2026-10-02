import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../design/motion";
import { useUI } from "../../lib/store";
import type { PipelineSpec } from "../../lib/types";
import { SplitBar } from "../charts";
import { Segmented, Slider } from "../glass";
import type { CardProps } from "./CleanCard";
import { STAGE_ICONS, stageState } from "./FlowStrip";
import { Note, StageCard, SubHead } from "./StageCard";
import { estimateFeatures, fmtInt, patchPipeline } from "./state";

const HOLD_COLORS = { explore: "#0A84FF", held: "#FF9F0A" };

/** Unsupervised projects: optionally keep a few rows aside to check the structure on rows the model never saw. */
export function HoldoutCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec, dataset, report, project } = ctx;
  const h = spec.unsupervised?.holdout ?? 0;
  const n = report?.splits ? report.splits.train + report.splits.test : dataset?.n_rows ?? 0;
  const held = Math.round(n * h);
  const what = project.task === "clustering" ? "the groups" : project.task === "anomaly" ? "the alarm" : "the map";
  return (
    <StageCard
      id="holdout" icon={STAGE_ICONS.holdout} title="Hold-out rows (optional)" open={open} onToggle={onToggle} flash={flash}
      summary={stageState("holdout", spec, false)}
      why={<>There's no answer to cheat on, so no test set is needed. But you <i>can</i> keep a few rows aside to check {what} still work on rows the model never saw.</>}
      info="With 0% every row is used for discovery — the usual choice when exploring. With a hold-out, the model is fitted on the rest and the held-out rows are assigned afterwards (nearest group, map position or anomaly score), so you can see whether the structure is real or a fluke of these particular rows."
    >
      <div className="row wrap" style={{ gap: 20, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 12, flex: "1 1 260px" }}>
          <Slider label="Keep aside" help="Share of rows the model won't see while it discovers structure. 0% = use everything." value={h} min={0} max={0.3} step={0.01}
            format={(v) => (v ? `${Math.round(v * 100)}%` : "0% · use all")} onChange={(v) => patchPipeline("unsupervised", { holdout: Math.round(v * 100) / 100 })} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={h ? "on" : "off"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              {h ? (
                <Note icon="🫙">{fmtInt(held)} rows go in the jar. After discovery they're scored separately — if the results look alike, {what} generalise.</Note>
              ) : (
                <Note icon="🔭">Every row helps discover the structure. Perfect for exploring — add a hold-out later if you want a reality check.</Note>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="inset" style={{ flex: "1 1 260px", padding: 14 }}>
          <SplitBar parts={[
            { label: "Discover on", value: Math.max(0, n - held), color: HOLD_COLORS.explore },
            { label: "Held out", value: held, color: HOLD_COLORS.held },
          ]} />
          {n > 0 && <div className="tiny faint" style={{ marginTop: 8 }}>{report ? "From the last run" : "Estimated"} · {fmtInt(n)} rows.</div>}
        </div>
      </div>
    </StageCard>
  );
}

/** "PCA kept 5 components explaining 92% of the variation." → numbers, from the last run's warnings. */
function lastPca(warnings: string[] | undefined): { k: number; pct: number } | null {
  for (const w of warnings ?? []) {
    const m = /PCA kept (\d+) components? explaining (\d+)%/.exec(w);
    if (m) return { k: Number(m[1]), pct: Number(m[2]) };
  }
  return null;
}

/** Optional PCA step after scaling/selection — for every tabular project. */
export function ReduceCard({ ctx, open, onToggle, flash }: CardProps) {
  const { spec, report } = ctx;
  const rd = spec.reduce ?? { method: "none" as const, n_components: 5 };
  const on = rd.method === "pca";
  const fs = spec.feature_select;
  let base = report && !on && report.n_features ? report.n_features : estimateFeatures(ctx);
  if (!ctx.unsup && fs.method !== "none" && fs.method !== "variance") base = Math.min(base, fs.k);
  const maxK = Math.max(1, Math.min(30, base));
  const k = Math.min(rd.n_components, maxK);
  const last = on ? lastPca(report?.warnings) : null;
  return (
    <StageCard
      id="reduce" icon={STAGE_ICONS.reduce} title="Reduce (PCA)" open={open} onToggle={onToggle} flash={flash}
      summary={stageState("reduce", { ...spec, reduce: { ...rd, n_components: k } }, false)}
      why="Keep the strongest directions; drop noise. PCA rolls many overlapping columns into a few new ones that carry most of the information."
      info="Principal Component Analysis finds the directions along which your rows vary most (after scaling). It keeps the top few and throws away the small wobbles, which are often noise. It's fitted on the training rows only. The new columns are called PC1, PC2… — mixtures of your original columns."
    >
      <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 14, flex: "1 1 260px" }}>
          <Segmented<NonNullable<PipelineSpec["reduce"]>["method"]>
            value={rd.method}
            onChange={(v) => patchPipeline("reduce", { method: v, n_components: Math.min(rd.n_components, maxK) })}
            options={[{ value: "none", label: "Keep my columns" }, { value: "pca", label: "🗜️ PCA" }]}
          />
          <AnimatePresence initial={false}>
            {on && (
              <motion.div key="k" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }} className="col">
                <div className="col" style={{ gap: 12 }}>
                  <Slider label={`Keep ${k} of ~${base} directions`} help="Fewer = more squashing (less noise, but some detail is lost). Watch the share of variation kept after running." value={k} min={1} max={Math.max(2, maxK)} integer
                    onChange={(v) => patchPipeline("reduce", { method: "pca", n_components: v })} />
                  {last ? (
                    <div className="col" style={{ gap: 6 }}>
                      <SubHead info="How much of the original spread between rows the kept directions still describe.">Last run</SubHead>
                      <KeptMeter pct={last.pct} k={last.k} />
                    </div>
                  ) : (
                    <span className="tiny faint">Run the preparation to see how much of the variation {k} direction{k === 1 ? "" : "s"} keep.</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!on && (
            <span className="small muted" style={{ lineHeight: 1.5 }}>
              {ctx.unsup
                ? "Handy when you have many overlapping columns: distances get less noisy and clusters often get crisper."
                : "Handy for wide tables with many related columns. Tree models rarely need it; linear models and neural nets sometimes like it."}
            </span>
          )}
          {on && base <= 2 && <Note icon="ℹ️">You only have about {base} feature{base === 1 ? "" : "s"} — there's not much to squash.</Note>}
        </div>
        <div style={{ flex: "1 1 260px" }}><ReduceDemo on={on} k={k} /></div>
      </div>
    </StageCard>
  );
}

function KeptMeter({ pct, k }: { pct: number; k: number }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div style={{ height: 10, borderRadius: 6, background: "var(--fill-2)", overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={spring.gentle}
          style={{ height: "100%", borderRadius: 6, background: "var(--grad)" }} />
      </div>
      <span className="small muted"><b className="num" style={{ color: "var(--text)" }}>{k}</b> direction{k === 1 ? "" : "s"} keep <b className="num" style={{ color: "var(--text)" }}>{pct}%</b> of the variation{pct < 70 ? " — quite a lot is lost; try keeping more." : pct > 97 ? " — almost everything; you could squash further." : "."}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ illustration */

const DW = 260, DH = 150;

/** A stretched cloud with its two principal directions; with PCA on, dots slide onto the long direction (the wobble is dropped). */
function ReduceDemo({ on, k }: { on: boolean; k: number }) {
  const reduce = useUI((s) => s.reduceMotion);
  const pts = useMemo(() => {
    let seed = 3;
    const rnd = () => { const x = Math.sin(++seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const ang = -0.52, ca = Math.cos(ang), sa = Math.sin(ang);
    return Array.from({ length: 42 }, () => {
      const u = (rnd() - 0.5) * 190, v = (rnd() - 0.5) * 46;
      return { x: DW / 2 + u * ca - v * sa, y: DH / 2 + u * sa + v * ca, px: DW / 2 + u * ca, py: DH / 2 + u * sa };
    });
  }, []);
  const [flat, setFlat] = useState(false);
  useEffect(() => {
    if (!on) { setFlat(false); return; }
    setFlat(true);
    if (reduce || k > 1) return;
    const t = setInterval(() => setFlat((f) => !f), 2400);
    return () => clearInterval(t);
  }, [on, k, reduce]);
  // with 2+ directions kept the cloud keeps its width (only finer wobbles are dropped)
  const squash = flat && k === 1;
  const ang = -0.52;
  const L = (len: number, a: number) => ({ x2: DW / 2 + Math.cos(a) * len, y2: DH / 2 + Math.sin(a) * len });
  return (
    <div className="inset" style={{ padding: 10 }}>
      <svg viewBox={`0 0 ${DW} ${DH}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <marker id="pca-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
          </marker>
          <marker id="pca-arrow2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#BF5AF2" />
          </marker>
        </defs>
        {pts.map((p, i) => (
          <motion.circle key={i} r={3.6} fill="#0A84FF" fillOpacity={0.75} stroke="var(--bg)" strokeWidth={0.9}
            initial={false} animate={{ cx: squash ? p.px : p.x, cy: squash ? p.py : p.y }}
            transition={{ ...spring.gentle, delay: reduce ? 0 : (i % 8) * 0.02 }} />
        ))}
        <motion.line x1={DW / 2} y1={DH / 2} {...L(96, ang)} stroke="var(--accent)" strokeWidth={2.6} strokeLinecap="round" markerEnd="url(#pca-arrow)"
          animate={{ opacity: on ? 1 : 0.55 }} />
        <motion.line x1={DW / 2} y1={DH / 2} {...L(26, ang - Math.PI / 2)} stroke="#BF5AF2" strokeWidth={2.2} strokeLinecap="round" markerEnd="url(#pca-arrow2)"
          animate={{ opacity: on && k === 1 ? 0.25 : on ? 1 : 0.55 }} />
        <text x={DW / 2 + Math.cos(ang) * 96 - 2} y={DH / 2 + Math.sin(ang) * 96 + 18} fontSize={10.5} fontWeight={700} fill="var(--accent)" textAnchor="end">PC1 · strong</text>
        <text x={DW / 2 + Math.cos(ang - Math.PI / 2) * 30 - 4} y={DH / 2 + Math.sin(ang - Math.PI / 2) * 30 - 6} fontSize={10} fontWeight={650} fill="#BF5AF2" textAnchor="end">PC2 · wobble</text>
      </svg>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${on}-${squash}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="tiny faint" style={{ textAlign: "center", marginTop: 4 }}>
          {!on ? "Your rows vary a lot along one direction and only a little along the other."
            : squash ? "Keeping 1 direction: every dot slides onto PC1 — the small wobble is dropped."
              : `Keeping ${k} directions: the main shape stays, tiny leftover wobbles are dropped.`}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
