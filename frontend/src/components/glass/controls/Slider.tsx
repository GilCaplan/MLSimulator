/* Numeric control: slider (default), stepper, number box or dropdown — whichever the user prefers, within the rules
 * of resolveNumeric (dropdowns are coarsened to ≤ 48 options; log ranges step through a 1-2-5 series). */
import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import type { NumericRenderer } from "../../../design/prefs";
import { useControlPrefs, useReportResolved } from "./context";
import { Field } from "./Field";
import { NumberField } from "./NumberField";
import { resolveNumeric } from "./resolve";
import { clamp, clean, defaultFormat, enumerateSteps, near } from "./steps";

interface SliderProps {
  /** always render this way, whatever the user's control preference (e.g. continuous explorations) */
  fixedRenderer?: NumericRenderer;
  /** restrict the user's preference to these renderers */
  allow?: NumericRenderer[];
  /** show an editable number box instead of the read-only readout (overrides the preference) */
  valueBox?: boolean;
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

export function Slider(props: SliderProps) {
  const { value, min, max, step, log, label, help, format, integer, fixedRenderer, allow } = props;
  const prefs = useControlPrefs();
  const r = useMemo(
    () => resolveNumeric(prefs.numeric, { value, min, max, step, log, integer, format }, fixedRenderer, allow),
    // the dropdown options depend on the current value only when it is off-grid; recomputing is cheap
    [prefs.numeric, value, min, max, step, log, integer, format, fixedRenderer, allow?.join(",")],
  );
  useReportResolved({ control: "numeric", renderer: r.renderer, pref: prefs.numeric, reason: r.reason });

  let body: ReactNode;
  switch (r.renderer) {
    case "dropdown": body = <NumericDropdown {...props} options={r.options} />; break;
    case "stepper": body = <Stepper {...props} step={r.step} />; break;
    case "number": body = <NumberBox {...props} step={r.step} />; break;
    default: body = <RangeSlider {...props} valueBox={props.valueBox ?? prefs.valueBox} />;
  }
  if (!label) return body;
  return <Field label={label} help={help}>{body}</Field>;
}

const shownOf = (v: number, format?: (v: number) => string, integer?: boolean) => (format ? format(v) : defaultFormat(v, integer));
const ariaName = (label: ReactNode) => (typeof label === "string" ? label : undefined);

/* ---------------------------------------------------------------- slider (today's control) */

function RangeSlider({ value, min, max, step, log, onChange, onCommit, label, format, disabled, integer, valueBox }: SliderProps) {
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
  const shown = shownOf(value, format, integer);
  const commitFrom = (el: EventTarget) => onCommit?.(fromPos(Number((el as HTMLInputElement).value) / 1000));
  return (
    <div className="row slider-row" style={{ gap: 10 }}>
      <input
        type="range"
        className="slider"
        min={0}
        max={1000}
        step={1}
        disabled={disabled}
        aria-label={ariaName(label)}
        aria-valuetext={shown}
        value={Math.round(pos * 1000)}
        style={{ ["--pct" as any]: `${pos * 100}%` }}
        onChange={(e) => onChange(fromPos(Number(e.target.value) / 1000))}
        onMouseUp={(e) => commitFrom(e.target)}
        onTouchEnd={(e) => commitFrom(e.target)}
        onKeyUp={(e) => commitFrom(e.target)}
      />
      {valueBox ? (
        <span className="slider-box" title={format ? shown : undefined}>
          <NumberField value={integer ? Math.round(value) : clean(value)} min={min} max={max} step={integer ? 1 : step ?? "any"} width={78}
            ariaLabel={ariaName(label)}
            onChange={(v) => { const x = integer ? Math.round(v) : v; onChange(x); onCommit?.(x); }} />
        </span>
      ) : (
        <span className="num mono slider-readout">{shown}</span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- stepper  [−] value [+] */

function Stepper({ value, min, max, step, log, onChange, onCommit, label, format, disabled, integer }: SliderProps & { step: number }) {
  const useLog = !!log && min > 0;
  const series = useMemo(() => (useLog ? enumerateSteps(min, max, undefined, integer, true) ?? [] : null), [useLog, min, max, integer]);
  const cur = useRef(value);
  cur.current = value;
  const timer = useRef<{ t?: ReturnType<typeof setTimeout>; moved: boolean }>({ moved: false });
  const liveId = useId();

  const next = (v: number, dir: 1 | -1): number => {
    if (series && series.length) {
      if (dir > 0) return series.find((s) => s > v && !near(s, v)) ?? max;
      for (let i = series.length - 1; i >= 0; i--) if (series[i] < v && !near(series[i], v)) return series[i];
      return min;
    }
    const k = (v - min) / step;
    const kr = Math.round(k);
    const onGrid = Math.abs(k - kr) < 1e-6;
    const target = dir > 0 ? (onGrid ? kr + 1 : Math.ceil(k)) : onGrid ? kr - 1 : Math.floor(k);
    let out = clean(min + target * step);
    if (integer) out = Math.round(out);
    return clamp(out, min, max);
  };
  const bump = (dir: 1 | -1) => {
    const v = next(cur.current, dir);
    if (!near(v, cur.current)) {
      cur.current = v;
      timer.current.moved = true;
      onChange(v);
    }
  };
  const stop = () => {
    if (timer.current.t) clearTimeout(timer.current.t);
    timer.current.t = undefined;
    if (timer.current.moved) onCommit?.(cur.current);
    timer.current.moved = false;
  };
  const start = (dir: 1 | -1) => {
    if (disabled) return;
    stop();
    bump(dir);
    let delay = 380;
    const tick = () => {
      bump(dir);
      delay = Math.max(40, delay * 0.82);
      timer.current.t = setTimeout(tick, delay);
    };
    timer.current.t = setTimeout(tick, delay);
  };
  useEffect(() => () => { if (timer.current.t) clearTimeout(timer.current.t); }, []);

  const shown = shownOf(value, format, integer);
  const name = ariaName(label) ?? "value";
  const atMin = value <= min || near(value, min);
  const atMax = value >= max || near(value, max);
  const onKey = (e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
    if (dir) { e.preventDefault(); bump(dir); onCommit?.(cur.current); timer.current.moved = false; }
    else if (e.key === "Home") { e.preventDefault(); onChange(min); onCommit?.(min); }
    else if (e.key === "End") { e.preventDefault(); onChange(max); onCommit?.(max); }
  };
  const btn = (dir: 1 | -1) => (
    <button
      type="button"
      className="stepper-btn"
      aria-label={`${dir > 0 ? "Increase" : "Decrease"} ${name}`}
      aria-controls={liveId}
      disabled={disabled || (dir > 0 ? atMax : atMin)}
      tabIndex={-1}
      onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); start(dir); } }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bump(dir); onCommit?.(cur.current); timer.current.moved = false; } }}
    >
      {dir > 0 ? "+" : "−"}
    </button>
  );
  return (
    <div className={`stepper${disabled ? " disabled" : ""}`}>
      {btn(-1)}
      <span
        id={liveId}
        className="stepper-value num"
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={name}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={shown}
        aria-disabled={disabled || undefined}
        aria-live="polite"
        onKeyDown={disabled ? undefined : onKey}
      >
        {shown}
      </span>
      {btn(1)}
    </div>
  );
}

