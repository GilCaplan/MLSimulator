/* On/off control: switch (default), checkbox or a "No | Yes" toolbar choice — whichever the user prefers. */
import { motion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { BoolRenderer } from "../../../design/prefs";
import { Segmented } from "./Choice";
import { ReportResolved, useControlPrefs, useReportResolved } from "./context";
import { resolveBool } from "./resolve";
import { InfoTip } from "./Tooltip";

export function Toggle({ checked, onChange, label, help, disabled, fixedRenderer, allow }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  help?: ReactNode;
  disabled?: boolean;
  fixedRenderer?: BoolRenderer;
  allow?: BoolRenderer[];
}) {
  const prefs = useControlPrefs();
  const { renderer } = resolveBool(prefs.bool, fixedRenderer, allow);
  useReportResolved({ control: "bool", renderer, pref: prefs.bool, reason: renderer !== prefs.bool ? (fixedRenderer ? "fixed for this control" : `${prefs.bool} not offered here`) : null });
  const labelId = useId();
  const named = label ? { "aria-labelledby": labelId } : {};
  const caption = label ? (
    <span id={labelId} className="row toggle-label" style={{ gap: 6 }}>{label}{help && <InfoTip text={help} />}</span>
  ) : null;

  if (renderer === "checkbox") {
    const box = (
      <label className={`check${disabled ? " disabled" : ""}`}>
        <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="check-box" aria-hidden>
          <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        {label && <span className="check-label">{label}</span>}
      </label>
    );
    if (!label) return box;
    // help tip sits outside the <label> so hovering/clicking it doesn't toggle the box
    return (
      <div className="row check-row" style={{ gap: 6 }}>
        {box}
        {help && <InfoTip text={help} />}
      </div>
    );
  }

  if (renderer === "yesno") {
    const yn = (
      <span role="group" {...named} className="yesno">
        <ReportResolved onReport={null}>
          <Segmented<"no" | "yes">
            size="sm"
            fixedRenderer="segmented"
            value={checked ? "yes" : "no"}
            onChange={(v) => { if (!disabled) onChange(v === "yes"); }}
            options={[{ value: "no", label: "No", disabled }, { value: "yes", label: "Yes", disabled }]}
          />
        </ReportResolved>
      </span>
    );
    if (!label) return yn;
    return <div className="row between toggle-row" style={{ gap: 12 }}>{caption}{yn}</div>;
  }

  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`switch${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
      {...named}
    >
      <motion.span layout transition={spring.snappy} className="switch-thumb" />
    </button>
  );
  if (!label) return sw;
  return <div className="row between toggle-row" style={{ gap: 12 }}>{caption}{sw}</div>;
}
