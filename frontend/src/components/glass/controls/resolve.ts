/* Which renderer a control actually uses, given the user's preference and the control's own constraints.
 * CONTRACT (frozen): signatures used by the primitives and by Settings → Appearance (to show "resolved renderer" badges).
 * Rules: docs/ui_customization_plan.md §2 and the Builder A spec. */
import type { ReactNode } from "react";
import type { BoolRenderer, ChoiceRenderer, NumericRenderer, Orientation } from "../../../design/prefs";
import { coarsen, defaultFormat, defaultStep, enumerateSteps as enumerate, near } from "./steps";

export interface NumericCtx {
  value: number;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
  integer?: boolean;
  format?: (v: number) => string;
}
export interface ResolvedNumeric {
  renderer: NumericRenderer;
  /** dropdown: the selectable values (≤ 48, always incl. min, max and the current value) */
  options: { value: number; label: string }[];
  /** stepper / number: the step to use */
  step: number;
  /** why the renderer or the options differ from the plain preference, e.g. "coarsened to 5% steps" (null = no change) */
  reason: string | null;
}

/** Most options a numeric dropdown may show. */
export const MAX_DROPDOWN = 48;

/** Every allowed value, or null when the range isn't enumerable (float without step). Log ranges → 1-2-5 series. */
export function enumerateSteps(min: number, max: number, step?: number, integer?: boolean, log?: boolean): number[] | null {
  return enumerate(min, max, step, integer, log);
}

/** Pick the renderer: `fixed` always wins; otherwise the preference if allowed, else the first allowed one. */
function pickRenderer<R extends string>(pref: R, fixed?: R, allow?: R[]): { renderer: R; reason: string | null } {
  if (fixed) return { renderer: fixed, reason: fixed !== pref ? "fixed for this control" : null };
  if (allow && allow.length && !allow.includes(pref)) return { renderer: allow[0], reason: `${pref} not offered here` };
  return { renderer: pref, reason: null };
}

export function resolveNumeric(pref: NumericRenderer, ctx: NumericCtx, fixed?: NumericRenderer, allow?: NumericRenderer[]): ResolvedNumeric {
  const { renderer, reason } = pickRenderer(pref, fixed, allow);
  const { min, max, integer, format } = ctx;
  const useLog = !!ctx.log && min > 0;
  const step = defaultStep(min, max, useLog ? undefined : ctx.step, integer);
  const fmt = (v: number) => (format ? format(v) : defaultFormat(v, integer));
  if (renderer !== "dropdown") {
    let why: string | null = null;
    if (renderer === "stepper" && useLog) {
      const series = enumerate(min, max, undefined, integer, true) ?? [];
      why = series.length > 1 && series.every((v, i) => i === 0 || near(v, series[i - 1] * 2)) ? "steps through powers of two (log scale)" : "steps through a 1-2-5 series (log scale)";
    }
    return { renderer, options: [], step, reason: reason ?? why };
  }

  let values = enumerate(min, max, useLog ? undefined : ctx.step, integer, useLog);
  let why: string | null = null;
  if (useLog && values) {
    why = values.length > 1 && values.every((v, i) => i === 0 || near(v, values![i - 1] * 2)) ? "powers of two (log scale)" : "1-2-5 series (log scale)";
  }
  if (!values || values.length > MAX_DROPDOWN) {
    const c = coarsen(min, max, MAX_DROPDOWN, integer, useLog ? undefined : ctx.step);
    values = c.values;
    const stepLabel = format ? format(c.step) : defaultFormat(c.step, integer);
    why = (ctx.step && !useLog) || integer ? `coarsened to ${stepLabel} steps` : `rounded to ${stepLabel} steps`;
  }
  const options = values.map((v) => ({ value: v, label: fmt(v) }));
  const cur = ctx.value;
  if (typeof cur === "number" && !Number.isNaN(cur) && !options.some((o) => near(o.value, cur))) {
    const at = options.findIndex((o) => o.value > cur);
    const entry = { value: cur, label: `${fmt(cur)} (current)` };
    if (at < 0) options.push(entry);
    else options.splice(at, 0, entry);
  }
  return { renderer, options, step, reason: reason ?? why };
}

