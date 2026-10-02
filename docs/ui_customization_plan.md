# UI customization & site-wide templates — implementation plan

_Planned 2026-10-02 (Fable). Paths are under `frontend/src/` unless stated._

User request:
- Let users choose how every kind of control is displayed (e.g. train-split size as a slider or a dropdown), along with
  colours, shape, direction and so on. The choice applies everywhere in the app, in an orderly visual Settings section,
  and is tested so that every option fits nicely.
- Separately, offer site-wide **templates** (glass, old-style, minimal, solid…) including **background templates**.

## 0. Survey (what the plan builds on)
| Primitive | Call sites | Notes |
|---|---|---|
| `Slider` | 82 | `label` 76, `help` 64, `format` 50, `integer` 47, `step` 36, `log` 18. Linear step counts 3–191; log ranges up to 50–20000. 7 inline/unlabelled. |
| `Segmented` | 58 | `size="sm"` 34; n=2 ×31, n=3 ×7, n=4 ×4, n=5 ×1, n=7 ×1 (`pages/Library.tsx`, labels up to 44 chars), dynamic ×15; labels are ReactNode. |
| `Select` | 26 | long/dynamic lists (stays a dropdown). |
| `Toggle` | 34 | 2 unlabelled. |
| `NumberField` / `Field` | 13 / 19 | |
| `Glass` / `.inset` / `.btn` | 161 (+41 class) / 245 / 212 | CSS-class driven → template-overridable. |

There are 431 hex literals in 90 files, mostly chart/series colours from `lib/colors.ts`, which canvas code consumes. Series
colours therefore stay JS strings, with CSS variables as a mirror. `useUI` (store.ts) holds `theme`/`reduceMotion` under
`mlp.theme`/`mlp.reduceMotion`; `AppShell` sets `data-theme`. localStorage is per-origin and the app can move ports,
so prefs are also persisted on the backend.

## 1. Preference model — `design/prefs.ts`
```ts
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
export interface ControlPrefs { numeric: NumericRenderer; choice: ChoiceRenderer; bool: BoolRenderer; orientation: Orientation; valueBox: boolean }
export interface UIPrefs { v: 1; theme; template; background; accent; accentCustom: string; shape; density; font; motion; chartPalette; controls: ControlPrefs; updatedAt: number }
```
- Defaults: glass / aurora / blue / auto shape / comfortable / auto font / full motion / apple palette;
  controls slider / segmented / switch / auto / no value box.
- `TEMPLATE_PRESETS` sets background (+shape/font) when a template is picked.
- `validatePrefs` (enum-checked, never throws) and `migratePrefs` (legacy keys → v1).
- Storage: localStorage `mlp.ui.v1`. `useUI` keeps `theme`/`reduceMotion` for compatibility and adds `prefs`,
  `patchPrefs`, `setControl`, `applyTemplate`, `resetPrefs(section)`, `exportPrefs`, `importPrefs`, `syncFromServer`.
- Backend: `GET/PUT /api/system/prefs` → `DATA_DIR/ui_prefs.json`, newest `updatedAt` wins. Saves are debounced 800 ms.
- An inline pre-paint script in `index.html` sets the `data-*` attributes from localStorage before CSS paints (no flash).

## 2. Mechanism — apply everywhere without editing call sites
- `design/apply.ts`: `applyPrefsToDocument` sets these attributes on `<html>`: `data-theme` (resolved), `data-template`,
  `data-background`, `data-shape` (not when auto), `data-density`, `data-font` (not when auto), `data-motion`,
  `data-accent`, `data-palette`. It also writes inline `--accent`, `--accent-rgb`, `--accent-2`, `--accent-contrast`,
  `--accent-light` and `--chart-1…12`. `useApplyPrefs()` runs in `AppShell`, replacing `useTheme`.
  `MotionConfig` follows the motion level.
- All template/modifier CSS uses attribute selectors **without `:root`**, so scoped previews
  (`<div data-template="classic" data-theme="light">`) work with the same CSS.
- CSS order: `tokens.css` → `controls.css` → `templates.css` → `backgrounds.css` → `modifiers.css`. Templates set colours
  in both light and dark blocks, but radii, fonts and spacing only in the light block. Modifiers override.
