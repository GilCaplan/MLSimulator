import type { CSSProperties } from "react";
import type { CustomMetric } from "../../lib/types";
import { customKey } from "./custom";

export const MAKE = "__make_metric";
export const MANAGE = "__manage_metrics";

/**
 * The "Rank by" dropdown: built-in metrics, then a "Your metrics" group with the learner's own scores and the
 * "Make your own score…" entry. A native <select> (styled by the template's .select) so optgroups work.
 */
export function RankBySelect({ value, builtins, customs, label, lower, onChange, onMake, onManage, allowCustom = true, style }: {
  value: string;
  builtins: string[];
  customs: CustomMetric[];
  label: (m: string) => string;
  lower: (m: string) => boolean;
  onChange: (m: string) => void;
  onMake: () => void;
  onManage?: () => void;
  /** false for problems where only built-in metrics make sense */
  allowCustom?: boolean;
  style?: CSSProperties;
}) {
  const opt = (m: string, text: string) => <option key={m} value={m}>{text + (lower(m) ? " ↓" : "")}</option>;
  return (
    <select className="select" aria-label="Rank models by" value={value} style={style}
      onChange={(e) => {
        const v = e.target.value;
        if (v === MAKE) onMake();
        else if (v === MANAGE) onManage?.();
        else onChange(v);
      }}>
      {allowCustom ? (
        <>
          <optgroup label="Built-in">{builtins.map((m) => opt(m, label(m)))}</optgroup>
          <optgroup label="Your metrics">
            {customs.map((c) => opt(customKey(c.id), c.name))}
            <option value={MAKE}>＋ Make your own score…</option>
            {customs.length > 0 && onManage && <option value={MANAGE}>⚙︎ Manage your metrics…</option>}
          </optgroup>
        </>
      ) : builtins.map((m) => opt(m, label(m)))}
    </select>
  );
}
