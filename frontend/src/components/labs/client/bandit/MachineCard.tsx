import { motion } from "framer-motion";
import { spring } from "../../../../design/motion";
import { colorAt, withAlpha } from "../../../../lib/colors";
import { ARM_NAMES } from "./sim";

/** One slot machine: name plate, a payout window that pops a coin (win) or a cross (loss), and a lever. */
export function MachineCard({ arm, pulls, wins, last, pullId, active, revealed, prob, isBest, disabled, animate, onPull }: {
  arm: number;
  pulls: number;
  wins: number;
  /** outcome of this machine's latest pull (null before the first) */
  last: boolean | null;
  /** increments on every pull of this machine — retriggers the lever + coin animation */
  pullId: number;
  /** the machine pulled most recently */
  active: boolean;
  revealed: boolean;
  prob: number;
  isBest: boolean;
  disabled: boolean;
  /** play the lever/coin tweens (off at high speed or with reduced motion) */
  animate: boolean;
  onPull: () => void;
}) {
  const color = colorAt(arm);
  const est = pulls ? wins / pulls : null;
  return (
    <button type="button" onClick={onPull} disabled={disabled} aria-label={`Pull machine ${ARM_NAMES[arm]}`}
      className="inset col" style={{
        position: "relative", padding: "10px 22px 10px 10px", gap: 7, textAlign: "left", minWidth: 0, cursor: disabled ? "default" : "pointer",
        font: "inherit", color: "var(--text)", background: active ? withAlpha(color, 0.12) : "var(--fill)",
        boxShadow: active ? `0 0 0 2px ${color} inset` : revealed && isBest ? `0 0 0 2px ${withAlpha(color, 0.5)} inset` : "none",
        transition: animate ? "background .25s, box-shadow .25s" : "none",
      }}>
      <div className="row" style={{ gap: 6, minWidth: 0 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0 }} />
        <span className="truncate" style={{ fontWeight: 650, fontSize: 13 }}>Slot {ARM_NAMES[arm]}</span>

      </div>

      {/* payout window */}
      <div style={{ height: 52, borderRadius: "var(--r-sm)", background: "var(--glass-strong)", border: "1px solid var(--hairline)", display: "grid", placeItems: "center", overflow: "hidden" }}>
        {last === null ? (
          <span style={{ fontSize: 22, opacity: 0.45 }} aria-hidden>🎰</span>
        ) : (
          <motion.div key={pullId} className="row" style={{ gap: 4 }}
            initial={animate ? { scale: 0.3, y: -14, opacity: 0 } : false} animate={{ scale: 1, y: 0, opacity: 1 }} transition={animate ? spring.pop : { duration: 0 }}>
            <span style={{ fontSize: 22 }} aria-hidden>{last ? "🪙" : "✖️"}</span>
            <span className="small" style={{ fontWeight: 700, color: last ? "var(--success)" : "var(--text-3)" }}>{last ? "+1" : "0"}</span>
          </motion.div>
        )}
      </div>

      <div className="tiny muted num">{pulls} pull{pulls === 1 ? "" : "s"} · {wins} 🪙</div>
      <div className="row between tiny" style={{ gap: 4 }}>
        <span title="wins ÷ pulls so far">est <b className="num">{est === null ? "—" : `${Math.round(est * 100)}%`}</b></span>
        <span title="the machine's hidden payout chance" style={{ color: revealed ? color : "var(--text-3)" }}>
          true <b className="num">{revealed ? `${Math.round(prob * 100)}%` : "??"}</b>
        </span>
      </div>

      {revealed && isBest && <span title="the best machine" aria-label="best machine" style={{ position: "absolute", top: -9, right: -5, fontSize: 16, lineHeight: 1 }}>👑</span>}

      {/* lever */}
      <span aria-hidden style={{ position: "absolute", right: 8, top: 40, width: 4, height: 34, borderRadius: 2, background: "var(--fill-2)" }} />
      <motion.span aria-hidden key={`lever${pullId}`} animate={animate && pullId > 0 ? { y: [0, 26, 0] } : { y: 0 }}
        transition={{ duration: 0.38, times: [0, 0.4, 1], ease: "easeInOut" }}
        style={{ position: "absolute", right: 4, top: 32, width: 12, height: 12, borderRadius: 6, background: color, boxShadow: `0 2px 6px ${withAlpha(color, 0.5)}` }} />
    </button>
  );
}