export interface ChoiceCtx {
  n: number;
  maxLabelChars: number;
  totalLabelChars: number;
  size: "sm" | "md";
  full?: boolean;
  kind: "form" | "toolbar";
  orientation: Orientation;
  /** width available to the control in px (0 = unknown yet) */
  availablePx: number;
  /** the horizontal segmented rendering overflowed its box */
  overflowed: boolean;
}
export interface ResolvedChoice {
  /** "stacked" = vertical segmented (orientation vertical) */
  renderer: ChoiceRenderer | "stacked";
  vertical: boolean;
  reason: string | null;
}

/** Caps per renderer. */
export const CHOICE_CAPS = { cardsMaxN: 6, cardsMinPx: 320, chipsMaxN: 12, radioMaxN: 8, stackedMaxN: 8, autoChipsMaxN: 8, autoChipsMeanChars: 24 } as const;
const TOOLBAR_OK: ChoiceRenderer[] = ["segmented", "dropdown", "chips"];

/** Rough width of a horizontal segmented control: Σ(chars × 7.2 + 28) + 6 (sm: chars × 6.6 + 20). */
export function estimateSegmentedWidth(ctx: Pick<ChoiceCtx, "n" | "totalLabelChars" | "size">): number {
  return ctx.size === "sm" ? ctx.totalLabelChars * 6.6 + 20 * ctx.n + 6 : ctx.totalLabelChars * 7.2 + 28 * ctx.n + 6;
}

/** Whether the horizontal segmented counts as not fitting (measured overflow, or a wide estimate for n ≥ 5). */
export function segmentedOverflows(ctx: ChoiceCtx): boolean {
  if (ctx.overflowed) return true;
  return ctx.n >= 5 && ctx.availablePx > 0 && estimateSegmentedWidth(ctx) > ctx.availablePx;
}

/** Where a segmented control goes when it doesn't fit horizontally. */
function segmentedFallback(ctx: ChoiceCtx): { renderer: ChoiceRenderer | "stacked"; reason: string } {
  const mean = ctx.n ? ctx.totalLabelChars / ctx.n : 0;
  if (ctx.orientation === "vertical") {
    if (ctx.kind !== "toolbar" && ctx.n <= CHOICE_CAPS.stackedMaxN) return { renderer: "stacked", reason: "doesn't fit across → stacked" };
    return { renderer: "dropdown", reason: ctx.kind === "toolbar" ? "doesn't fit across → dropdown (toolbar)" : `doesn't fit, ${ctx.n} options → dropdown` };
  }
  if (ctx.orientation === "horizontal") {
    if (ctx.n > CHOICE_CAPS.chipsMaxN) return { renderer: "dropdown", reason: `doesn't fit, ${ctx.n} options → dropdown` };
    return { renderer: "chips", reason: "doesn't fit → wrapping chips" };
  }
  if (ctx.n <= CHOICE_CAPS.autoChipsMaxN && mean <= CHOICE_CAPS.autoChipsMeanChars) return { renderer: "chips", reason: "doesn't fit → wrapping chips" };
  return { renderer: "dropdown", reason: ctx.n > CHOICE_CAPS.autoChipsMaxN ? `doesn't fit, ${ctx.n} options → dropdown` : "doesn't fit, long labels → dropdown" };
}