/* ---------------------------------------------------------------- number box */

function NumberBox({ value, min, max, step, log, onChange, onCommit, label, format, disabled, integer }: SliderProps & { step: number }) {
  const useLog = !!log && min > 0;
  const raw = integer ? String(Math.round(value)) : String(clean(value));
  const shown = format ? format(value) : null;
  return (
    <div className="row number-row" style={{ gap: 8 }}>
      <NumberField
        value={integer ? Math.round(value) : clean(value)}
        min={min}
        max={max}
        step={useLog ? "any" : step}
        width={110}
        ariaLabel={ariaName(label)}
        style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        onChange={(v) => { const x = integer ? Math.round(v) : v; onChange(x); onCommit?.(x); }}
      />
      {shown && shown.replace(/[\s,\u202f]/g, "") !== raw && <span className="faint small num number-hint">{raw} → {shown}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- dropdown */

function NumericDropdown({ value, onChange, onCommit, label, disabled, options }: SliderProps & { options: { value: number; label: string }[] }) {
  let idx = options.findIndex((o) => near(o.value, value));
  if (idx < 0) idx = 0;
  return (
    <select
      className="select num-select"
      value={String(idx)}
      disabled={disabled}
      aria-label={ariaName(label)}
      onChange={(e) => { const v = options[Number(e.target.value)]?.value; if (v !== undefined) { onChange(v); onCommit?.(v); } }}
    >
      {options.map((o, i) => <option key={i} value={String(i)}>{o.label}</option>)}
    </select>
  );
}
