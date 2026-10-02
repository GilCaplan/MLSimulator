import { motion } from "framer-motion";
import { spring } from "../../../design/motion";

/** One radio card in the save dialog: emoji, label, primary score, "best" and "saved" badges. */
export function ModelPick({ index, selected, onSelect, emoji, label, score, metric, best, saved }: {
  index: number;
  selected: boolean;
  onSelect: () => void;
  emoji: string;
  label: string;
  score: string;
  metric: string;
  best: boolean;
  saved: boolean;
}) {
  return (
    <motion.button
      role="radio" aria-checked={selected} onClick={onSelect}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: Math.min(index, 8) * 0.03 }}
      whileTap={{ scale: 0.98 }}
      className="row"
      style={{
        gap: 10, padding: "10px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--text)",
        borderRadius: "var(--r-md)", background: selected ? "var(--accent-soft)" : "var(--fill)",
        border: `1.5px solid ${selected ? "var(--accent)" : "transparent"}`, boxShadow: selected ? "0 0 0 3px var(--accent-soft)" : "none",
        transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
      }}>
      <span style={{ width: 18, height: 18, borderRadius: 9, flexShrink: 0, border: `2px solid ${selected ? "var(--accent)" : "var(--text-3)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {selected && <motion.span layoutId="save-radio-dot" transition={spring.snappy} style={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)" }} />}
      </span>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
      <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
        <span className="row" style={{ gap: 6, minWidth: 0 }}>
          <b className="truncate" style={{ fontSize: 13.5 }}>{label}</b>
        </span>
        <span className="row wrap" style={{ gap: 6 }}>
          <span className="tiny muted num">{metric} <b style={{ color: "var(--text)" }}>{score}</b></span>
          {best && <span className="badge accent" style={{ height: 18, fontSize: 10.5, padding: "0 7px" }}>⭐ best</span>}
          {saved && <span className="badge success" style={{ height: 18, fontSize: 10.5, padding: "0 7px" }}>✓ saved</span>}
        </span>
      </span>
    </motion.button>
  );
}
