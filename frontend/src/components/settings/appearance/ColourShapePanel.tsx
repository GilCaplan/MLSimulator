import { resolveTheme } from "../../../design/apply";
import { ACCENTS, accentOf, ENUMS, mergePrefs, type AccentId, type ChartPaletteId, type FontId, type ShapeId } from "../../../design/prefs";
import { PALETTES } from "../../../lib/colors";
import { useUI } from "../../../lib/store";
import { OptionCard, scopeProps, SubHead } from "./shared";

const SHAPES: Record<ShapeId, { name: string; desc: string }> = {
  auto: { name: "Auto", desc: "The template's own corners" },
  sharp: { name: "Sharp", desc: "Square, technical" },
  soft: { name: "Soft", desc: "Gently rounded" },
  round: { name: "Round", desc: "Friendly curves" },
  pill: { name: "Pill", desc: "Everything capsule-shaped" },
};
const FONTS: Record<FontId, { name: string; desc: string }> = {
  auto: { name: "Auto", desc: "The template's fonts" },
  system: { name: "System", desc: "Your computer's UI font" },
  humanist: { name: "Humanist", desc: "Warm and rounded (Avenir)" },
  serif: { name: "Serif", desc: "Bookish and classic" },
  mono: { name: "Mono", desc: "Typewriter / code look" },
};
const PALETTE_NAMES: Record<ChartPaletteId, { name: string; desc: string }> = {
  apple: { name: "Apple", desc: "Bright system colours" },
  vivid: { name: "Vivid", desc: "Maximum distinction" },
  pastel: { name: "Pastel", desc: "Soft and light" },
  colorblind: { name: "Colour-blind safe", desc: "Okabe–Ito: readable for everyone" },
  mono: { name: "Mono", desc: "Shades of blue and grey" },
};

export function ColourShapePanel() {
  const prefs = useUI((s) => s.prefs);
  const patchPrefs = useUI((s) => s.patchPrefs);
  const theme = resolveTheme(prefs.theme);
  const custom = accentOf({ accent: "custom", accentCustom: prefs.accentCustom }).c;
  return (
    <div className="col" style={{ gap: 0 }}>
      <SubHead hint={prefs.accent === "custom" ? <span className="mono">{custom}</span> : ACCENTS[prefs.accent as Exclude<AccentId, "custom">]?.label}>
        Accent colour
      </SubHead>
      <div className="ap-accents" role="radiogroup" aria-label="Accent colour">
        {(Object.keys(ACCENTS) as Exclude<AccentId, "custom">[]).map((id) => {
          const a = ACCENTS[id];
          const sel = prefs.accent === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={a.label}
              title={a.label}
              className={`ap-accent ${sel ? "selected" : ""}`}
              style={{ background: a.c, color: a.contrast }}
              onClick={() => patchPrefs({ accent: id })}
            />
          );
        })}
        <label
          className={`ap-accent ap-accent-custom ${prefs.accent === "custom" ? "selected" : ""}`}
          title="Custom colour…"
          style={prefs.accent === "custom" ? { background: custom, color: accentOf(prefs).contrast } : undefined}
        >
          <input
            type="color"
            aria-label="Custom accent colour"
            value={custom}
            onChange={(e) => patchPrefs({ accent: "custom", accentCustom: e.target.value })}
          />
        </label>
        <span className="tiny faint">Custom</span>
      </div>

      <SubHead hint="Corners of panels, buttons and fields">Shape</SubHead>
      <div className="ap-grid cols-auto-150" role="radiogroup" aria-label="Shape">
        {ENUMS.shape.map((id) => (
          <OptionCard key={id} selected={prefs.shape === id} onClick={() => patchPrefs({ shape: id })} label={`${SHAPES[id].name} corners`}>
            <div className="ap-sample" {...scopeProps(mergePrefs(prefs, { shape: id }), theme)}>
              <span className="ap-shape-box" />
              <span className="ap-shape-pill" />
              <span className="ap-shape-ctl" />
            </div>
            <div className="col" style={{ gap: 1 }}>
              <span className="ap-card-title">{SHAPES[id].name}</span>
              <span className="ap-card-desc">{SHAPES[id].desc}</span>
            </div>
          </OptionCard>
        ))}
      </div>

      <SubHead hint="Headings use the display face, text the body face">Font</SubHead>
      <div className="ap-grid cols-auto-150" role="radiogroup" aria-label="Font">
        {ENUMS.font.map((id) => (
          <OptionCard key={id} selected={prefs.font === id} onClick={() => patchPrefs({ font: id })} label={`${FONTS[id].name} font`}>
            <div className="ap-sample col" {...scopeProps(mergePrefs(prefs, { font: id }), theme, { gap: 6, justifyContent: "center" })}>
              <span className="ap-font-aa">Aa</span>
              <span className="ap-font-num">0123 · 94%</span>
            </div>
            <div className="col" style={{ gap: 1 }}>
              <span className="ap-card-title">{FONTS[id].name}</span>
              <span className="ap-card-desc">{FONTS[id].desc}</span>
            </div>
          </OptionCard>
        ))}
      </div>

      <SubHead hint="Colours of classes and model lines in every chart">Chart palette</SubHead>
      <div className="ap-grid cols-auto-280" role="radiogroup" aria-label="Chart palette">
        {ENUMS.chartPalette.map((id) => (
          <OptionCard key={id} selected={prefs.chartPalette === id} onClick={() => patchPrefs({ chartPalette: id })} className="ap-pal" label={`${PALETTE_NAMES[id].name} palette`}>
            <div className="col" style={{ gap: 1, width: 118, flexShrink: 0 }}>
              <span className="ap-card-title">{PALETTE_NAMES[id].name}</span>
              <span className="ap-card-desc">{PALETTE_NAMES[id].desc}</span>
            </div>
            <div className="ap-pal-dots" style={{ paddingRight: 22 }}>
              {PALETTES[id].slice(0, 8).map((c, i) => <span key={i} className="ap-pal-dot" style={{ background: c }} />)}
            </div>
          </OptionCard>
        ))}
      </div>
    </div>
  );
}
