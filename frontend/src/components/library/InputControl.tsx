import { motion } from "framer-motion";
import type { InputSchemaItem } from "../../lib/types";
import { NumberField, Segmented, Select, Slider, Toggle, Tooltip } from "../glass";
import { shortVal, stepFor } from "./inputs";
import { WhatIfCurve } from "./WhatIfCurve";

export interface CurveData { x: number[]; y: number[] }

/** One auto-generated input: slider (+ what-if curve), switch, segmented pills or dropdown. */
export function InputControl({ item, value, onChange, curve, domain, color, formatY }: {
  item: InputSchemaItem;
  value: number | string;
  onChange: (v: number | string) => void;
  curve?: CurveData;
  domain: [number, number];
  color: string;
  formatY: (v: number) => string;
}) {
  const label = (
    <span className="truncate" style={{ fontWeight: 600, fontSize: 13 }} title={item.name}>{item.name}</span>
  );

  if (item.type === "datetime") {
    return (
      <div className="col" style={{ gap: 7 }}>
        <div className="row between" style={{ gap: 8 }}>
          {label}
          <Tooltip content="A date & time column. The model doesn't read it directly: it's split into parts (hour, weekday, month…) that were engineered during preparation. Type it in the same format as the example." width={240}>
            <span className="badge" style={{ height: 19, fontSize: 10.5, padding: "0 7px", cursor: "help" }}>📅 date & time</span>
          </Tooltip>
        </div>
        <input className="input mono" value={String(value ?? "")} placeholder={item.example || "2025-01-31 14:30"} spellCheck={false}
          onChange={(e) => onChange(e.target.value)} style={{ height: 34, fontSize: 12.5 }} />
        {item.example && String(value) !== item.example && (
          <button className="btn ghost sm" style={{ alignSelf: "flex-start", height: 22, fontSize: 11, padding: "0 8px" }} onClick={() => onChange(item.example!)}>↺ example: {item.example}</button>
        )}
      </div>
    );
  }

  if (item.type === "categorical") {
    const cats = item.categories ?? [];
    return (
      <div className="col" style={{ gap: 7 }}>
        <div className="row between" style={{ gap: 8 }}>
          {label}
          <span className="tiny faint">{cats.length} options</span>
        </div>
        {cats.length <= 4 ? (
          <Segmented kind="form" size="sm" full value={String(value)} onChange={onChange} options={cats.map((c) => ({ value: c, label: c }))} />
        ) : (
          <Select value={String(value)} onChange={onChange} options={cats.map((c) => ({ value: c, label: c }))} style={{ width: "100%" }} />
        )}
      </div>
    );
  }

  const lo = item.min ?? 0, hi = item.max ?? 1;
  const num = Number(value);

  if (item.binary) {
    const on = num >= (lo + hi) / 2;
    return (
      <div className="row between" style={{ gap: 8, minHeight: 34 }}>
        {label}
        <span className="row" style={{ gap: 8 }}>
          <span className="small muted" style={{ width: 26, textAlign: "right" }}>{on ? "Yes" : "No"}</span>
          <Toggle fixedRenderer="switch" checked={on} onChange={(v) => onChange(v ? hi : lo)} />
        </span>
      </div>
    );
  }

  const spread = curve ? Math.max(...curve.y) - Math.min(...curve.y) : 0;
  const lever = spread / (domain[1] - domain[0] || 1);
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          {label}
          {lever > 0.25 && (
            <Tooltip content="Moving this input changes the answer a lot — it's one of the model's big levers right now." width={220}>
              <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="badge warning" style={{ height: 19, fontSize: 10.5, padding: "0 7px", cursor: "help" }}>
                🔥 big lever
              </motion.span>
            </Tooltip>
          )}
        </span>
        <NumberField value={num} onChange={(v) => onChange(item.integer ? Math.round(v) : v)} step={stepFor(item)} width={92} style={{ height: 28, fontSize: 12.5 }} />
      </div>
      <Slider fixedRenderer="slider" valueBox={false} value={num} min={lo} max={hi} step={stepFor(item)} integer={item.integer} onChange={onChange} format={(v) => shortVal(v, item.integer)} />
      {curve && (
        <div style={{ paddingRight: 64, marginTop: -2 }}>
          <WhatIfCurve xs={curve.x} ys={curve.y} value={num} domain={domain} color={color} format={formatY} />
        </div>
      )}
    </div>
  );
}
