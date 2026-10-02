import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { spring } from "../../design/motion";
import { AnimatedNumber, InfoTip } from "../glass";
import { textOn } from "./contrast";

/** Small click-to-expand section with a rotating chevron and height animation. */
export function Disclosure({ title, children, defaultOpen = false, open: openProp, onToggle, right }: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  right?: ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const [settled, setSettled] = useState(defaultOpen);
  const open = openProp ?? own;
  const toggle = () => { setOwn(!open); setSettled(false); onToggle?.(!open); };
  useEffect(() => { if (!open) setSettled(false); }, [open]);
  return (
    <div className="col" style={{ gap: 0 }}>
      <div className="row between">
        <button className="btn ghost sm" onClick={toggle} style={{ paddingLeft: 6, marginLeft: -6, gap: 6 }} aria-expanded={open}>
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring.snappy} style={{ display: "inline-block", fontSize: 10 }}>▶</motion.span>
          {title}
        </button>
        {right}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            onAnimationComplete={() => open && setSettled(true)}
            style={{ overflow: settled && open ? "visible" : "hidden" }}
          >
            <div style={{ paddingTop: 10 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Number input that may be left empty (→ null). */
export function OptionalNumber({ value, onChange, placeholder, width = 90 }: { value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; width?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (s: string) => {
    const t = s.trim();
    if (t === "") onChange(null);
    else if (!Number.isNaN(Number(t))) onChange(Number(t));
    setDraft(null);
  };
  return (
    <input
      className="input num"
      type="number"
      placeholder={placeholder}
      value={draft ?? (value === null || value === undefined ? "" : String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      style={{ width }}
    />
  );
}

export function SectionTitle({ icon, title, help, right, sub }: { icon?: ReactNode; title: ReactNode; help?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="row between" style={{ marginBottom: 12, alignItems: "flex-start" }}>
      <div className="col" style={{ gap: 2 }}>
        <h3 className="row" style={{ gap: 8 }}>
          {icon && <span>{icon}</span>}
          {title}
          {help && <InfoTip text={help} />}
        </h3>
        {sub && <span className="small muted">{sub}</span>}
      </div>
      {right}
    </div>
  );
}

/** Bars growing left (negative) or right (positive) from a centre line — for correlations. */
export function DivergingBars({ items, max = 1, height = 20 }: { items: { label: string; value: number }[]; max?: number; height?: number }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      {items.map((it, i) => {
        const w = Math.min(1, Math.abs(it.value) / (max || 1)) * 50;
        const pos = it.value >= 0;
        const c = pos ? "var(--accent)" : "#FF375F";
        return (
          <div key={it.label} className="row" style={{ gap: 10 }}>
            <span className="truncate small" style={{ width: 120, flexShrink: 0, color: "var(--text-2)" }} title={it.label}>{it.label}</span>
            <div style={{ flex: 1, height, position: "relative", background: "var(--fill)", borderRadius: 7, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: "50%", top: 2, bottom: 2, width: 1, background: "var(--hairline)" }} />
              <motion.div
                style={{ position: "absolute", top: 0, bottom: 0, background: c, opacity: 0.85, borderRadius: 6, ...(pos ? { left: "50%" } : { right: "50%" }) }}
                initial={{ width: 0 }}
                animate={{ width: `${w}%` }}
                transition={{ ...spring.gentle, delay: i * 0.03 }}
              />
            </div>
            <span className="num small" style={{ width: 52, textAlign: "right", fontWeight: 600, color: pos ? "var(--text)" : "var(--text-2)" }}>
              <AnimatedNumber value={it.value} format={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Thin horizontal meter (e.g. share of missing values). */
export function Meter({ value, color = "var(--warning)", width = 60 }: { value: number; color?: string; width?: number }) {
  return (
    <div style={{ width, height: 5, borderRadius: 5, background: "var(--fill-2)", overflow: "hidden" }}>
      <motion.div style={{ height: "100%", background: color, borderRadius: 5 }} initial={{ width: 0 }} animate={{ width: `${Math.min(1, value) * 100}%` }} transition={spring.gentle} />
    </div>
  );
}

/** Horizontal stacked bar of shares (class balance in the designer). */
export function ShareBar({ labels, shares, colors }: { labels: string[]; shares: number[]; colors: string[] }) {
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="row" style={{ height: 26, borderRadius: 9, overflow: "hidden", gap: 2 }}>
      {labels.map((l, i) => (
        <motion.div key={i} animate={{ flexGrow: shares[i] / total }} transition={spring.gentle}
          title={`${l}: ${Math.round((shares[i] / total) * 100)}%`}
          style={{ flexBasis: 0, height: "100%", background: colors[i], display: "flex", alignItems: "center", justifyContent: "center", color: textOn(colors[i]), fontSize: 11, fontWeight: 650, overflow: "hidden", whiteSpace: "nowrap", minWidth: 4 }}>
          {shares[i] / total > 0.09 ? `${Math.round((shares[i] / total) * 100)}%` : ""}
        </motion.div>
      ))}
    </div>
  );
}
