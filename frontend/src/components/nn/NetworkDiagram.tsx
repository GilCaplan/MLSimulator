import { motion } from "framer-motion";
import { useMemo } from "react";
import type { NNArch } from "../../lib/types";
import { useSize } from "../charts/util";

export interface DiagramLayer { label: string; units: number; kind: "input" | "dense" | "conv" | "attention" | "graph" | "output" }

/** Derive drawable columns from an architecture (sizes capped for display). */
export function archToLayers(arch: NNArch | null | undefined, nFeatures = 8, nOut = 2): DiagramLayer[] {
  const out: DiagramLayer[] = [{ label: `Input · ${nFeatures}`, units: nFeatures, kind: "input" }];
  if (!arch) return out;
  if (arch.kind === "ft_transformer") {
    for (let i = 0; i < (arch.n_blocks ?? 2); i++) out.push({ label: `Attention ${i + 1} · ${arch.n_heads ?? 4} heads`, units: arch.d_token ?? 32, kind: "attention" });
  } else if (arch.kind === "gcn") {
    for (const [i, h] of (arch.hidden ?? []).entries()) out.push({ label: `Graph conv ${i + 1} · ${h}`, units: h, kind: "graph" });
  } else {
    for (const l of arch.layers ?? []) {
      if (l.type === "conv") out.push({ label: `Conv · ${l.filters} filters`, units: l.filters, kind: "conv" });
      else out.push({ label: `Dense · ${l.units}`, units: l.units, kind: "dense" });
    }
  }
  out.push({ label: `Output · ${nOut}`, units: nOut, kind: "output" });
  return out;
}

const KIND_COLOR: Record<DiagramLayer["kind"], string> = {
  input: "#64D2FF", dense: "#0A84FF", conv: "#FF9F0A", attention: "#BF5AF2", graph: "#30D158", output: "#FF375F",
};

/**
 * Animated neural-network diagram. Neurons per layer are capped (with a "+N" badge);
 * edges are sampled. When `weights` snapshots are supplied (one matrix per linear layer,
 * up to 8×8), edge colour/thickness follow the actual weights. `training` sends pulses
 * travelling along the edges.
 */
export function NetworkDiagram({ layers, height = 280, training = false, weights, speed = 1, compact = false }: {
  layers: DiagramLayer[];
  height?: number;
  training?: boolean;
  weights?: number[][][];
  speed?: number;
  compact?: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const MAXN = compact ? 6 : 9;
  const labelH = compact ? 0 : 34;
  const geo = useMemo(() => {
    if (!width) return null;
    const n = layers.length;
    const padX = 40;
    const xs = layers.map((_, i) => (n === 1 ? width / 2 : padX + (i * (width - 2 * padX)) / (n - 1)));
    const usable = height - labelH - 24;
    const cols = layers.map((l, i) => {
      const shown = Math.min(l.units, MAXN);
      const gap = Math.min(30, usable / Math.max(shown, 1));
      const top = 12 + (usable - gap * (shown - 1)) / 2;
      return { x: xs[i], ys: Array.from({ length: shown }, (_, k) => top + k * gap), hidden: Math.max(0, l.units - shown) };
    });
    const edges: { x1: number; y1: number; x2: number; y2: number; w: number; li: number }[] = [];
    for (let li = 0; li < cols.length - 1; li++) {
      const a = cols[li], b = cols[li + 1];
      const W = weights?.[li];
      for (let i = 0; i < a.ys.length; i++) {
        for (let j = 0; j < b.ys.length; j++) {
          const w = W?.[j]?.[i] ?? ((((i * 7 + j * 13 + li * 5) % 11) / 11) - 0.5) * 0.6;
          edges.push({ x1: a.x, y1: a.ys[i], x2: b.x, y2: b.ys[j], w, li });
        }
      }
    }
    return { cols, edges };
  }, [width, height, layers, weights, MAXN, labelH]);

  const maxW = useMemo(() => Math.max(0.05, ...(geo?.edges.map((e) => Math.abs(e.w)) ?? [1])), [geo]);
  const pulses = useMemo(() => (geo ? geo.edges.filter((_, i) => i % Math.max(1, Math.floor(geo.edges.length / 26)) === 0).slice(0, 30) : []), [geo]);

  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
      {geo && (
        <svg width={width} height={height}>
          <defs>
            <filter id="nn-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>
          {geo.edges.map((e, i) => {
            const mag = Math.abs(e.w) / maxW;
            return (
              <motion.line key={`e${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke={weights ? (e.w >= 0 ? "#0A84FF" : "#FF375F") : "var(--text-3)"}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: weights ? 0.12 + 0.7 * mag : 0.22, strokeWidth: weights ? 0.4 + 2.6 * mag : 0.8 }}
                transition={{ pathLength: { duration: 0.6, delay: e.li * 0.12 }, opacity: { duration: 0.6 }, strokeWidth: { duration: 0.6 } }} />
            );
          })}
          {training && pulses.map((e, i) => (
            <motion.circle key={`p${i}`} r={2.6} fill="#fff" filter="url(#nn-glow)"
              initial={{ cx: e.x1, cy: e.y1, opacity: 0 }}
              animate={{ cx: [e.x1, e.x2], cy: [e.y1, e.y2], opacity: [0, 1, 0] }}
              transition={{ duration: 1.1 / speed, repeat: Infinity, delay: (i % 10) * 0.12 + e.li * 0.25, ease: "easeInOut" }} />
          ))}
          {training && pulses.map((e, i) => (
            <motion.circle key={`pc${i}`} r={1.6} fill={KIND_COLOR.dense}
              initial={{ cx: e.x1, cy: e.y1, opacity: 0 }}
              animate={{ cx: [e.x1, e.x2], cy: [e.y1, e.y2], opacity: [0, 1, 0] }}
              transition={{ duration: 1.1 / speed, repeat: Infinity, delay: (i % 10) * 0.12 + e.li * 0.25, ease: "easeInOut" }} />
          ))}
          {geo.cols.map((c, li) => {
            const color = KIND_COLOR[layers[li].kind];
            return (
              <g key={`c${li}`}>
                {c.ys.map((y, k) => (
                  <motion.g key={k} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20, delay: li * 0.08 + k * 0.02 }} style={{ originX: `${c.x}px`, originY: `${y}px` }}>
                    {layers[li].kind === "conv" ? (
                      <rect x={c.x - 7} y={y - 7} width={14} height={14} rx={3.5} fill={color} stroke="white" strokeWidth={1.5} />
                    ) : (
                      <circle cx={c.x} cy={y} r={7} fill={color} stroke="white" strokeWidth={1.5} />
                    )}
                    {training && (
                      <motion.circle cx={c.x} cy={y} r={7} fill="none" stroke={color} animate={{ r: [7, 12], opacity: [0.6, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: li * 0.2 + k * 0.1 }} />
                    )}
                  </motion.g>
                ))}
                {c.hidden > 0 && (
                  <text x={c.x} y={(c.ys[c.ys.length - 1] ?? 0) + 20} textAnchor="middle" fontSize={10} fill="var(--text-3)">+{c.hidden}</text>
                )}
                {!compact && (() => {
                  const [head, tail] = layers[li].label.split(" · ");
                  const fs = layers.length > 6 ? 9.5 : 10.5;
                  return (
                    <text x={c.x} y={height - (tail ? 20 : 12)} textAnchor="middle" fontSize={fs} fontWeight={600} fill="var(--text-2)">
                      <tspan x={c.x}>{head}</tspan>
                      {tail && <tspan x={c.x} dy={fs + 2} fontWeight={500} fill="var(--text-3)">{tail}</tspan>}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
