/* UI preferences: site template, background, colours, shape, density, font, motion, chart palette and how each kind
 * of control is displayed. Plan: docs/ui_customization_plan.md. Frontend-only (persisted in localStorage + backend). */

export type Theme = "auto" | "light" | "dark";
export type TemplateId = "glass" | "classic" | "minimal" | "solid" | "paper";
export type BackgroundId = "aurora" | "solid" | "gradient" | "dots" | "grid" | "none";
export type AccentId = "blue" | "indigo" | "purple" | "pink" | "red" | "orange" | "yellow" | "green" | "teal" | "graphite" | "custom";
export type ShapeId = "auto" | "sharp" | "soft" | "round" | "pill";
export type DensityId = "compact" | "comfortable" | "spacious";
export type FontId = "auto" | "system" | "humanist" | "serif" | "mono";
export type MotionLevel = "full" | "reduced" | "off";
export type ChartPaletteId = "apple" | "vivid" | "pastel" | "colorblind" | "mono";

export type NumericRenderer = "slider" | "stepper" | "number" | "dropdown";
export type ChoiceRenderer = "segmented" | "dropdown" | "radio" | "chips" | "cards";
export type BoolRenderer = "switch" | "checkbox" | "yesno";
export type Orientation = "horizontal" | "vertical" | "auto";

export interface ControlPrefs {
  numeric: NumericRenderer;
  choice: ChoiceRenderer;
  bool: BoolRenderer;
  orientation: Orientation;
  /** slider only: an editable number box instead of the read-only readout */
  valueBox: boolean;
}

export interface UIPrefs {
  v: 1;
  theme: Theme;
  template: TemplateId;
  background: BackgroundId;
  accent: AccentId;
  /** "#rrggbb", used when accent === "custom" */
  accentCustom: string;
  shape: ShapeId;
  density: DensityId;
  font: FontId;
  motion: MotionLevel;
  chartPalette: ChartPaletteId;
  controls: ControlPrefs;
  /** ms epoch of the last change (local vs server reconciliation) */
  updatedAt: number;
}

export const DEFAULT_PREFS: UIPrefs = {
  v: 1, theme: "auto", template: "glass", background: "aurora", accent: "blue", accentCustom: "#0a84ff",
  shape: "auto", density: "comfortable", font: "auto", motion: "full", chartPalette: "apple",
  controls: { numeric: "slider", choice: "segmented", bool: "switch", orientation: "auto", valueBox: false },
  updatedAt: 0,
};

/** Picking a template also sets these (the user can then change them individually). */
export const TEMPLATE_PRESETS: Record<TemplateId, Pick<UIPrefs, "background" | "shape" | "font">> = {
  glass: { background: "aurora", shape: "auto", font: "auto" },
  classic: { background: "solid", shape: "auto", font: "auto" },
  minimal: { background: "none", shape: "auto", font: "auto" },
  solid: { background: "solid", shape: "auto", font: "auto" },
  paper: { background: "dots", shape: "auto", font: "auto" },
};

/** Allowed values — the single source for validation and the Settings pickers. */
export const ENUMS = {
  theme: ["auto", "light", "dark"],
  template: ["glass", "classic", "minimal", "solid", "paper"],
  background: ["aurora", "solid", "gradient", "dots", "grid", "none"],
  accent: ["blue", "indigo", "purple", "pink", "red", "orange", "yellow", "green", "teal", "graphite", "custom"],
  shape: ["auto", "sharp", "soft", "round", "pill"],
  density: ["compact", "comfortable", "spacious"],
  font: ["auto", "system", "humanist", "serif", "mono"],
  motion: ["full", "reduced", "off"],
  chartPalette: ["apple", "vivid", "pastel", "colorblind", "mono"],
  numeric: ["slider", "stepper", "number", "dropdown"],
  choice: ["segmented", "dropdown", "radio", "chips", "cards"],
  bool: ["switch", "checkbox", "yesno"],
  orientation: ["horizontal", "vertical", "auto"],
} as const;

