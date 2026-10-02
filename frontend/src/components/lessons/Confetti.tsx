import { motion } from "framer-motion";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../lib/store";

const COLORS = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f", "#64d2ff", "#ffd60a"];

/** One-shot confetti burst from a viewport point. Change `burst` to fire again. */
export function Confetti({ burst, x, y, count = 70 }: { burst: number; x: number; y: number; count?: number }) {
  const reduce = useUI((s) => s.reduceMotion);
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => {
      const a = Math.random() * Math.PI * 2;
      const v = 160 + Math.random() * 280;
      return {
        i,
        dx: Math.cos(a) * v,
        dy: Math.sin(a) * v * 0.75 - 140,
        rot: (Math.random() - 0.5) * 900,
        w: 6 + Math.random() * 6,
        h: Math.random() < 0.5 ? 6 + Math.random() * 4 : 12 + Math.random() * 6,
        round: Math.random() < 0.3,
        color: COLORS[i % COLORS.length],
        dur: 1.5 + Math.random() * 1.1,
        delay: Math.random() * 0.12,
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst, count],
  );
  if (!burst || reduce) return null;
  return createPortal(
    <div key={burst} aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 200, overflow: "hidden" }}>
      {pieces.map((p) => (
        <motion.span
          key={p.i}
          initial={{ x, y, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: [x, x + p.dx * 0.8, x + p.dx], y: [y, y + p.dy, y + p.dy + 420], rotate: p.rot, opacity: [1, 1, 0], scale: 1 }}
          transition={{ duration: p.dur, delay: p.delay, ease: ["easeOut", "easeIn"] as any, times: [0, 0.35, 1] }}
          style={{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h, marginLeft: -p.w / 2, marginTop: -p.h / 2, borderRadius: p.round ? "50%" : 2, background: p.color }}
        />
      ))}
    </div>,
    document.body,
  );
}
