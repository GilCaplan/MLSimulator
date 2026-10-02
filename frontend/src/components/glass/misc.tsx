import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { spring } from "../../design/motion";

export function Spinner({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Number that springs to its new value. */
export function AnimatedNumber({ value, format = (v) => v.toFixed(0), duration = 0.8 }: { value: number; format?: (v: number) => string; duration?: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const c = animate(mv, value, { duration, ease: [0.32, 0.72, 0, 1] });
    return () => c.stop();
  }, [value, duration, mv]);
  return <motion.span className="num">{text}</motion.span>;
}

export function ProgressBar({ value, color = "var(--accent)", height = 6, indeterminate }: { value: number; color?: string; height?: number; indeterminate?: boolean }) {
  return (
    <div style={{ height, borderRadius: height, background: "var(--fill)", overflow: "hidden", position: "relative" }}>
      {indeterminate ? (
        <motion.div
          style={{ position: "absolute", top: 0, bottom: 0, width: "35%", borderRadius: height, background: color }}
          animate={{ left: ["-35%", "100%"] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
        />
      ) : (
        <motion.div style={{ height: "100%", borderRadius: height, background: color }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={spring.gentle} />
      )}
    </div>
  );
}

export function ProgressRing({ value, size = 44, stroke = 4, color = "var(--accent)", children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }} transition={spring.gentle} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col center" style={{ padding: "48px 24px", textAlign: "center", gap: 12 }}>
      <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} style={{ fontSize: 44 }}>{icon}</motion.div>
      <h3>{title}</h3>
      {text && <p className="muted" style={{ maxWidth: 420 }}>{text}</p>}
      {action}
    </motion.div>
  );
}

/** Drag-and-drop file target. */
export function Dropzone({ onFile, accept, children, busy }: { onFile: (f: File) => void; accept?: string; children?: ReactNode; busy?: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <motion.div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => !busy && input.current?.click()}
      animate={{ scale: over ? 1.015 : 1, borderColor: over ? "var(--accent)" : "var(--hairline)" }}
      transition={spring.snappy}
      style={{ border: "2px dashed var(--hairline)", borderRadius: "var(--r-lg)", padding: 28, cursor: busy ? "wait" : "pointer", textAlign: "center", background: over ? "var(--accent-soft)" : "var(--fill)" }}
    >
      <input ref={input} type="file" accept={accept} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {children}
    </motion.div>
  );
}

/** Slow-drifting colour blobs behind the glass so blur has something to refract. */
export function MeshBackground() {
  const blobs = [
    { c: "var(--bg-blob-1)", x: "8%", y: "10%", s: 46, d: 26 },
    { c: "var(--bg-blob-2)", x: "62%", y: "4%", s: 42, d: 31 },
    { c: "var(--bg-blob-3)", x: "70%", y: "62%", s: 40, d: 35 },
    { c: "var(--bg-blob-4)", x: "4%", y: "64%", s: 36, d: 29 },
  ];
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          animate={{ x: [0, 60, -40, 0], y: [0, -50, 40, 0], scale: [1, 1.12, 0.94, 1] }}
          transition={{ repeat: Infinity, duration: b.d, ease: "easeInOut" }}
          style={{ position: "absolute", left: b.x, top: b.y, width: `${b.s}vmax`, height: `${b.s}vmax`, borderRadius: "50%", background: b.c, filter: "blur(80px)", opacity: 0.55 }}
        />
      ))}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.08), transparent 60%)" }} />
    </div>
  );
}
