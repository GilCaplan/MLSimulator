import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef } from "react";
import { spring } from "../../design/motion";
import type { NNArch } from "../../lib/types";
import { Slider } from "../glass";
import { ActivationField } from "./LayerBuilder";

const pctFmt = (v: number) => `${Math.round(v * 100)}%`;

/** Tabular transformer: a handful of sliders, each with a plain explanation. */
export function TransformerBuilder({ arch, onChange }: { arch: NNArch; onChange: (a: NNArch) => void }) {
  const set = (p: Partial<NNArch>) => onChange({ ...arch, ...p });
  const heads = arch.n_heads ?? 4;
  const d = arch.d_token ?? 32;
  const effective = Math.max(heads, Math.floor(d / heads) * heads);
  return (
    <div className="col" style={{ gap: 16 }}>
      <p className="small muted" style={{ lineHeight: 1.55 }}>
        Each column of your data becomes a <b>token</b> — a little vector describing it. <b>Attention</b> lets every token look at every
        other one and decide which features matter together, the same trick that powers language models.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 22px" }}>
        <Slider label="Token size" help="How many numbers describe each feature. Bigger = richer, but slower and easier to overfit."
          value={d} min={8} max={128} log integer onChange={(v) => set({ d_token: v })} />
        <Slider label="Blocks" help="How many attention + feed-forward rounds the tokens go through."
          value={arch.n_blocks ?? 2} min={1} max={6} integer onChange={(v) => set({ n_blocks: v })} />
        <Slider label="Attention heads" help="Several heads can each focus on a different kind of relationship at the same time."
          value={heads} min={1} max={8} integer onChange={(v) => set({ n_heads: v })} />
        <Slider label="Feed-forward width" help="How much the small network inside each block widens the token (× token size)."
          value={arch.ffn_mult ?? 2} min={1} max={4} integer format={(v) => `${v}×`} onChange={(v) => set({ ffn_mult: v })} />
        <Slider label="Dropout" help="Randomly drops connections while training to fight overfitting."
          value={arch.dropout ?? 0.1} min={0} max={0.5} step={0.05} format={pctFmt} onChange={(v) => set({ dropout: v })} />
      </div>
      <AnimatePresence>
        {effective !== d && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="small faint">
            Token size is rounded to a multiple of the heads, so it will really be <b className="num">{effective}</b>.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Graph network: k-NN graph size, hidden graph-conv layers, activation and dropout. */
export function GcnBuilder({ arch, onChange }: { arch: NNArch; onChange: (a: NNArch) => void }) {
  const set = (p: Partial<NNArch>) => onChange({ ...arch, ...p });
  const hidden = arch.hidden ?? [64, 32];
  const ids = useRef<string[]>([]);
  const counter = useRef(0);
  if (ids.current.length !== hidden.length) ids.current = hidden.map((_, i) => ids.current[i] ?? `H${counter.current++}`);
  const k = arch.k ?? 10;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 16, alignItems: "center" }}>
        <KnnGraph k={k} />
        <p className="small muted grow" style={{ lineHeight: 1.55 }}>
          Every row of your data becomes a dot, linked to its <b className="num">{k}</b> most similar rows. Each graph layer lets dots
          share information with their neighbours — so similar examples help each other get the right answer.
        </p>
      </div>
      <Slider label="Neighbours (k)" help="How many similar rows each row is connected to. Few = very local; many = smoother, more averaged."
        value={k} min={2} max={30} integer onChange={(v) => set({ k: v })} />

      <div className="col" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "#30D158" }} />
          <h4>Graph layers</h4>
          <span className="badge">{hidden.length}</span>
        </div>
        <AnimatePresence initial={false}>
          {hidden.map((h, i) => (
            <motion.div key={ids.current[i]} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }} transition={spring.snappy}
              className="inset row" style={{ padding: "8px 10px 8px 12px", borderLeft: "3px solid #30D158", gap: 12 }}>
              <span className="small" style={{ fontWeight: 650, width: 56 }}>Layer {i + 1}</span>
              <div className="grow">
                <Slider value={h} min={2} max={512} log integer onChange={(v) => set({ hidden: hidden.map((x, j) => (j === i ? v : x)) })} />
              </div>
              <button className="btn ghost sm icon danger" title="Remove layer" disabled={hidden.length <= 1}
                onClick={() => { ids.current = ids.current.filter((_, j) => j !== i); set({ hidden: hidden.filter((_, j) => j !== i) }); }}>✕</button>
            </motion.div>
          ))}
        </AnimatePresence>
        <motion.button layout whileTap={{ scale: 0.97 }} className="btn sm" style={{ alignSelf: "flex-start", borderStyle: "dashed" }} disabled={hidden.length >= 6}
          onClick={() => { ids.current = [...ids.current, `H${counter.current++}`]; set({ hidden: [...hidden, Math.max(4, Math.round((hidden[hidden.length - 1] ?? 32) / 2))] }); }}>
          + Add graph layer
        </motion.button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <ActivationField value={arch.activation ?? "relu"} onChange={(activation) => set({ activation })} />
        <Slider label="Dropout" help="Randomly drops signals while training to fight overfitting."
          value={arch.dropout ?? 0.3} min={0} max={0.7} step={0.05} format={pctFmt} onChange={(v) => set({ dropout: v })} />
      </div>
    </div>
  );
}

/** Tiny illustration: deterministic dots, each linked to its k nearest (capped for legibility). */
function KnnGraph({ k }: { k: number }) {
  const pts = useMemo(() => {
    let s = 3;
    const rnd = () => { const x = Math.sin(++s * 12.9898) * 43758.5453; return x - Math.floor(x); };
    return Array.from({ length: 16 }, () => ({ x: 10 + rnd() * 100, y: 10 + rnd() * 70 }));
  }, []);
  const shownK = Math.min(5, Math.max(1, Math.round(k / 5)));
  const edges = useMemo(() => {
    const out = new Set<string>();
    pts.forEach((p, i) => {
      const near = pts.map((q, j) => ({ j, d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, shownK);
      for (const n of near) out.add(i < n.j ? `${i}-${n.j}` : `${n.j}-${i}`);
    });
    return [...out];
  }, [pts, shownK]);
  return (
    <svg width={120} height={90} className="inset" style={{ flexShrink: 0, borderRadius: 14 }}>
      <AnimatePresence>
        {edges.map((e) => {
          const [a, b] = e.split("-").map(Number);
          return (
            <motion.line key={e} x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y} stroke="#30D158" strokeWidth={1.2}
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.55 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} />
          );
        })}
      </AnimatePresence>
      {pts.map((p, i) => (
        <motion.circle key={i} cx={p.x} cy={p.y} r={3.6} fill="#30D158" stroke="white" strokeWidth={1}
          animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.15 }} style={{ originX: `${p.x}px`, originY: `${p.y}px` }} />
      ))}
    </svg>
  );
}
