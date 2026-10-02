import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { spring, stagger } from "../../design/motion";
import { ApiError, api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { PortsInfo } from "../../lib/types";
import { Glass, InfoTip, Modal, NumberField, ProgressBar, Spinner, Tooltip } from "../glass";

type Phase = { port: number; step: number; error: string | null; done: boolean };

const MOVE_STEPS = [
  { title: "Start a new server", text: (p: number) => `Launching a fresh copy of ML Playground on port ${p}.` },
  { title: "Wait for it to wake up", text: () => "Knocking on its door until it answers (usually a few seconds)." },
  { title: "Retire the old server", text: () => "The current server finishes up and politely shuts down." },
  { title: "Take you there", text: (p: number) => `Re-opening this page at localhost:${p}.` },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Server & port: see which ports are free and move the running app to another one without losing anything. */
export function PortPanel() {
  const [info, setInfo] = useState<PortsInfo | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState<number>(8790);
  const [phase, setPhase] = useState<Phase | null>(null);

  const scan = useCallback(async (start?: number) => {
    setScanning(true);
    try {
      const r = await api.ports(start, start ? Math.min(65535, start + 35) : undefined);
      setInfo(r);
    } catch (e) {
      toast.error(e);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const current = info?.current ?? Number(window.location.port || 80);
  const busy = new Set(info?.busy ?? []);
  const free = new Set(info?.free ?? []);
  const chips = info ? Array.from({ length: info.range[1] - info.range[0] + 1 }, (_, i) => info.range[0] + i) : [];

  const move = async (port: number) => {
    setPhase({ port, step: 0, error: null, done: false });
    const fail = (step: number, error: string) => setPhase({ port, step, error, done: false });
    // 1. ask the server to spawn its successor
    try {
      await api.switchPort(port);
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409 ? e.message : e instanceof Error ? e.message : String(e);
      return fail(0, msg);
    }
    // 2. wait until the new server says it's ready
    setPhase({ port, step: 1, error: null, done: false });
    const base = `http://${window.location.hostname}:${port}`;
    const t0 = Date.now();
    let ready = false;
    while (Date.now() - t0 < 25000) {
      try {
        const h = await api.health(base);
        if (h.ready) { ready = true; break; }
      } catch { /* not up yet */ }
      await sleep(400);
    }
    if (!ready) return fail(1, "The new server didn't answer within 25 seconds. Don't worry — this one is still running, so nothing was lost. Try another port, or check the log file below.");
    // 3. tell the old server it can leave
    setPhase({ port, step: 2, error: null, done: false });
    try { await api.goodbye(); } catch { /* it may already be leaving */ }
    await sleep(350);
    // 4. hop over
    setPhase({ port, step: 3, error: null, done: false });
    await sleep(500);
    setPhase({ port, step: 4, error: null, done: true });
    window.location.replace(`${base}${window.location.pathname}`);
  };

  const target = selected ?? null;
  const running = !!phase && !phase.error && !phase.done;

  return (
    <Glass animate_in style={{ gridColumn: "1 / -1" }}>
      <div className="row between wrap" style={{ gap: 16, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 4 }}>
          <span className="eyebrow">Server &amp; port</span>
          <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
            <span style={{ fontSize: 46, fontWeight: 780, letterSpacing: "-0.04em", lineHeight: 1 }} className="gradient-text num">{current}</span>
            <span className="badge success"><span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--success)", animation: "pulse 1.6s infinite" }} /> running</span>
          </div>
          <span className="small muted" style={{ maxWidth: 520, lineHeight: 1.5 }}>
            ML Playground runs a small server on your Mac at <span className="mono">localhost:{current}</span>. If another app needs this port, move it somewhere else — it only takes a few seconds.
          </span>
        </div>
        <div className="col" style={{ gap: 8, alignItems: "flex-end" }}>
          <button className="btn gradient lg" disabled={!target || target === current || running} onClick={() => target && move(target)}>
            🚚 {target && target !== current ? `Move to port ${target}` : "Pick a port to move to"}
          </button>
          <span className="tiny faint" style={{ maxWidth: 300, textAlign: "right" }}>
            Bookmarks and the desktop icon will find the new port automatically — the launcher asks the running server where it lives.
          </span>
        </div>
      </div>

      <div className="divider" style={{ margin: "18px 0" }} />

      <div className="row between wrap" style={{ gap: 10, marginBottom: 12 }}>
        <span className="row small" style={{ gap: 6, fontWeight: 600 }}>
          Ports {info ? `${info.range[0]}–${info.range[1]}` : ""}
          <InfoTip text="A port is like a door number on your computer. Each program that serves web pages needs its own door." />
        </span>
        <span className="row tiny muted" style={{ gap: 12 }}>
          <Legend color="var(--accent)" label="current" />
          <Legend color="var(--success)" label="free" />
          <Legend color="var(--fill-2)" label="in use" />
          {scanning && <Spinner size={12} />}
        </span>
      </div>

      {!info ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 8 }}>
          {Array.from({ length: 24 }, (_, i) => <div key={i} className="skeleton" style={{ height: 36, borderRadius: 11 }} />)}
        </div>
      ) : (
        <motion.div key={info.range[0]} variants={stagger(0.012)} initial="hidden" animate="show" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 8 }}>
          {chips.map((p) => (
            <PortChip key={p} port={p} state={p === current ? "current" : busy.has(p) || !free.has(p) ? "busy" : "free"} selected={selected === p} onPick={() => setSelected(p)} />
          ))}
        </motion.div>
      )}

      <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
        <span className="small muted">Or any port:</span>
        <NumberField value={custom} min={1024} max={65535} onChange={(v) => setCustom(Math.round(v))} width={100} />
        <button className="btn sm" onClick={() => { if (custom === current) toast.info("That's the port it's already using."); else setSelected(custom); }}>Use {custom}</button>
        <button className="btn sm ghost" disabled={scanning} onClick={() => scan(custom)}>🔎 Scan {custom}–{Math.min(65535, custom + 35)}</button>
        {info && info.range[0] !== 8765 && <button className="btn sm ghost" onClick={() => scan()}>↺ Back to the usual range</button>}
      </div>

      <MoveModal phase={phase} onClose={() => setPhase(null)} onRetry={() => phase && move(phase.port)} />
    </Glass>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="row" style={{ gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: color }} />{label}</span>;
}

