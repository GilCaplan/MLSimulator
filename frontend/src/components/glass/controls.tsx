import { AnimatePresence, motion } from "framer-motion";
import { useId, useRef, useState, type ReactNode } from "react";
import { spring } from "../../design/motion";

/* ---------------------------------------------------------------- InfoTip / Tooltip */

export function Tooltip({ content, children, width = 240 }: { content: ReactNode; children: ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="glass strong"
            style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", translateX: "-50%", width, padding: "10px 12px", fontSize: 12, lineHeight: 1.45, zIndex: 50, borderRadius: 12, pointerEvents: "none", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text)" }}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function InfoTip({ text }: { text: ReactNode }) {
  return (
    <Tooltip content={text}>
      <span style={{ display: "inline-flex", width: 16, height: 16, borderRadius: 8, background: "var(--fill-2)", color: "var(--text-2)", fontSize: 10.5, fontWeight: 700, alignItems: "center", justifyContent: "center", cursor: "help", flexShrink: 0 }}>i</span>
    </Tooltip>
  );
}

/* ---------------------------------------------------------------- Field wrapper */

export function Field({ label, help, children, right }: { label: ReactNode; help?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row between" style={{ gap: 6 }}>
        <span className="row" style={{ gap: 6, fontWeight: 560, fontSize: 13 }}>
          {label}
          {help && <InfoTip text={help} />}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Slider */

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label?: ReactNode;
  help?: ReactNode;
  format?: (v: number) => string;
  disabled?: boolean;
  integer?: boolean;
}

export function Slider({ value, min, max, step, log, onChange, onCommit, label, help, format, disabled, integer }: SliderProps) {
  const useLog = !!log && min > 0;
  const toPos = (v: number) => (useLog ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (v - min) / (max - min || 1));
  const fromPos = (p: number) => {
    let v = useLog ? Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min))) : min + p * (max - min);
    if (integer) v = Math.round(v);
    else if (step && !useLog) v = Math.round(v / step) * step;
    else v = Number(v.toPrecision(3));
    return Math.min(max, Math.max(min, v));
  };
  const pos = Math.min(1, Math.max(0, toPos(value ?? min)));
  const shown = format ? format(value) : integer ? String(Math.round(value)) : Number(value).toPrecision(3).replace(/\.?0+$/, "");
  const input = (
    <div className="row" style={{ gap: 10 }}>
      <input
        type="range"
        className="slider"
        min={0}
        max={1000}
        step={1}
        disabled={disabled}
        value={Math.round(pos * 1000)}
        style={{ ["--pct" as any]: `${pos * 100}%` }}
        onChange={(e) => onChange(fromPos(Number(e.target.value) / 1000))}
        onMouseUp={(e) => onCommit?.(fromPos(Number((e.target as HTMLInputElement).value) / 1000))}
        onTouchEnd={(e) => onCommit?.(fromPos(Number((e.target as HTMLInputElement).value) / 1000))}
        onKeyUp={(e) => onCommit?.(fromPos(Number((e.target as HTMLInputElement).value) / 1000))}
      />
      <span className="num mono" style={{ minWidth: 54, textAlign: "right", fontSize: 12.5, color: "var(--text-2)" }}>{shown}</span>
    </div>
  );
  if (!label) return input;
  return <Field label={label} help={help}>{input}</Field>;
}

/* ---------------------------------------------------------------- Segmented control */

export function Segmented<T extends string>({ value, options, onChange, size = "md", full }: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  full?: boolean;
}) {
  const id = useId();
  const h = size === "sm" ? 28 : 34;
  return (
    <div className="inset" style={{ display: full ? "flex" : "inline-flex", padding: 3, gap: 2, borderRadius: 11, height: h + 6 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            style={{ position: "relative", flex: full ? 1 : undefined, height: h, padding: size === "sm" ? "0 10px" : "0 14px", border: "none", background: "transparent", cursor: o.disabled ? "not-allowed" : "pointer", fontSize: size === "sm" ? 12 : 13, fontWeight: active ? 600 : 500, opacity: o.disabled ? 0.4 : 1, borderRadius: 8, whiteSpace: "nowrap" }}
          >
            {active && (
              <motion.span layoutId={`seg-${id}`} transition={spring.snappy} style={{ position: "absolute", inset: 0, borderRadius: 8, background: "var(--glass-strong)", boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 8px rgba(0,0,0,0.12)" }} />
            )}
            <span style={{ position: "relative" }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Toggle (iOS switch) */

export function Toggle({ checked, onChange, label, help, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; help?: ReactNode; disabled?: boolean }) {
  const sw = (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ width: 46, height: 28, borderRadius: 14, border: "none", padding: 2, cursor: disabled ? "not-allowed" : "pointer", background: checked ? "var(--success)" : "var(--fill-2)", transition: "background 0.2s", display: "flex", justifyContent: checked ? "flex-end" : "flex-start", flexShrink: 0, opacity: disabled ? 0.5 : 1 }}
    >
      <motion.span layout transition={spring.snappy} style={{ width: 24, height: 24, borderRadius: 12, background: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }} />
    </button>
  );
  if (!label) return sw;
  return (
    <div className="row between" style={{ gap: 12 }}>
      <span className="row" style={{ gap: 6, fontWeight: 560, fontSize: 13 }}>{label}{help && <InfoTip text={help} />}</span>
      {sw}
    </div>
  );
}

/* ---------------------------------------------------------------- Select */

export function Select<T extends string>({ value, options, onChange, style }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; style?: React.CSSProperties }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)} style={style}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ---------------------------------------------------------------- NumberField */

export function NumberField({ value, onChange, min, max, step = 1, style, width = 90 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; style?: React.CSSProperties; width?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const commit = (s: string) => {
    const v = Number(s);
    if (s.trim() !== "" && !Number.isNaN(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
    setDraft(null);
  };
  return (
    <input
      ref={ref}
      className="input num"
      type="number"
      step={step}
      min={min}
      max={max}
      value={draft ?? String(value ?? "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      style={{ width, ...style }}
    />
  );
}
