import type { CSSProperties } from "react";

/** Native dropdown for long / dynamic lists. Always a dropdown (templates restyle it via .select and the --input-* / --control-h variables). */
export function Select<T extends string>({ value, options, onChange, style }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; style?: CSSProperties }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)} style={style}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
