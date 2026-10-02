import { motion } from "framer-motion";
import { spring } from "../../design/motion";
import { colorAt } from "../../lib/colors";
import { AnimatedNumber } from "../glass";

/** Horizontal labelled bars (class balance, category counts, importances). */
export function BarList({ labels, values, colors, max, format = (v) => String(Math.round(v)), height = 22, ghost }: {
  labels: string[];
  values: number[];
  colors?: string[];
  max?: number;
  format?: (v: number) => string;
  height?: number;
  /** optional "before" values drawn as a faint ghost bar */
  ghost?: number[];
}) {
  const m = max ?? Math.max(1e-9, ...values.map(Math.abs), ...(ghost || []).map(Math.abs));
  return (
    <div className="col" style={{ gap: 7 }}>
      {labels.map((l, i) => {
        const v = values[i] ?? 0;
        const c = colors?.[i] ?? colorAt(i);
        return (
          <div key={l} className="row" style={{ gap: 10 }}>
            <span className="truncate small" style={{ width: 110, flexShrink: 0, color: "var(--text-2)" }} title={l}>{l}</span>
            <div style={{ flex: 1, height, position: "relative", background: "var(--fill)", borderRadius: 7, overflow: "hidden" }}>
              {ghost && (
                <motion.div style={{ position: "absolute", inset: 0, right: "auto", background: c, opacity: 0.18, borderRadius: 7 }}
                  animate={{ width: `${(Math.abs(ghost[i] ?? 0) / m) * 100}%` }} transition={spring.gentle} />
              )}
              <motion.div style={{ position: "absolute", inset: 0, right: "auto", background: c, borderRadius: 7, opacity: v < 0 ? 0.5 : 0.9 }}
                initial={{ width: 0 }} animate={{ width: `${(Math.abs(v) / m) * 100}%` }} transition={{ ...spring.gentle, delay: i * 0.03 }} />
            </div>
            <span className="num small" style={{ width: 64, textAlign: "right", fontWeight: 600 }}>
              <AnimatedNumber value={v} format={format} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Vertical class bars comparing before → after counts. */
export function ClassBars({ labels, before, after, colors, height = 160 }: { labels: string[]; before?: number[]; after: number[]; colors?: string[]; height?: number }) {
  const max = Math.max(1, ...after, ...(before || []));
  return (
    <div className="row" style={{ alignItems: "flex-end", gap: 14, height, padding: "0 4px" }}>
      {labels.map((l, i) => {
        const c = colors?.[i] ?? colorAt(i);
        return (
          <div key={l} className="col" style={{ alignItems: "center", gap: 6, flex: 1, minWidth: 0, height: "100%", justifyContent: "flex-end" }}>
            <span className="num small" style={{ fontWeight: 650 }}><AnimatedNumber value={after[i] ?? 0} /></span>
            <div style={{ position: "relative", width: "100%", maxWidth: 64, flex: 1, display: "flex", alignItems: "flex-end" }}>
              {before && (
                <motion.div style={{ position: "absolute", bottom: 0, left: 0, right: 0, borderRadius: 10, border: `2px dashed ${c}`, opacity: 0.45 }}
                  animate={{ height: `${((before[i] ?? 0) / max) * 100}%` }} transition={spring.gentle} />
              )}
              <motion.div style={{ width: "100%", borderRadius: 10, background: `linear-gradient(180deg, ${c}, ${c}cc)`, boxShadow: `0 6px 18px ${c}55` }}
                initial={{ height: 0 }} animate={{ height: `${((after[i] ?? 0) / max) * 100}%` }} transition={{ ...spring.gentle, delay: i * 0.05 }} />
            </div>
            <span className="small truncate muted" style={{ maxWidth: "100%" }} title={l}>{l}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Segmented bar for train / validation / test split sizes. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row" style={{ height: 30, borderRadius: 10, overflow: "hidden", gap: 3 }}>
        {parts.map((p) => (
          <motion.div key={p.label} animate={{ flexGrow: p.value / total }} transition={spring.gentle}
            style={{ flexBasis: 0, height: "100%", background: p.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11.5, fontWeight: 650, minWidth: p.value ? 34 : 0, overflow: "hidden" }}>
            {Math.round((p.value / total) * 100)}%
          </motion.div>
        ))}
      </div>
      <div className="row small" style={{ gap: 16 }}>
        {parts.map((p) => (
          <span key={p.label} className="row" style={{ gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} />
            <span className="muted">{p.label}</span>
            <b className="num">{p.value.toLocaleString()}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
