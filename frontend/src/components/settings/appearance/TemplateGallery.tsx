import { resolveTheme } from "../../../design/apply";
import { mergePrefs, TEMPLATE_PRESETS } from "../../../design/prefs";
import { BACKGROUNDS, TEMPLATES, templateMeta } from "../../../design/templates";
import { useUI } from "../../../lib/store";
import { MiniPreview } from "./MiniPreview";
import { OptionCard } from "./shared";

/** Five live template tiles. Picking one also applies its recommended background (TEMPLATE_PRESETS). */
export function TemplateGallery() {
  const prefs = useUI((s) => s.prefs);
  const applyTemplate = useUI((s) => s.applyTemplate);
  const patchPrefs = useUI((s) => s.patchPrefs);
  const theme = resolveTheme(prefs.theme);
  const cur = templateMeta(prefs.template);
  const offBg = cur.background !== prefs.background;
  const offMotion = cur.motion !== prefs.motion;
  const bgName = BACKGROUNDS.find((b) => b.id === cur.background)?.name ?? cur.background;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="ap-gallery" role="radiogroup" aria-label="Site template">
        {TEMPLATES.map((t) => {
          const selected = prefs.template === t.id;
          const p = selected ? prefs : mergePrefs(prefs, { template: t.id, ...TEMPLATE_PRESETS[t.id] });
          return (
            <OptionCard key={t.id} selected={selected} onClick={() => applyTemplate(t.id)} label={`${t.name} template`} style={{ padding: 8, gap: 8 }}>
              <MiniPreview prefs={p} theme={theme} />
              <div className="col" style={{ gap: 4, padding: "0 4px 4px" }}>
                <span className="ap-card-title">
                  <span aria-hidden style={{ marginRight: 6 }}>{t.icon}</span>
                  {t.name}
                </span>
                <span className="ap-card-desc">{t.blurb}</span>
                <div className="ap-tags" style={{ marginTop: 2 }}>
                  {t.traits.map((x) => <span key={x} className="ap-tag">{x}</span>)}
                </div>
              </div>
            </OptionCard>
          );
        })}
      </div>
      <div className="row wrap" style={{ gap: 10, minHeight: 28 }}>
        <span className="small muted">
          <span aria-hidden>💡 </span>
          {cur.hint}
        </span>
        {(offBg || offMotion) && (
          <button
            className="ap-reset"
            onClick={() => patchPrefs({ background: cur.background, motion: cur.motion })}
            title={`Background: ${bgName}, motion: ${cur.motion}`}
          >
            Use the recommended {offBg && offMotion ? `background (${bgName}) and ${cur.motion} motion` : offBg ? `background (${bgName})` : `${cur.motion} motion`}
          </button>
        )}
      </div>
    </div>
  );
}
