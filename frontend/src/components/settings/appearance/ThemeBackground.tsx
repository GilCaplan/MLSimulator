import type { ReactNode } from "react";
import { resolveTheme, type ResolvedTheme } from "../../../design/apply";
import { mergePrefs, type BackgroundId, type Theme } from "../../../design/prefs";
import { BACKGROUNDS, templateMeta } from "../../../design/templates";
import { useUI } from "../../../lib/store";
import { OptionCard, scopeProps } from "./shared";

/** A small scoped swatch: page background + one glass chip, in the given theme. */
function ThemeSwatch({ theme, style }: { theme: ResolvedTheme; style?: React.CSSProperties }) {
  const prefs = useUI((s) => s.prefs);
  const s = scopeProps(prefs, theme, { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", ...style });
  return (
    <div className="bg-swatch" {...s}>
      <div className="glass" style={{ width: "62%", height: 22, borderRadius: "var(--r-sm)", display: "flex", alignItems: "center", gap: 4, padding: "0 6px" }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)" }} />
        <span style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--text-3)", opacity: 0.6 }} />
      </div>
    </div>
  );
}

const THEMES: { id: Theme; name: string; desc: string; icon: string }[] = [
  { id: "auto", name: "Auto", desc: "Follows your Mac's appearance", icon: "🌓" },
  { id: "light", name: "Light", desc: "Always light", icon: "☀️" },
  { id: "dark", name: "Dark", desc: "Always dark", icon: "🌙" },
];

export function ThemePicker() {
  const theme = useUI((s) => s.prefs.theme);
  const setTheme = useUI((s) => s.setTheme);
  return (
    <div className="ap-grid cols-3" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <OptionCard key={t.id} selected={theme === t.id} onClick={() => setTheme(t.id)} label={`${t.name} theme`} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 8 }}>
          <div style={{ width: 76, height: 48, flexShrink: 0, display: "flex", borderRadius: "calc(var(--r-md) - 4px)", overflow: "hidden", border: "1px solid var(--hairline)" }}>
            {t.id === "auto" ? (
              <>
                <ThemeSwatch theme="light" />
                <ThemeSwatch theme="dark" />
              </>
            ) : (
              <ThemeSwatch theme={t.id} />
            )}
          </div>
          <div className="col" style={{ gap: 1, minWidth: 0, paddingRight: 22 }}>
            <span className="ap-card-title"><span aria-hidden>{t.icon}</span> {t.name}</span>
            <span className="ap-card-desc">{t.desc}</span>
          </div>
        </OptionCard>
      ))}
    </div>
  );
}

/** Six background swatches rendered with the same [data-background] CSS as the page, in the current template + theme. */
export function BackgroundPicker() {
  const prefs = useUI((s) => s.prefs);
  const patchPrefs = useUI((s) => s.patchPrefs);
  const theme = resolveTheme(prefs.theme);
  const rec = templateMeta(prefs.template).background;
  return (
    <div className="ap-bg-grid" role="radiogroup" aria-label="Background">
      {BACKGROUNDS.map((b) => {
        const p = mergePrefs(prefs, { background: b.id as BackgroundId });
        return (
          <OptionCard key={b.id} selected={prefs.background === b.id} onClick={() => patchPrefs({ background: b.id })} label={`${b.name} background`} title={b.blurb} className="ap-bg-card">
            <div className="ap-bg-swatch bg-swatch" {...scopeProps(p, theme)}>
              <div className="glass" />
            </div>
            <div className="row" style={{ gap: 6, padding: "0 2px", justifyContent: "space-between" }}>
              <span className="small" style={{ fontWeight: 600 }}>{b.name}</span>
              {rec === b.id && <Star />}
            </div>
          </OptionCard>
        );
      })}
    </div>
  );
}

function Star(): ReactNode {
  return <span className="tiny" title="Recommended for this template" style={{ color: "var(--accent)", fontWeight: 700 }}>★ best</span>;
}
