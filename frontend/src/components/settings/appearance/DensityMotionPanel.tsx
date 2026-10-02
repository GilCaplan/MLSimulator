import { resolveTheme } from "../../../design/apply";
import { mergePrefs, type DensityId, type MotionLevel } from "../../../design/prefs";
import { useUI } from "../../../lib/store";
import { OptionCard, scopeProps, SubHead } from "./shared";

const DENSITY: { id: DensityId; name: string; desc: string }[] = [
  { id: "compact", name: "Compact", desc: "More on screen, smaller controls" },
  { id: "comfortable", name: "Comfortable", desc: "The balanced default" },
  { id: "spacious", name: "Spacious", desc: "Bigger targets, larger text" },
];
const MOTION: { id: MotionLevel; name: string; desc: string }[] = [
  { id: "full", name: "Full", desc: "Springs, slides and drifting backgrounds" },
  { id: "reduced", name: "Reduced", desc: "Quick fades only, no movement" },
  { id: "off", name: "Off", desc: "Nothing moves; the background is still" },
];

export function DensityMotionPanel() {
  const prefs = useUI((s) => s.prefs);
  const patchPrefs = useUI((s) => s.patchPrefs);
  const theme = resolveTheme(prefs.theme);
  return (
    <div className="col" style={{ gap: 0 }}>
      <SubHead hint="Control heights, padding and text size">Density</SubHead>
      <div className="ap-grid cols-3" role="radiogroup" aria-label="Density">
        {DENSITY.map((d) => (
          <OptionCard key={d.id} selected={prefs.density === d.id} onClick={() => patchPrefs({ density: d.id })} label={`${d.name} density`}>
            {/* a mini form rendered at real size in that density */}
            <div className="ap-sample col" {...scopeProps(mergePrefs(prefs, { density: d.id }), theme, { height: "auto", gap: "var(--gap-row)", padding: "var(--pad-card)" })}>
              <span style={{ fontWeight: 600, fontSize: "calc(var(--font-size) - 1px)" }}>Model name</span>
              <div className="row" style={{ gap: "var(--gap-row)" }}>
                <span className="input grow" style={{ display: "flex", alignItems: "center", color: "var(--text-2)" }}>Iris v2</span>
                <span className="btn primary sm" style={{ pointerEvents: "none" }}>Save</span>
              </div>
            </div>
            <div className="col" style={{ gap: 1 }}>
              <span className="ap-card-title">{d.name}</span>
              <span className="ap-card-desc">{d.desc}</span>
            </div>
          </OptionCard>
        ))}
      </div>

      <SubHead hint="Also follows your Mac's “Reduce motion” setting">Motion</SubHead>
      <div className="ap-grid cols-3" role="radiogroup" aria-label="Motion">
        {MOTION.map((m) => (
          <OptionCard key={m.id} selected={prefs.motion === m.id} onClick={() => patchPrefs({ motion: m.id })} label={`${m.name} motion`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <div data-motion={m.id} style={{ flexShrink: 0 }}>
              <div className="ap-motion-track"><span className="ap-motion-dot" /></div>
            </div>
            <div className="col" style={{ gap: 1, minWidth: 0, paddingRight: 18 }}>
              <span className="ap-card-title">{m.name}</span>
              <span className="ap-card-desc">{m.desc}</span>
            </div>
          </OptionCard>
        ))}
      </div>
    </div>
  );
}
