import { motion } from "framer-motion";
import { useState } from "react";
import { stagger } from "../../../design/motion";
import { BACKGROUNDS, templateMeta } from "../../../design/templates";
import { useUI } from "../../../lib/store";
import { Glass } from "../../glass";
import { ColourShapePanel } from "./ColourShapePanel";
import { ControlsPanel } from "./ControlsPanel";
import { DensityMotionPanel } from "./DensityMotionPanel";
import { PrefsToolbar } from "./PrefsToolbar";
import { PreviewSandbox } from "./PreviewSandbox";
import { SectionCard, SubHead, type PreviewWidth } from "./shared";
import { TemplateGallery } from "./TemplateGallery";
import { BackgroundPicker, ThemePicker } from "./ThemeBackground";

/** Settings → Appearance · Look & feel: a full-width stack of section cards. Every change applies (and saves) instantly. */
export function AppearancePanel() {
  const [width, setWidth] = useState<PreviewWidth>(1000);
  const prefs = useUI((s) => s.prefs);
  const t = templateMeta(prefs.template);
  const bg = BACKGROUNDS.find((b) => b.id === prefs.background)?.name;
  return (
    <motion.section variants={stagger(0.06)} className="col" style={{ gridColumn: "1 / -1", gap: 18 }} aria-label="Appearance">
      <Glass animate_in>
        <div className="row between wrap" style={{ gap: 16, alignItems: "flex-start" }}>
          <div className="col" style={{ gap: 4, minWidth: 0, flex: "1 1 320px" }}>
            <span className="eyebrow">Appearance</span>
            <h2 style={{ fontSize: 22 }}>Look &amp; feel</h2>
            <span className="small muted" style={{ lineHeight: 1.5, maxWidth: 560 }}>
              Make ML Playground yours: a whole-site template, background, colours, and how every slider, choice and switch is
              shown. Changes apply everywhere instantly and are remembered.
            </span>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              <span className="badge accent">{t.icon} {t.name}</span>
              <span className="badge">{bg} background</span>
              <span className="badge">{prefs.density}</span>
              <span className="badge">{prefs.motion} motion</span>
            </div>
          </div>
          <PrefsToolbar width={width} setWidth={setWidth} />
        </div>
      </Glass>

      <SectionCard icon="🎨" title="Template" subtitle="A whole-site style. Each tile is a live preview. Picking one also sets its best background." reset="template">
        <SubHead>Theme</SubHead>
        <ThemePicker />
        <SubHead hint="Your accent colour, density and controls carry over">Site template</SubHead>
        <TemplateGallery />
        <SubHead hint="Drawn behind every page">Background</SubHead>
        <BackgroundPicker />
      </SectionCard>

      <SectionCard icon="🖌️" title="Colours & shape" subtitle="Accent colour for buttons and highlights, corner style, fonts, and the colours used in charts." reset="colours">
        <ColourShapePanel />
      </SectionCard>

      <SectionCard
        icon="🎛️"
        title="Controls"
        subtitle="Choose how each kind of control is shown across the whole app. If a choice doesn't fit somewhere, that control adapts and the badge tells you why."
        reset="controls"
      >
        <ControlsPanel />
      </SectionCard>

      <SectionCard icon="📐" title="Density & motion" subtitle="How tightly things are packed, and how much the interface moves." reset="density">
        <DensityMotionPanel />
      </SectionCard>

      <SectionCard icon="🧪" title="Preview" subtitle="A pretend wizard page with your current settings, at different window widths.">
        <PreviewSandbox width={width} setWidth={setWidth} />
      </SectionCard>
    </motion.section>
  );
}
