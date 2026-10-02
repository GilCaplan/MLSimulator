import { useState, type CSSProperties } from "react";

/** Editable number box: commits (clamped to min/max) on blur or Enter. */
export function NumberField({ value, onChange, min, max, step = 1, style, width = 90, ariaLabel }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  style?: CSSProperties;
  width?: number;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (s: string) => {
    const v = Number(s);
    if (s.trim() !== "" && !Number.isNaN(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
    setDraft(null);
  };
  return (
    <input
      className="input num"
      type="number"
      step={step}
      min={min}
      max={max}
      aria-label={ariaLabel}
      value={draft ?? String(value ?? "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      style={{ width, ...style }}
    />
  );
}