- New variables in `tokens.css` (with today's values, so nothing changes visually):
  - Accent: `--accent-rgb`, `--accent-contrast`, `--accent-light`.
  - Surfaces: `--scrim`, `--scrim-blur`, `--table-head-blur`.
  - Radii: `--r-pill`, `--r-control`.
  - Controls: `--control-h`, `--control-h-sm`, `--control-pad-x`, `--seg-bg`, `--seg-pill-bg`, `--seg-pill-shadow`,
    `--seg-pill-text`, `--switch-on`, `--switch-off`, `--thumb`, `--thumb-shadow`, `--track-h`, `--input-bg`,
    `--input-border`, `--input-shadow`, `--btn-bg`, `--btn-border`, `--btn-shadow`, `--btn-hover-shadow`, `--focus-ring`.
  - Spacing and type: `--pad-card`, `--pad-card-lg`, `--gap-row`, `--font-size`, `--font-display`, `--h1-weight`,
    `--letter`, `--surface-border-w`.
  - Background: `--bg-plain`, `--bg-grad-a`, `--bg-grad-b`, `--bg-pattern-ink`, `--bg-pattern-size`.
  - Charts: `--chart-1…12`, `--on-accent`.
- **Pref-aware primitives** (`components/glass/controls/*`, with the same exported names and signatures). All accept
  `fixedRenderer`, `allow`, and `kind` (Choice only).
  - **`Slider`** has four renderers: slider, stepper, number, dropdown.
    - Steps come from `enumerateSteps`. Log ranges use a 1-2-5 series (powers of two for power-of-two integers).
    - A dropdown never has more than 48 options. Larger ranges are coarsened to a "nice" step that always includes min, max and the current value, and the reason is shown.
  - **`Segmented`** has five renderers: segmented, dropdown, radio, chips, cards.
    - Toolbar kind (`size="sm"`) allows only segmented, dropdown and chips.
    - It measures horizontal fit with a ResizeObserver, with hysteresis.
    - Fallback ladder when it doesn't fit:
      - orientation `auto`: chips (n ≤ 8, mean label ≤ 24 chars), else dropdown.
      - orientation `horizontal`: chips, else dropdown if n > 12.
      - orientation `vertical`: stacked (n ≤ 8), else dropdown.
    - Caps: cards need n ≤ 6 and ≥ 320 px; chips n ≤ 12; radio n ≤ 8.
  - **`Toggle`** has three renderers: switch, checkbox, yes/no (a two-option toolbar Choice).
  - **`Select`** always stays a dropdown.
- Opt-outs at specific call sites (`fixedRenderer`):
  - ThresholdTuner slider.
  - `library/InputControl.tsx` slider and the Yes/No toggle.
  - `prepare/BalanceCard.tsx` per-class sliders.
  - `library/DrawPad.tsx` brush size.
  - `library/ImagePlayground.tsx` and `train/VisionLooks.tsx` blend/opacity sliders.

## 3. Templates
Each template has a light and a dark block. Full variable lists are in the Fable report (session 4 transcript). In summary:
- **glass**: the current look (base). Background aurora.
- **classic**: old-style desktop. Bevels (inset white/grey shadows), "Lucida Grande"/"Segoe UI"/Tahoma, small radii
  (3–8 px), gradient buttons with dark borders, inset inputs, pressed segmented buttons, no blur. Background solid.
- **minimal**: flat white/near-black, hairline borders, no shadows, no blur. Active segment is ink with inverted text,
  generous padding. Background none.
- **solid**: opaque, bold, no gradients or blur. 2 px borders, offset "sticker" shadows (`4px 4px 0`), accent-filled
  active segments, heavy headings. Background solid.
- **paper**: warm cream, serif display font, soft shadows. Background dots.

Modifiers (`design/modifiers.css`):
- **Shape:** sharp, soft, round or pill radii.
- **Density:** compact or spacious control heights, paddings and base font size.
- **Font:** system, humanist, serif or mono stacks.
- **Motion:** reduced or off.
- **Accent:** ten presets.
- **Print:** an `@media print` block.

Backgrounds (`design/backgrounds.css` + a `Background` component replacing `MeshBackground`):
- aurora: blobs that only drift with full motion.
- solid.
- gradient.
- dots: a radial-gradient pattern.
- grid: linear-gradient lines.
- none: pure `--bg-plain`.

Gotchas:
1. `-webkit-backdrop-filter` must come before the unprefixed property, or the minifier drops the unprefixed one.
2. Never put `filter`/`transform`/`backdrop-filter` on an ancestor of step content (portalled footers).
3. Chart series colours stay in JS.

## 4. Settings → Appearance
A full-width panel built from `components/settings/appearance/*`:
- Toolbar: reset all (with confirmation), export / import / copy JSON, and a preview-width switch.
- Theme.
- Template gallery: live `MiniPreview`s scoped with `data-*`.
- Background swatches.
- Colours & shape: accent swatches and a custom colour, shape, font with samples, chart palettes.
- Controls: renderer pickers as cards. Next to them are live previews with real primitives on fixtures such as "Test
  size 5–50 %", "Learning rate 1e-4…1 log", "Rows 50…20,000", "Scaling (4)", "7 long labels" and a toolbar. Badges show
  the resolved renderer and the fallback reason.
- Density & motion.
- Preview sandbox: a fake wizard card at 600/1000/1400 px, optionally light and dark side by side.

## 5. Testing ("everything fits nicely")
- Dev-only gallery route `/dev/gallery`.
  - Query-param prefs: `?template=…&theme=…&numeric=…&choice=…&bool=…&orientation=…&w=600`, and `?all=1` for 5
    templates × 2 themes.
  - Fixtures: 14 slider configs covering every step-count bucket, 10 segmented configs (including 7×44-char labels,
    toolbar, disabled), toggles, select, number field, modal, buttons, badges, table, charts.
- Puppeteer matrix (`scratchpad/ui/ui_matrix.mjs`). Prefs are injected via `evaluateOnNewDocument` into localStorage.
  - Tier 1: 5 templates × 2 themes × 600/1000/1400 × key pages (home, wizard data/prepare/train/improve, lessons, a
    demo, library, a model, settings).
  - Tier 2: every renderer/orientation combo on the gallery.
  - Tier 3: shape × density × font.
  - Audits: horizontal overflow, clipped text, overlaps, approximate contrast, presence of footers and fixtures, console
    errors. Output is screenshots plus `report.json` and a markdown summary; errors fail the run.
  - Seeding goes through the API (project, iris sample, prepare, train, save).
- Static checks: `tsc`, `vite build`, and a grep gate for `backdrop-filter` ordering and `:root[data-` selectors.

## 6. Work split
- **Main session first:**
  - `design/prefs.ts` and `design/apply.ts`.
  - The `useUI` extension, API prefs calls, and backend routes.
  - The `tokens.css` variable refactor, a visual no-op checked with before/after screenshots.
  - `modifiers.css`, plus stubs for `controls.css`, `templates.css` and `backgrounds.css`.
  - The `index.html` pre-paint script, CSS import order, AppShell plumbing, the Wizard `data-portal`, the router dev
    route, and palettes in `lib/colors.ts`.
  - A stub `controls/resolve.ts` with the final signatures, and the call-site opt-outs.
- **Builder A (primitives, resolve rules, gallery):** `components/glass/controls/*`, `components/glass/misc.tsx`
  (Background), `overlays.tsx`, `index.ts`, `design/controls.css`, `design/fixtures.tsx`, `pages/DevGallery.tsx`.
- **Builder B (templates, backgrounds, Settings UI):** `design/templates.css`, `design/backgrounds.css`,
  `design/templates.ts`, `components/settings/appearance/**`, `pages/Settings.tsx`.
- **Main session after:** build, run the matrix, fix cross-cutting issues, commit.
- **Phase 2 later:** tokenise leftover hard-coded colours (`SPLIT_COLORS`, the demo `C` palette, the threshold tuner,
  white-on-bar text, black shadows).

## 7. Risks
- Performance: aurora blur only with full motion, and no blur in flat templates (faster).
- Accessibility: contrast per template (audited), solid focus rings, real inputs behind radio/checkbox, aria on
  steppers, motion levels.
- Reflow when renderers change height: toolbar kind and width caps keep it in check.
- Measure-then-fallback flash: hide the first frame.
- Prefs across ports: server copy.
- Cascade order.
- `layoutId` keyed by renderer.
- Native select in dark mode via `color-scheme`.
- Printing: fixed by the print block.
- Palette switch remounts `<main>`.