/** Does renderer r pass its caps? Returns null when it does, else the fallback renderer and the reason. */
function capFallback(r: ChoiceRenderer, ctx: ChoiceCtx): { renderer: ChoiceRenderer | "stacked"; reason: string } | null {
  switch (r) {
    case "cards":
      if (ctx.n > CHOICE_CAPS.cardsMaxN || (ctx.availablePx > 0 && ctx.availablePx < CHOICE_CAPS.cardsMinPx)) {
        const why = ctx.n > CHOICE_CAPS.cardsMaxN ? `${ctx.n} options is too many for cards` : `cards need ${CHOICE_CAPS.cardsMinPx}px`;
        if (ctx.n <= CHOICE_CAPS.chipsMaxN) return { renderer: "chips", reason: `${why} → chips` };
        return { renderer: "dropdown", reason: `${why} → dropdown` };
      }
      return null;
    case "chips":
      return ctx.n > CHOICE_CAPS.chipsMaxN ? { renderer: "dropdown", reason: `${ctx.n} options is too many for chips → dropdown` } : null;
    case "radio":
      return ctx.n > CHOICE_CAPS.radioMaxN ? { renderer: "dropdown", reason: `${ctx.n} options is too many for radio → dropdown` } : null;
    case "segmented":
      return segmentedOverflows(ctx) ? segmentedFallback(ctx) : null;
    default:
      return null;
  }
}

const verticalOf = (r: ChoiceRenderer | "stacked", ctx: ChoiceCtx) =>
  r === "stacked" || (ctx.orientation === "vertical" && (r === "radio" || r === "chips" || r === "cards"));

export function resolveChoice(pref: ChoiceRenderer, ctx: ChoiceCtx, fixed?: ChoiceRenderer, allow?: ChoiceRenderer[]): ResolvedChoice {
  if (fixed) return { renderer: fixed, vertical: verticalOf(fixed, ctx), reason: fixed !== pref ? "fixed for this control" : null };
  const toolbar = ctx.kind === "toolbar";
  const mapKind = (r: ChoiceRenderer): ChoiceRenderer => (toolbar && !TOOLBAR_OK.includes(r) ? "segmented" : r);

  // candidates: the preference (if allowed), then the allowed list in order
  const allowed = allow && allow.length ? allow : null;
  const candidates: ChoiceRenderer[] = allowed ? [...(allowed.includes(pref) ? [pref] : []), ...allowed.filter((r) => r !== pref)] : [pref];
  let note: string | null = null;
  if (allowed && !allowed.includes(pref)) note = `${pref} not offered here`;
  else if (toolbar && mapKind(pref) !== pref) note = `toolbar: ${pref} → segmented`;

  for (const c of candidates) {
    const r = mapKind(c);
    if (!capFallback(r, ctx)) {
      const reason = c === candidates[0] ? note : [note, `${mapKind(candidates[0])} doesn't fit here → ${r}`].filter(Boolean).join("; ");
      return { renderer: r, vertical: verticalOf(r, ctx), reason };
    }
  }
  // nothing passed as-is: follow the ladder of the first candidate
  const first = mapKind(candidates[0]);
  const fb = capFallback(first, ctx)!;
  let renderer = fb.renderer;
  if (allowed && renderer !== "stacked" && !allowed.includes(renderer)) renderer = allowed.includes("dropdown") ? "dropdown" : renderer;
  if (toolbar && renderer !== "stacked" && !TOOLBAR_OK.includes(renderer)) renderer = "dropdown";
  const reason = [note, fb.reason].filter(Boolean).join("; ");
  return { renderer, vertical: verticalOf(renderer, ctx), reason: reason || null };
}

export function resolveBool(pref: BoolRenderer, fixed?: BoolRenderer, allow?: BoolRenderer[]): { renderer: BoolRenderer } {
  return { renderer: pickRenderer(pref, fixed, allow).renderer };
}

/** Plain text of a React label (strings and numbers concatenated; emoji count as 2 chars for width estimates). */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && "props" in (node as any)) return nodeText((node as any).props?.children);
  return "";
}

const PICTO = /\p{Extended_Pictographic}/u;
const ZERO_W = /[‍︎️⃣]|[\u{1f3fb}-\u{1f3ff}]/u;
/** Width-estimate character count: emoji count as 2, joiners / variation selectors as 0. */
export function labelChars(text: string): number {
  let n = 0;
  for (const ch of Array.from(text)) n += ZERO_W.test(ch) ? 0 : PICTO.test(ch) ? 2 : 1;
  return n;
}