/** Accent presets: main colour, second colour (for gradients), a lighter tint (Classic bevels), text on the accent. */
export const ACCENTS: Record<Exclude<AccentId, "custom">, { c: string; c2: string; light: string; contrast: string; label: string }> = {
  blue: { c: "#0a84ff", c2: "#bf5af2", light: "#5eb1ff", contrast: "#ffffff", label: "Blue" },
  indigo: { c: "#5e5ce6", c2: "#bf5af2", light: "#8d8bf0", contrast: "#ffffff", label: "Indigo" },
  purple: { c: "#bf5af2", c2: "#ff375f", light: "#d48cf6", contrast: "#ffffff", label: "Purple" },
  pink: { c: "#ff375f", c2: "#bf5af2", light: "#ff7a95", contrast: "#ffffff", label: "Pink" },
  red: { c: "#e5332a", c2: "#ff9f0a", light: "#ff6f66", contrast: "#ffffff", label: "Red" },
  orange: { c: "#f0890a", c2: "#ff375f", light: "#ffb54d", contrast: "#ffffff", label: "Orange" },
  yellow: { c: "#ffd60a", c2: "#ff9f0a", light: "#ffe566", contrast: "#1d1d1f", label: "Yellow" },
  green: { c: "#28b14c", c2: "#30b0c7", light: "#5fd47c", contrast: "#ffffff", label: "Green" },
  teal: { c: "#1fa5b8", c2: "#0a84ff", light: "#5cc8d7", contrast: "#ffffff", label: "Teal" },
  graphite: { c: "#5f6368", c2: "#8e8e93", light: "#9a9da1", contrast: "#ffffff", label: "Graphite" },
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lighten = (hex: string, f: number) => {
  const [r, g, b] = hexToRgb(hex);
  const m = (v: number) => Math.round(v + (255 - v) * f).toString(16).padStart(2, "0");
  return `#${m(r)}${m(g)}${m(b)}`;
};
/** Accent colours for the current prefs (custom → derived tints and a readable text colour). */
export function accentOf(p: Pick<UIPrefs, "accent" | "accentCustom">) {
  if (p.accent !== "custom") return ACCENTS[p.accent];
  const c = /^#[0-9a-f]{6}$/i.test(p.accentCustom) ? p.accentCustom.toLowerCase() : "#0a84ff";
  const [r, g, b] = hexToRgb(c);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return { c, c2: lighten(c, 0.35), light: lighten(c, 0.3), contrast: lum > 0.62 ? "#1d1d1f" : "#ffffff", label: "Custom" };
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

/** Never throws: unknown values fall back to defaults, extra keys are dropped. */
export function validatePrefs(raw: unknown): UIPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const c = (r.controls && typeof r.controls === "object" ? r.controls : {}) as Record<string, any>;
  const d = DEFAULT_PREFS;
  return {
    v: 1,
    theme: pick(r.theme, ENUMS.theme, d.theme),
    template: pick(r.template, ENUMS.template, d.template),
    background: pick(r.background, ENUMS.background, d.background),
    accent: pick(r.accent, ENUMS.accent, d.accent),
    accentCustom: typeof r.accentCustom === "string" && /^#[0-9a-f]{6}$/i.test(r.accentCustom) ? r.accentCustom.toLowerCase() : d.accentCustom,
    shape: pick(r.shape, ENUMS.shape, d.shape),
    density: pick(r.density, ENUMS.density, d.density),
    font: pick(r.font, ENUMS.font, d.font),
    motion: pick(r.motion, ENUMS.motion, d.motion),
    chartPalette: pick(r.chartPalette, ENUMS.chartPalette, d.chartPalette),
    controls: {
      numeric: pick(c.numeric, ENUMS.numeric, d.controls.numeric),
      choice: pick(c.choice, ENUMS.choice, d.controls.choice),
      bool: pick(c.bool, ENUMS.bool, d.controls.bool),
      orientation: pick(c.orientation, ENUMS.orientation, d.controls.orientation),
      valueBox: typeof c.valueBox === "boolean" ? c.valueBox : d.controls.valueBox,
    },
    updatedAt: typeof r.updatedAt === "number" && isFinite(r.updatedAt) ? r.updatedAt : 0,
  };
}

/** Bring stored prefs (or the pre-v1 `mlp.theme` / `mlp.reduceMotion` keys) up to the current version. */
export function migratePrefs(raw: unknown, legacy: { theme?: unknown; reduceMotion?: unknown } = {}): UIPrefs {
  try {
    if (raw && typeof raw === "object" && (raw as any).v === 1) return validatePrefs(raw);
    return validatePrefs({ theme: legacy.theme, motion: legacy.reduceMotion === true ? "reduced" : "full" });
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function mergePrefs(base: UIPrefs, patch: DeepPartial<UIPrefs>): UIPrefs {
  return validatePrefs({ ...base, ...patch, controls: { ...base.controls, ...(patch.controls ?? {}) } });
}

export const PREFS_KEY = "mlp.ui.v1";
