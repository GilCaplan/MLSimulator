import { motion } from "framer-motion";
import { Glass } from "../glass";

/** Forecasting projects: every run is compared with "same as last season" — added automatically, with a tiny picture of why. */
export function ForecastBaselineNote() {
  // last week repeated (dashed) vs a forecast that follows the trend too
  const week = [0.82, 0.78, 0.84, 0.93, 1.12, 1.38, 1.13];
  const pts = Array.from({ length: 21 }, (_, i) => ({ x: 6 + i * 9.5, y: 44 - week[i % 7] * 22 - i * 0.55 }));
  const naive = pts.slice(14).map((p, k) => ({ x: p.x, y: pts[7 + k].y }));
  const d = (ps: { x: number; y: number }[]) => ps.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
  return (
    <Glass animate_in variant="thin" style={{ padding: "14px 18px" }}>
      <div className="row wrap" style={{ gap: 18, alignItems: "center" }}>
        <div className="col" style={{ gap: 4, flex: "1 1 300px" }}>
          <span className="row" style={{ gap: 8 }}>
            <motion.span animate={{ rotate: [0, 360] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} style={{ fontSize: 17, display: "inline-block" }}>🔁</motion.span>
            <b style={{ fontSize: 14 }}>Every run is compared with “same as last season”.</b>
          </span>
          <span className="small muted" style={{ lineHeight: 1.5 }}>
            Repeating last week (or last year) is surprisingly hard to beat, so it's added to every training run automatically. If a model can't beat it, it hasn't learned anything the calendar didn't already know.
          </span>
        </div>
        <div className="inset col" style={{ flex: "1 1 220px", padding: "8px 10px", gap: 4 }}>
          <svg viewBox="0 0 206 50" width="100%" height="56" style={{ display: "block", overflow: "visible" }}>
            <line x1={pts[14].x} x2={pts[14].x} y1={0} y2={50} stroke="var(--hairline)" strokeDasharray="2 3" />
            <motion.path d={d(pts.slice(0, 15))} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
            <motion.path d={d([pts[14], ...naive.slice(1)])} fill="none" stroke="var(--text-3)" strokeWidth={1.8} strokeDasharray="4 3"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, delay: 1.2 }} />
            <motion.path d={d(pts.slice(14))} fill="none" stroke="var(--warning)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, delay: 2 }} />
          </svg>
          <span className="row tiny muted" style={{ gap: 12 }}>
            <span className="row" style={{ gap: 4 }}><svg width={14} height={4}><line x1={0} x2={14} y1={2} y2={2} stroke="var(--text-3)" strokeWidth={2} strokeDasharray="3 2" /></svg>last week again</span>
            <span className="row" style={{ gap: 4 }}><svg width={14} height={4}><line x1={0} x2={14} y1={2} y2={2} stroke="var(--warning)" strokeWidth={2} /></svg>a model that also sees the trend</span>
          </span>
        </div>
      </div>
    </Glass>
  );
}
