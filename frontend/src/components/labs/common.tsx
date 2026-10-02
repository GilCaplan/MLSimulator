/* Building blocks shared by the server labs: run buttons + status, stat tiles, sparklines, 8×8 pixel images. */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatedNumber, InfoTip, ProgressBar, Spinner } from "../glass";
import { Sparkline, useSize } from "../charts";
import { spring } from "../../design/motion";
import { secs } from "../../lib/format";
import { prepCanvas, useLabTheme, useMotionFull } from "./theme";
import type { LabStatus } from "./useLabJob";
import "./labs.css";

/** Controls column + main column; stacks when the lab's own box is narrow (container query in labs.css). */
export function LabSplit({ controls, children }: { controls: ReactNode; children: ReactNode }) {
  return (
    <div className="lab-split-wrap">
      <div className="lab-split">
        <div className="lab-controls">{controls}</div>
        <div className="lab-main">{children}</div>
      </div>
    </div>
  );
}

/** Disable every native control inside while a run is in flight. */
export function Lock({ locked, children }: { locked: boolean; children: ReactNode }) {
  return <fieldset disabled={locked} className="lab-lock col" style={{ gap: 14 }}>{children}</fieldset>;
}

/** Train / Stop buttons plus a one-line status with progress. */
export function RunBar({ status, progress, label, error, doneText, onTrain, onStop, extra, trainLabel = "Train" }: {
  status: LabStatus;
  /** 0–1 while running, undefined = indeterminate */
  progress?: number;
  label?: ReactNode;
  error?: string;
  doneText?: ReactNode;
  onTrain: () => void;
  onStop: () => void;
  extra?: ReactNode;
  trainLabel?: string;
}) {
  const busy = status === "starting" || status === "running" || status === "stopping";
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        {busy ? (
          <button className="btn danger" onClick={onStop} disabled={status === "stopping"}>
            {status === "stopping" ? <><Spinner size={14} /> Stopping…</> : <>■ Stop</>}
          </button>
        ) : (
          <button className="btn primary" onClick={onTrain}>▶ {status === "finished" || status === "cancelled" || status === "failed" ? "Train again" : trainLabel}</button>
        )}
        {extra}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={busy ? "busy" : status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          className="col" style={{ gap: 6 }}>
          {busy && (
            <>
              <div className="row small muted" style={{ gap: 8 }}>
                <Spinner size={13} />
                <span className="grow">{status === "starting" ? "Starting up the trainer…" : status === "stopping" ? "Stopping after this step…" : label ?? "Training…"}</span>
              </div>
              <ProgressBar value={progress ?? 0} indeterminate={progress === undefined || status === "starting"} />
            </>
          )}
          {status === "finished" && doneText && <div className="small" style={{ color: "var(--success)" }}>✓ {doneText}</div>}
          {status === "cancelled" && <div className="small muted">Stopped. Change a setting or press Train again.</div>}
          {status === "failed" && <div className="small" style={{ color: "var(--danger)" }}>Something went wrong: {error || "the run failed"}.</div>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export const doneIn = (s?: number) => (s !== undefined ? `Finished in ${secs(s)}` : "Finished");

/** Big number + plain-language caption. */
export function StatTile({ label, value, format, caption, tip, color, children }: {
  label: ReactNode; value: number; format: (v: number) => string; caption?: ReactNode; tip?: string; color?: string; children?: ReactNode;
}) {
  return (
    <motion.div className="inset col" style={{ gap: 4, padding: 14, minWidth: 0 }} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.gentle}>
      <div className="row eyebrow" style={{ gap: 4 }}>{label}{tip && <InfoTip text={tip} />}</div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: color ?? "var(--text)" }}><AnimatedNumber value={value} format={format} /></div>
      {caption && <div className="small muted">{caption}</div>}
      {children}
    </motion.div>
  );
}

/** Labelled sparkline that stretches to its box. */
export function Spark({ label, values, color, hint, format = (v) => v.toFixed(2) }: { label: ReactNode; values: number[]; color: string; hint?: string; format?: (v: number) => string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const last = values.length ? values[values.length - 1] : null;
  return (
    <div className="col" style={{ gap: 2, minWidth: 0, flex: "1 1 150px" }}>
      <div className="row small" style={{ gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
        <span className="muted grow truncate">{label}</span>
        {hint && <InfoTip text={hint} />}
        <span className="mono num small">{last === null ? "–" : format(last)}</span>
      </div>
      <div ref={ref} style={{ height: 30, width: "100%" }}>
        {width > 0 && <Sparkline values={values} width={width} height={30} color={color} />}
      </div>
    </div>
  );
}

/** An 8×8 image (64 values 0–1) drawn as ink on the theme's fill, enlarged with crisp pixels. */
export function Pixels({ values, size = 64, title, side = 8 }: { values: number[]; size?: number; title?: string; side?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useLabTheme();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = side;
    c.height = side;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(side, side);
    const [r, g, b] = theme.text;
    for (let i = 0; i < side * side; i++) {
      const v = Math.max(0, Math.min(1, values[i] ?? 0));
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = Math.round(v * 255);
    }
    ctx.putImageData(img, 0, 0);
  }, [values, theme, side]);
  return <canvas ref={ref} className="lab-pixels" title={title} role="img" aria-label={title} style={{ width: size, height: size }} />;
}

/** Hi-DPI canvas that fills its box's width; `draw` runs on resize and whenever `deps` change. */
export function useFitCanvas(height: (w: number) => number) {
  const [box, { width }] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const h = width > 0 ? Math.round(height(width)) : 0;
  const ctx = () => (canvas.current && width > 0 ? prepCanvas(canvas.current, width, h) : null);
  return { box, canvas, width, height: h, ctx };
}

/** Coloured callout inside a glass panel (warning tips, takeaways). */
export function Callout({ tone = "accent", icon, children }: { tone?: "accent" | "warning" | "success"; icon?: ReactNode; children: ReactNode }) {
  const c = tone === "warning" ? "var(--warning)" : tone === "success" ? "var(--success)" : "var(--accent)";
  return (
    <motion.div className="lab-callout row" style={{ ["--tone" as any]: c, gap: 12, alignItems: "flex-start" }}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.gentle}>
      {icon && <span style={{ fontSize: 20, lineHeight: 1.2 }}>{icon}</span>}
      <div className="col grow" style={{ gap: 6, minWidth: 0 }}>{children}</div>
    </motion.div>
  );
}

/** Empty-canvas placeholder message, centred over a well. */
export function Placeholder({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="lab-placeholder col center">
      <span style={{ fontSize: 30 }}>{icon}</span>
      <span className="small muted" style={{ maxWidth: 280, textAlign: "center" }}>{children}</span>
    </div>
  );
}

/** Frames can arrive faster than eyes can follow (a GAN run takes ~2 s): reveal them at most one per `interval` ms.
 * Jumps straight to the latest frame when motion is turned down. `resetKey` restarts from the first frame. */
export function usePaced(count: number, interval: number, resetKey: unknown) {
  const full = useMotionFull();
  const [i, setI] = useState(-1);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) { setKey(resetKey); setI(-1); }
  useEffect(() => {
    if (i >= count - 1) return;
    if (!full) { setI(count - 1); return; }
    const behind = count - 1 - i;
    const t = setTimeout(() => setI((x) => Math.min(count - 1, x + (behind > 24 ? 2 : 1))), interval);
    return () => clearTimeout(t);
  }, [i, count, full, interval]);
  return { idx: Math.min(i, count - 1), caughtUp: i >= count - 1 };
}