function PortChip({ port, state, selected, onPick }: { port: number; state: "current" | "free" | "busy"; selected: boolean; onPick: () => void }) {
  const base: React.CSSProperties = {
    height: 36, width: "100%", borderRadius: 11, border: "1px solid var(--hairline)", fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 5, position: "relative",
  };
  const variants = { hidden: { opacity: 0, scale: 0.7 }, show: { opacity: 1, scale: 1, transition: spring.pop } };
  if (state === "current") {
    return (
      <motion.div variants={variants} style={{ ...base, background: "var(--accent)", color: "white", borderColor: "transparent", boxShadow: "0 4px 14px rgba(10,132,255,0.35)" }} title="ML Playground is running here">
        ★ {port}
      </motion.div>
    );
  }
  if (state === "busy") {
    return (
      <motion.div variants={variants} style={{ display: "grid" }}>
        <Tooltip content="In use by another program" width={160}>
          <div style={{ ...base, background: "var(--fill)", color: "var(--text-3)", cursor: "not-allowed", textDecoration: "line-through", textDecorationColor: "var(--text-3)" }}>{port}</div>
        </Tooltip>
      </motion.div>
    );
  }
  return (
    <motion.button
      variants={variants}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.94 }}
      onClick={onPick}
      style={{ ...base, cursor: "pointer", background: selected ? "rgba(48,209,88,0.18)" : "var(--glass-strong)", borderColor: selected ? "var(--success)" : "var(--hairline)", boxShadow: selected ? "0 0 0 3px rgba(48,209,88,0.25)" : undefined }}
    >
      {selected && <motion.span layoutId="port-check" transition={spring.snappy} style={{ color: "var(--success)" }}>✓</motion.span>}
      {port}
    </motion.button>
  );
}

function MoveModal({ phase, onClose, onRetry }: { phase: Phase | null; onClose: () => void; onRetry: () => void }) {
  const failed = !!phase?.error;
  const running = !!phase && !failed && !phase.done;
  return (
    <Modal
      open={!!phase}
      onClose={() => !running && onClose()}
      width={480}
      title={phase ? (failed ? "Couldn't move" : phase.done ? "All set!" : `Moving to port ${phase.port}…`) : ""}
      footer={failed ? (
        <>
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={onRetry}>Try again</button>
        </>
      ) : undefined}
    >
      {phase && (
        <div className="col" style={{ gap: 16 }}>
          <ProgressBar value={Math.min(1, phase.step / MOVE_STEPS.length)} color={failed ? "var(--danger)" : "var(--grad)"} height={6} />
          <div className="col" style={{ gap: 0, position: "relative" }}>
            {MOVE_STEPS.map((s, i) => {
              const st = failed && i === phase.step ? "error" : i < phase.step ? "done" : i === phase.step ? "active" : "pending";
              return (
                <div key={i} className="row" style={{ gap: 14, alignItems: "flex-start", padding: "8px 0", opacity: st === "pending" ? 0.45 : 1, transition: "opacity 0.3s" }}>
                  <div className="col" style={{ alignItems: "center", gap: 0 }}>
                    <StepDot state={st} n={i + 1} />
                  </div>
                  <div className="col" style={{ gap: 2, paddingTop: 4 }}>
                    <b style={{ fontSize: 14 }}>{s.title}</b>
                    <span className="small muted">{s.text(phase.port)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <AnimatePresence>
            {failed && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="inset" style={{ padding: 14, borderColor: "rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.08)" }}>
                <span className="small" style={{ lineHeight: 1.5 }}>⚠️ {phase.error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Modal>
  );
}

function StepDot({ state, n }: { state: "pending" | "active" | "done" | "error"; n: number }) {
  const bg = state === "done" ? "var(--success)" : state === "error" ? "var(--danger)" : state === "active" ? "var(--accent-soft)" : "var(--fill)";
  return (
    <motion.div animate={{ scale: state === "active" ? [1, 1.08, 1] : 1 }} transition={state === "active" ? { repeat: Infinity, duration: 1.4 } : spring.pop}
      style={{ width: 30, height: 30, borderRadius: 15, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: state === "done" || state === "error" ? "white" : "var(--text-2)", fontWeight: 700, fontSize: 13, transition: "background 0.3s" }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={state} initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={spring.pop} style={{ display: "flex" }}>
          {state === "done" ? "✓" : state === "error" ? "!" : state === "active" ? <Spinner size={15} color="var(--accent)" /> : n}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}
