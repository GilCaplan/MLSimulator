import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "../../design/motion";
import { Glass, InfoTip } from "../glass";

export type StageId = "clean" | "features" | "encode" | "outliers" | "split" | "scale" | "select" | "balance" | "target";

/** Collapsible glass card for one pipeline stage. */
export function StageCard({ id, icon, title, why, info, summary, open, onToggle, flash, dim, children }: {
  id: StageId;
  icon: string;
  title: string;
  why: ReactNode;
  info?: ReactNode;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** briefly highlight (after the flow strip jumped here) */
  flash?: boolean;
  dim?: boolean;
  children: ReactNode;
}) {
  return (
    <Glass
      animate_in
      id={`stage-${id}`}
      pad={false}
      style={{ scrollMarginTop: 150, opacity: dim ? 0.72 : 1, transition: "box-shadow .4s, border-color .4s, opacity .3s", ...(flash ? { borderColor: "var(--accent)", boxShadow: "0 0 0 4px var(--accent-soft), var(--glass-shadow)" } : {}) }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 14, padding: "16px 20px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: "inherit" }}
      >
        <motion.span
          animate={{ scale: flash ? [1, 1.18, 1] : 1, rotate: flash ? [0, -8, 6, 0] : 0 }}
          transition={{ duration: 0.6 }}
          style={{ width: 40, height: 40, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: open ? "var(--accent-soft)" : "var(--fill)", flexShrink: 0, transition: "background .25s" }}
        >
          {icon}
        </motion.span>
        <span className="col grow" style={{ gap: 2 }}>
          <span className="row" style={{ gap: 8 }}>
            <b style={{ fontSize: 15.5 }}>{title}</b>
            {info && <span onClick={(e) => e.stopPropagation()}><InfoTip text={info} /></span>}
          </span>
          <span className="small muted" style={{ lineHeight: 1.45 }}>{why}</span>
        </span>
        {summary !== undefined && <span className="badge accent" style={{ whiteSpace: "nowrap" }}>{summary}</span>}
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring.snappy} className="faint" style={{ fontSize: 16, width: 16, textAlign: "center" }}>›</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: spring.gentle, opacity: { duration: 0.2 } }}
            style={{ overflow: "hidden" }}
          >
            <div className="col" style={{ gap: 18, padding: "2px 20px 20px" }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Glass>
  );
}

/** Grid of selectable option tiles (used for modes and techniques). */
export function ChoiceGrid<T extends string>({ value, options, onChange, min = 150, compact }: {
  value: T;
  options: { value: T; icon?: ReactNode; label: ReactNode; blurb?: ReactNode; tag?: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  min?: number;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <motion.button
            key={o.value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            whileHover={o.disabled ? undefined : { y: -2 }}
            whileTap={o.disabled ? undefined : { scale: 0.97 }}
            transition={spring.snappy}
            className="inset"
            style={{
              position: "relative", textAlign: "left", padding: compact ? "10px 12px" : "12px 14px", cursor: o.disabled ? "not-allowed" : "pointer",
              opacity: o.disabled ? 0.45 : 1, color: "inherit", display: "flex", flexDirection: "column", gap: 4,
              borderColor: active ? "var(--accent)" : "var(--hairline)",
              background: active ? "var(--accent-soft)" : "var(--fill)",
              boxShadow: active ? "0 0 0 3px var(--accent-soft)" : "none",
              transition: "border-color .2s, background .2s, box-shadow .2s",
            }}
          >
            <span className="row" style={{ gap: 8 }}>
              {o.icon && <span style={{ fontSize: compact ? 15 : 18 }}>{o.icon}</span>}
              <b style={{ fontSize: 13 }}>{o.label}</b>
              {o.tag && <span className="badge" style={{ marginLeft: "auto", fontSize: 10 }}>{o.tag}</span>}
            </span>
            {o.blurb && <span className="tiny muted" style={{ lineHeight: 1.45 }}>{o.blurb}</span>}
            <AnimatePresence>
              {active && (
                <motion.span
                  initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring.pop}
                  style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, background: "var(--accent)", color: "white", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,.2)" }}
                >✓</motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Small labelled section inside a card. */
export function SubHead({ children, info, right }: { children: ReactNode; info?: ReactNode; right?: ReactNode }) {
  return (
    <div className="row between" style={{ gap: 8 }}>
      <span className="row" style={{ gap: 6 }}>
        <span className="eyebrow">{children}</span>
        {info && <InfoTip text={info} />}
      </span>
      {right}
    </div>
  );
}

/** Soft note line with an icon. */
export function Note({ icon = "💡", children, tone = "info" }: { icon?: ReactNode; children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className="row small" style={{ gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: 12, background: tone === "warn" ? "rgba(255,159,10,.12)" : "var(--accent-soft)", lineHeight: 1.5 }}>
      <span>{icon}</span>
      <span style={{ color: "var(--text-2)" }}>{children}</span>
    </div>
  );
}
