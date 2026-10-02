import { motion } from "framer-motion";
import { useId, useMemo } from "react";
import { spring } from "../../../design/motion";
import { useSize } from "../../charts";
import { AnimatedNumber } from "../../glass";
import { fmtInt, headSize } from "./ratingsData";

/* ------------------------------------------------------------------ long tail */

/**
 * Item popularity sorted from the most- to the least-rated item. The few items on the left ("blockbusters") collect half
 * of all ratings; the long flat stretch on the right is the niche "long tail".
 */
export function LongTailChart({ values, height = 190, share = 0.5, unit = "ratings", overlay }: {
  values: number[];
  height?: number;
  /** share of all ratings that defines the head */
  share?: number;
  unit?: string;
  /** optional second series on the same item ranking (e.g. after filtering) */
  overlay?: number[];
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const uid = useId().replace(/:/g, "");
  const n = values.length;
  const head = headSize(values, share);
  const max = Math.max(1, ...values.slice(0, 3), ...(overlay ?? []).slice(0, 3));
  const PADL = 34, PADR = 8, PADT = 26, PADB = 22;
  const w = Math.max(10, width - PADL - PADR), h = height - PADT - PADB;
  const x = (i: number) => PADL + (n <= 1 ? 0 : (i / (n - 1)) * w);
  const y = (v: number) => PADT + h - (v / max) * h;
  const path = useMemo(() => {
    if (!n || width <= 0) return { area: "", line: "" };
    const step = Math.max(1, Math.floor(n / 260));
    const idx: number[] = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    const line = idx.map((i, k) => `${k ? "L" : "M"} ${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`).join(" ");
    return { line, area: `${line} L ${x(n - 1).toFixed(1)} ${PADT + h} L ${PADL} ${PADT + h} Z` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, width, height]);
  const overlayLine = useMemo(() => {
    if (!overlay?.length || width <= 0) return "";
    const m = overlay.length;
    const step = Math.max(1, Math.floor(m / 260));
    const pts: string[] = [];
    for (let i = 0; i < m; i += step) pts.push(`${pts.length ? "L" : "M"} ${(PADL + (m <= 1 ? 0 : (i / (m - 1)) * w)).toFixed(1)} ${y(overlay[i]).toFixed(1)}`);
    return pts.join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, width, height]);
  const xh = x(Math.max(0, head - 1));
  const headPct = n ? head / n : 0;
  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
      {width > 0 && n > 1 && (
        <svg width={width} height={height} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={`lt-head-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#FF9F0A" stopOpacity={0.75} />
              <stop offset="100%" stopColor="#FF375F" stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id={`lt-tail-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5E5CE6" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#64D2FF" stopOpacity={0.15} />
            </linearGradient>
            <clipPath id={`lt-reveal-${uid}`}>
              <motion.rect x={0} y={0} height={height} initial={{ width: 0 }} animate={{ width }} transition={{ duration: 1.1, ease: [0.32, 0.72, 0, 1] }} />
            </clipPath>
            <clipPath id={`lt-h-${uid}`}><rect x={0} y={0} width={xh} height={height} /></clipPath>
            <clipPath id={`lt-t-${uid}`}><rect x={xh} y={0} width={width} height={height} /></clipPath>
          </defs>
          {/* y axis: most ratings */}
          <line x1={PADL} x2={PADL + w} y1={PADT + h} y2={PADT + h} stroke="var(--hairline)" />
          <text x={PADL - 6} y={PADT + 4} fontSize={10} fill="var(--text-3)" textAnchor="end">{fmtInt(max)}</text>
          <text x={PADL - 6} y={PADT + h} fontSize={10} fill="var(--text-3)" textAnchor="end">0</text>
          <g clipPath={`url(#lt-reveal-${uid})`}>
            <path d={path.area} fill={`url(#lt-head-${uid})`} clipPath={`url(#lt-h-${uid})`} />
            <path d={path.area} fill={`url(#lt-tail-${uid})`} clipPath={`url(#lt-t-${uid})`} />
            <path d={path.line} fill="none" stroke="var(--text-2)" strokeWidth={1.4} strokeLinejoin="round" opacity={0.8} />
            {overlayLine && <path d={overlayLine} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeDasharray="4 3" />}
          </g>
          {/* head / tail divider and labels */}
          <motion.line x1={xh} x2={xh} y1={PADT - 8} y2={PADT + h} stroke="var(--text-3)" strokeWidth={1.2} strokeDasharray="3 3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} />
          <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.9 }}>
            <text x={Math.max(PADL + 2, xh - 6)} y={PADT - 12} fontSize={11} fontWeight={700} fill="#FF9F0A" textAnchor="end">🍿 Blockbusters</text>
            <text x={xh + 8} y={PADT - 12} fontSize={11} fontWeight={700} fill="#5E5CE6">🔭 The long tail — niche picks</text>
          </motion.g>
          <text x={PADL} y={height - 5} fontSize={10} fill="var(--text-3)">most {unit}</text>
          <text x={PADL + w} y={height - 5} fontSize={10} fill="var(--text-3)" textAnchor="end">fewest {unit} → each step is one item</text>
          {headPct < 0.5 && <text x={xh + 8} y={PADT + 12} fontSize={10} fill="var(--text-3)">{fmtInt(n - head)} items share the other half</text>}
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ sparsity */

/** A little grid of people × items where only the rated cells light up — how empty the ratings table really is. */
export function SparsityGrid({ sparsity, cols = 16, rows = 7, size = 7, gap = 3 }: { sparsity: number; cols?: number; rows?: number; size?: number; gap?: number }) {
  const N = cols * rows;
  const filled = sparsity >= 1 ? 0 : Math.max(1, Math.round((1 - sparsity) * N));
  // deterministic scatter of the filled cells (denser on the left: popular items get more ratings)
  const on = useMemo(() => {
    const scored = Array.from({ length: N }, (_, i) => {
      const c = i % cols;
      const r = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
      return { i, s: (r - Math.floor(r)) * (0.55 + (c / cols) * 0.9) };
    }).sort((a, b) => a.s - b.s);
    return new Set(scored.slice(0, filled).map((d) => d.i));
  }, [N, cols, filled]);
  return (
    <svg width={cols * (size + gap) - gap} height={rows * (size + gap) - gap} aria-label={`${Math.round(sparsity * 100)}% of the grid is empty`}>
      {Array.from({ length: N }, (_, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const lit = on.has(i);
        return (
          <motion.rect key={i} x={c * (size + gap)} y={r * (size + gap)} width={size} height={size} rx={size / 2}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1, fill: lit ? "#FFB800" : "rgba(120,120,128,0.18)" }}
            transition={{ ...spring.snappy, delay: lit ? 0.3 + (i % 23) * 0.015 : (c + r) * 0.008 }}
            style={{ originX: `${c * (size + gap) + size / 2}px`, originY: `${r * (size + gap) + size / 2}px` }} />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ star bars */

const STAR_RAMP = ["#FF453A", "#FF9F0A", "#FFD60A", "#9BDB4D", "#30D158"];

/** Vertical bars per rating value (1★ … 5★). With `positive`, bars at or above it are "liked" and the rest fade. */
export function StarBars({ labels, counts, positive, height = 150, onPick }: {
  labels: string[];
  counts: number[];
  positive?: number | null;
  height?: number;
  /** click a bar (e.g. to set the "liked" threshold) */
  onPick?: (value: number) => void;
}) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(1, ...counts);
  const vals = labels.map(Number);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (
    <div className="row" style={{ gap: 8, alignItems: "flex-end", height }}>
      {labels.map((l, i) => {
        const v = vals[i];
        const t = hi > lo ? (v - lo) / (hi - lo) : 1;
        const base = STAR_RAMP[Math.min(STAR_RAMP.length - 1, Math.round(t * (STAR_RAMP.length - 1)))];
        const liked = positive === undefined || positive === null ? true : v >= positive;
        const share = counts[i] / total;
        return (
          <motion.div key={l} className="col" style={{ flex: 1, gap: 5, alignItems: "stretch", height: "100%", justifyContent: "flex-end", cursor: onPick ? "pointer" : "default", minWidth: 0 }}
            onClick={() => onPick?.(v)} whileHover={onPick ? { y: -2 } : undefined}>
            <span className="tiny num" style={{ textAlign: "center", fontWeight: 650, color: liked ? "var(--text)" : "var(--text-3)" }}>
              <AnimatedNumber value={share * 100} format={(x) => `${x.toFixed(0)}%`} />
            </span>
            <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "flex-end" }}>
              <motion.div style={{ width: "100%", borderRadius: "8px 8px 4px 4px" }}
                initial={{ height: 0 }}
                animate={{ height: `${(counts[i] / max) * 100}%`, background: liked ? base : "rgba(142,142,147,0.35)", opacity: liked ? 0.92 : 0.7 }}
                transition={{ ...spring.gentle, delay: i * 0.05 }} />
            </div>
            <span className="tiny" style={{ textAlign: "center", fontWeight: 650, color: "var(--text-2)", whiteSpace: "nowrap" }}>
              {Number.isInteger(v) && v >= 1 && v <= 10 && hi <= 10 ? `${l}★` : l}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Mean rating from a value histogram. */
export function meanRating(labels: string[], counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return labels.reduce((a, l, i) => a + Number(l) * counts[i], 0) / total;
}
