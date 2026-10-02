/* Gallery metadata for the site templates and background templates (Settings → Appearance). The look itself lives in
 * templates.css / backgrounds.css; what picking a template also changes lives in prefs.ts TEMPLATE_PRESETS. */
import { TEMPLATE_PRESETS, type BackgroundId, type MotionLevel, type TemplateId } from "./prefs";

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  icon: string;
  /** one line: what it looks like */
  blurb: string;
  /** who it's for / when to pick it */
  hint: string;
  background: BackgroundId;
  motion: MotionLevel;
  /** a few words that describe the template's character (shown as tiny tags) */
  traits: string[];
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: "glass", name: "Liquid Glass", icon: "🫧",
    blurb: "Frosted, translucent panels floating over soft colour. The original look.",
    hint: "Best with the Aurora background and full motion.",
    background: TEMPLATE_PRESETS.glass.background, motion: "full",
    traits: ["Translucent", "Blur", "Glossy"],
  },
  {
    id: "classic", name: "Classic", icon: "🖥️",
    blurb: "Old-school desktop: bevelled buttons, pressed toggles, crisp system fonts.",
    hint: "Feels like a familiar desktop app. Plain background, reduced motion.",
    background: TEMPLATE_PRESETS.classic.background, motion: "reduced",
    traits: ["Bevels", "No blur", "Small corners"],
  },
  {
    id: "minimal", name: "Minimal", icon: "◻️",
    blurb: "Flat and monochrome. Hairline borders, no shadows, lots of breathing room.",
    hint: "Calm and distraction-free. Best on a plain white (or black) page.",
    background: TEMPLATE_PRESETS.minimal.background, motion: "reduced",
    traits: ["Flat", "Hairlines", "Ink accents"],
  },
  {
    id: "solid", name: "Solid", icon: "🧱",
    blurb: "Bold and opaque: thick outlines, chunky sticker shadows, no gradients.",
    hint: "High contrast and easy to scan. Great on bright screens.",
    background: TEMPLATE_PRESETS.solid.background, motion: "full",
    traits: ["Opaque", "2px outlines", "Bold"],
  },
  {
    id: "paper", name: "Paper", icon: "📜",
    blurb: "Warm cream pages, serif headings and soft paper shadows.",
    hint: "Cosy and readable, like a printed notebook. Dotted paper background.",
    background: TEMPLATE_PRESETS.paper.background, motion: "reduced",
    traits: ["Warm", "Serif headings", "Soft shadows"],
  },
];

export const templateMeta = (id: TemplateId) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

export interface BackgroundMeta { id: BackgroundId; name: string; blurb: string }

export const BACKGROUNDS: BackgroundMeta[] = [
  { id: "aurora", name: "Aurora", blurb: "Slow-drifting colour blobs (still when motion is off)" },
  { id: "solid", name: "Solid", blurb: "The template's page colour" },
  { id: "gradient", name: "Gradient", blurb: "A gentle diagonal fade" },
  { id: "dots", name: "Dots", blurb: "A fine dotted-paper pattern" },
  { id: "grid", name: "Grid", blurb: "Graph-paper lines" },
  { id: "none", name: "None", blurb: "Pure white (or black)" },
];
