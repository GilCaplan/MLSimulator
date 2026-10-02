import type { CSSProperties, ReactNode } from "react";
import { prefAttrs, prefVars, resolveTheme, type ResolvedTheme } from "../../../design/apply";
import type { UIPrefs } from "../../../design/prefs";
import { useUI } from "../../../lib/store";
import { Glass } from "../../glass";
import "./appearance.css";

export type PrefsSection = "template" | "colours" | "controls" | "density";
export type PreviewWidth = 600 | 1000 | 1400;

/** A Glass card for one Appearance section: icon, title, one-line explanation and a "Reset" link. */
export function SectionCard({ icon, title, subtitle, reset, right, children, id }: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** which part of the prefs the Reset link restores */
  reset?: PrefsSection;
  right?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const resetPrefs = useUI((s) => s.resetPrefs);
  return (
    <Glass animate_in id={id} style={{ scrollMarginTop: 66 }}>
      <div className="ap-sec-head">
        <div className="row" style={{ gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <span className="ap-sec-icon" aria-hidden>{icon}</span>
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <h3>{title}</h3>
            {subtitle && <span className="small muted" style={{ lineHeight: 1.5, maxWidth: 640 }}>{subtitle}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {right}
          {reset && <ResetLink onClick={() => resetPrefs(reset)} />}
        </div>
      </div>
      {children}
    </Glass>
  );
}

export function ResetLink({ onClick, label = "Reset" }: { onClick: () => void; label?: string }) {
  return (
    <button className="ap-reset" onClick={onClick} title="Back to the defaults for this section">
      <span aria-hidden>↺</span> {label}
    </button>
  );
}

/** Small uppercase sub-heading inside a section, with an optional hint on the right. */
export function SubHead({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="ap-sub">
      <span className="ap-sub-title">{children}</span>
      {hint && <span className="tiny faint">{hint}</span>}
    </div>
  );
}

/** A selectable card (radio-like). */
export function OptionCard({ selected, onClick, children, className = "", style, label, title }: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** accessible name when the content is mostly visual */
  label?: string;
  title?: string;
}) {
  // a div (not a <button>): some cards contain live previews with real buttons inside
  return (
    <div
      role="radio"
      tabIndex={0}
      aria-checked={selected}
      aria-label={label}
      title={title}
      className={`ap-card ${selected ? "selected" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={style}
    >
      {selected && <span className="ap-check" aria-hidden>✓</span>}
      {children}
    </div>
  );
}

/** Spreadable props that make an element render with these prefs (same CSS as the page: data-* + inline accent vars). */
export function scopeProps(p: UIPrefs, theme?: ResolvedTheme, style?: CSSProperties) {
  return { ...prefAttrs(p, theme ?? resolveTheme(p.theme)), style: { ...(prefVars(p) as CSSProperties), ...style } };
}
