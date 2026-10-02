import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { secs } from "../../lib/format";
import { toast, useJob } from "../../lib/store";
import { AnimatedNumber, Glass, ProgressBar, Spinner } from "../glass";
import { LiveModelCard } from "./LiveModelCard";

function useElapsed(since?: number, running = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);
  return since ? Math.max(0, (now - since) / 1000) : 0;
}

/** Live view of a running (or just finished) training job. */
export function LiveDashboard() {
  const { models, order, status, startedAt } = useJob();
  const list = order.map((k) => models[k]).filter(Boolean);
  const done = list.filter((m) => m.state === "done" || m.state === "failed").length;
  const running = status === "running";
  const elapsed = useElapsed(startedAt, running);
  const overall = list.length ? list.reduce((a, m) => a + (m.state === "done" || m.state === "failed" ? 1 : m.pct), 0) / list.length : 0;
  const [stopping, setStopping] = useState(false);
  const current = list.find((m) => m.state === "running" || m.state === "evaluating");

  const stop = async () => {
    setStopping(true);
    try { await useJob.getState().cancel(); } catch (e) { toast.error(e); }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <Glass animate_in variant="strong" style={{ overflow: "hidden" }}>
        {running && (
          <motion.div aria-hidden style={{ position: "absolute", inset: 0, background: "var(--grad)", opacity: 0.08, borderRadius: "inherit" }}
            animate={{ opacity: [0.05, 0.12, 0.05] }} transition={{ repeat: Infinity, duration: 3 }} />
        )}
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 14 }}>
            <motion.div animate={running ? { y: [0, -5, 0], rotate: [0, -6, 0] } : { y: 0 }} transition={{ repeat: running ? Infinity : 0, duration: 1.6 }} style={{ fontSize: 34 }}>
              {status === "finished" ? "🏁" : status === "failed" ? "💥" : status === "cancelled" ? "✋" : "🚀"}
            </motion.div>
            <div className="col" style={{ gap: 2 }}>
              <h3>
                {status === "finished" ? "All done — tallying the results…" : status === "cancelled" ? "Stopped" : status === "failed" ? "Training failed" : current ? `Training ${current.label}…` : "Starting up…"}
              </h3>
              <span className="small muted num">
                <AnimatedNumber value={done} /> of {list.length} models finished · {secs(elapsed)} elapsed
              </span>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            {status === "finished" && <Spinner size={18} color="var(--accent)" />}
            {running && (
              <button className="btn danger" onClick={stop} disabled={stopping}>
                {stopping ? <Spinner size={14} /> : "■"} {stopping ? "Stopping…" : "Stop"}
              </button>
            )}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <ProgressBar value={status === "finished" ? 1 : overall} color="var(--grad)" height={8} />
        </div>
      </Glass>

      <motion.div layout className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gridAutoFlow: "dense", gap: 14 }}>
        {list.map((m, i) => <LiveModelCard key={m.key} m={m} index={i} />)}
      </motion.div>

      <LogTicker />
    </div>
  );
}

function LogTicker() {
  const logs = useJob((s) => s.logs);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [logs.length, open]);
  const last = logs[logs.length - 1];
  const icon = (lvl: string) => (lvl === "warn" || lvl === "warning" ? "⚠️" : lvl === "error" ? "⛔" : "›");
  return (
    <Glass animate_in pad={false} style={{ padding: "10px 16px" }}>
      <button className="row between" onClick={() => setOpen(!open)} style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: 0, gap: 12 }}>
        <span className="eyebrow">Activity log</span>
        <span className="grow" style={{ overflow: "hidden", textAlign: "left" }}>
          <AnimatePresence mode="wait" initial={false}>
            {!open && last && (
              <motion.span key={`${last.t}${last.message}`} className="small muted truncate" style={{ display: "block" }}
                initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.2 }}>
                {icon(last.level)} {last.message}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.snappy} className="faint">⌄</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.snappy} style={{ overflow: "hidden" }}>
            <div ref={box} className="inset scroll mono" style={{ marginTop: 10, maxHeight: 200, padding: 10, fontSize: 11.5, lineHeight: 1.6 }}>
              {logs.length === 0 && <span className="faint">Nothing yet.</span>}
              {logs.map((l, i) => (
                <div key={i} style={{ color: l.level === "warn" || l.level === "warning" ? "var(--warning)" : l.level === "error" ? "var(--danger)" : "var(--text-2)" }}>
                  <span className="faint">{new Date(l.t * 1000).toLocaleTimeString()}</span> {icon(l.level)} {l.message}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Glass>
  );
}
