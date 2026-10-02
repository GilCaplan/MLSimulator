/* One-of-N choice: segmented (default), dropdown, radio, chips or cards — whichever the user prefers, within the rules of
 * resolveChoice. A horizontal segmented control is measured (ResizeObserver) and falls back when it doesn't fit. */
import { motion } from "framer-motion";
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { ChoiceRenderer } from "../../../design/prefs";
import { useControlPrefs, useReportResolved } from "./context";
import { labelChars, nodeText, resolveChoice, type ChoiceCtx } from "./resolve";

interface Opt<T extends string> { value: T; label: ReactNode; disabled?: boolean }

interface Fit {
  measured: boolean;
  /** content width of the parent (px) */
  availablePx: number;
  overflowed: boolean;
  /** when overflowed: the segmented's natural width minus the width it had, and the parent width at that time */
  deficit: number;
  parentAt: number;
}
const FIT0: Fit = { measured: false, availablePx: 0, overflowed: false, deficit: 0, parentAt: 0 };
const HYSTERESIS = 8;

function contentWidth(el: HTMLElement | null): number {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  return Math.max(0, el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
}

export function Segmented<T extends string>({ value, options, onChange, size = "md", full, fixedRenderer, allow, kind }: {
  fixedRenderer?: ChoiceRenderer;
  allow?: ChoiceRenderer[];
  /** toolbar = compact view switches (segmented / dropdown / chips only); default: size "sm" → toolbar */
  kind?: "form" | "toolbar";
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  full?: boolean;
}) {
  const prefs = useControlPrefs();
  const id = useId();
  const k = kind ?? (size === "sm" ? "toolbar" : "form");
  const texts = useMemo(() => options.map((o) => nodeText(o.label)), [options]);
  const textsKey = texts.join("\u0001");
  const chars = useMemo(() => texts.map(labelChars), [textsKey]);
  const [fit, setFit] = useState<Fit>(FIT0);

  const ctx: ChoiceCtx = {
    n: options.length,
    maxLabelChars: Math.max(0, ...chars),
    totalLabelChars: chars.reduce((a, b) => a + b, 0),
    size, full, kind: k, orientation: prefs.orientation,
    availablePx: Math.round(fit.availablePx),
    overflowed: fit.overflowed,
  };
  const r0 = resolveChoice(prefs.choice, ctx, fixedRenderer, allow);
  // Stabiliser: in a box that shrink-wraps its content, a renderer's own width can flip the fit decision back and forth
  // (cards → too narrow → chips → wide enough → cards…). After 4 flips within 1.5 s, keep the fallback until the
  // options or the preference change.
  const freezeKey = `${prefs.choice}|${prefs.orientation}|${textsKey}|${size}|${full}|${fixedRenderer ?? ""}`;
  const [frozen, setFrozen] = useState<{ key: string; renderer: typeof r0.renderer } | null>(null);
  const isFrozen = !!frozen && frozen.key === freezeKey;
  const r = isFrozen
    ? { renderer: frozen!.renderer, reason: "kept as a fallback (the space around it keeps changing)",
        vertical: frozen!.renderer === "stacked" || (prefs.orientation === "vertical" && ["radio", "chips", "cards"].includes(frozen!.renderer)) }
    : r0;
  const flipLog = useRef<{ last: typeof r0.renderer; times: number[] }>({ last: r.renderer, times: [] });
  useLayoutEffect(() => {
    const log = flipLog.current;
    if (log.last === r.renderer) return;
    const prev = log.last;
    log.last = r.renderer;
    const now = performance.now();
    log.times = [...log.times.filter((t) => now - t < 1500), now];
    if (log.times.length >= 4 && !isFrozen) setFrozen({ key: freezeKey, renderer: r.renderer !== prefs.choice ? r.renderer : prev });
  });
  useReportResolved({ control: "choice", renderer: r.renderer, pref: prefs.choice, reason: r.reason });

  const rootRef = useRef<HTMLDivElement>(null);
  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const avail = contentWidth(el.parentElement);
    setFit((f) => {
      let next: Fit = { ...f, measured: true, availablePx: avail };
      if (el.dataset.renderer === "segmented") {
        const over = el.scrollWidth > el.clientWidth + 1;
        if (over) next = { ...next, overflowed: true, deficit: el.scrollWidth - el.clientWidth, parentAt: avail };
        else if (f.overflowed) next = { ...next, overflowed: false };
      } else if (f.overflowed && avail - f.parentAt >= f.deficit + HYSTERESIS) {
        next = { ...next, overflowed: false };
      }
      const same = next.measured === f.measured && Math.abs(next.availablePx - f.availablePx) < 1 && next.overflowed === f.overflowed
        && next.deficit === f.deficit && next.parentAt === f.parentAt;
      return same ? f : next;
    });
  }, []);

  // measure synchronously after every structural change (before paint), and whenever the box or its parent resizes
  useLayoutEffect(measure, [measure, r.renderer, textsKey, size, full]);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); });
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [measure, r.renderer]);

  const common = {
    ref: rootRef,
    "data-renderer": r.renderer,
    "data-choice": "",
    style: fit.measured ? undefined : { visibility: "hidden" as const },
  };
  const sm = size === "sm";
  const pick = (v: T) => onChange(v);

  switch (r.renderer) {
    case "dropdown":
      return (
        <div {...common} className={`choice-select-wrap${full ? " full" : ""}`}>
          <select className={`select choice-select${sm ? " sm" : ""}`} value={value} onChange={(e) => pick(e.target.value as T)}>
            {!options.some((o) => o.value === value) && <option value={value} disabled>—</option>}
            {options.map((o, i) => <option key={o.value} value={o.value} disabled={o.disabled}>{texts[i] || o.value}</option>)}
          </select>
        </div>
      );
    case "radio":
      return (
        <div {...common} role="radiogroup" className={`radio-group${r.vertical ? " vertical" : ""}${full ? " full" : ""}${sm ? " sm" : ""}`}>
          {options.map((o) => (
            <label key={o.value} className={`radio${o.value === value ? " checked" : ""}${o.disabled ? " disabled" : ""}`}>
              <input type="radio" className="sr-only" name={id} value={o.value} checked={o.value === value} disabled={o.disabled} onChange={() => pick(o.value)} />
              <span className="radio-dot" aria-hidden />
              <span className="radio-label">{o.label}</span>
            </label>
          ))}
        </div>
      );
    case "chips":
      return (
        <div {...common} role="group" className={`chips${r.vertical ? " vertical" : ""}${full ? " full" : ""}${sm ? " sm" : ""}`}>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button key={o.value} type="button" className={`chip${active ? " active" : ""}`} aria-pressed={active} disabled={o.disabled} aria-disabled={o.disabled || undefined} onClick={() => pick(o.value)}>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    case "cards":
      return (
        <div {...common} role="radiogroup" className={`choice-cards${r.vertical ? " vertical" : ""}`}>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button key={o.value} type="button" role="radio" className={`choice-card${active ? " active" : ""}`} aria-checked={active} disabled={o.disabled} aria-disabled={o.disabled || undefined} onClick={() => pick(o.value)}>
                <span className="choice-card-dot" aria-hidden />
                <span className="choice-card-label">{o.label}</span>
              </button>
            );
          })}
        </div>
      );
    default: {
      const stacked = r.renderer === "stacked";
      return (
        <div {...common} role="group" className={`seg${sm ? " sm" : ""}${full || stacked ? " full" : ""}${stacked ? " stacked" : ""}`}>
          {options.map((o: Opt<T>) => {
            const active = o.value === value;
            return (
              <button key={o.value} type="button" className={`seg-btn${active ? " active" : ""}`} aria-pressed={active} disabled={o.disabled} aria-disabled={o.disabled || undefined} onClick={() => pick(o.value)}>
                {active && <motion.span layoutId={`${id}-${r.renderer}`} transition={spring.snappy} className="seg-pill" />}
                <span className="seg-label">{o.label}</span>
              </button>
            );
          })}
        </div>
      );
    }
  }
}
