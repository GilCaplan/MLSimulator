import { useEffect, useState } from "react";
import { fmt } from "../../lib/format";
import type { InputSchemaItem } from "../../lib/types";

export type Row = Record<string, number | string>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The "typical example": median for numbers, the most common value for categories. */
export function typicalRow(schema: InputSchemaItem[]): Row {
  const row: Row = {};
  for (const s of schema) {
    if (s.type === "categorical") row[s.name] = s.mode ?? s.categories?.[0] ?? "";
    else if (s.type === "datetime" || s.type === "text") row[s.name] = s.example ?? (s.type === "text" ? "Type your text here" : "");
    else if (s.binary) row[s.name] = (s.median ?? 0) >= 0.5 ? (s.max ?? 1) : (s.min ?? 0);
    else {
      const v = s.median ?? s.mean ?? s.min ?? 0;
      row[s.name] = s.integer ? Math.round(v) : v;
    }
  }
  return row;
}

/** A plausible random example: a bell curve around the training mean, kept inside the training range. */
export function randomRow(schema: InputSchemaItem[]): Row {
  const row: Row = {};
  for (const s of schema) {
    if (s.type === "categorical") {
      const cats = s.categories ?? [];
      row[s.name] = cats.length ? cats[Math.floor(Math.random() * cats.length)] : "";
      continue;
    }
    if (s.type === "datetime" || s.type === "text") {
      row[s.name] = s.example ?? "";
      continue;
    }
    const lo = s.min ?? 0, hi = s.max ?? 1;
    if (s.binary) {
      const pOn = s.mean !== undefined && hi !== lo ? (s.mean - lo) / (hi - lo) : 0.5;
      row[s.name] = Math.random() < Math.max(0.15, Math.min(0.85, pOn)) ? hi : lo;
      continue;
    }
    let v: number;
    if (s.mean !== undefined && s.std) {
      // Box–Muller normal sample
      const u = 1 - Math.random(), w = Math.random();
      v = s.mean + s.std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
    } else v = lo + Math.random() * (hi - lo);
    v = clamp(v, lo, hi);
    row[s.name] = s.integer ? Math.round(v) : Number(v.toPrecision(4));
  }
  return row;
}

/** Short value label for slider read-outs. */
export const shortVal = (v: number, integer?: boolean) =>
  integer ? (Math.abs(v) >= 10000 ? fmt(v) : String(Math.round(v))) : fmt(v, Math.abs(v) >= 100 ? 1 : 2);

/** Sensible slider step from the training range. */
export function stepFor(s: InputSchemaItem): number | undefined {
  if (s.integer) return 1;
  const span = (s.max ?? 1) - (s.min ?? 0);
  if (!span) return undefined;
  const raw = span / 200;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return Number((Math.ceil(raw / mag) * mag).toPrecision(2));
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
