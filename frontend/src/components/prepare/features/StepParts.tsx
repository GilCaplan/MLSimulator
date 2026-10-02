import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { spring } from "../../../design/motion";
import { colorAt } from "../../../lib/colors";
import { fmt } from "../../../lib/format";
import type { ColumnSummary, Histogram as H } from "../../../lib/types";
import { MiniHist } from "../../charts";
import { Tooltip } from "../../glass";
import { DATE_PARTS, FUNCTIONS, IDENT, type DatePart } from "./featureOps";

/* ------------------------------------------------------------------ small pill chip */

export function Chip({ on, onClick, children, title, disabled, mono }: {
  on?: boolean; onClick?: () => void; children: React.ReactNode; title?: string; disabled?: boolean; mono?: boolean;
}) {
  return (
    <motion.button
      type="button"
      layout
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.93 }}
      transition={spring.snappy}
      title={title}
      className={mono ? "mono" : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, fontSize: 12, cursor: disabled ? "not-allowed" : "pointer",
        border: `1px solid ${on ? "var(--accent)" : "var(--hairline)"}`, background: on ? "var(--accent-soft)" : "var(--fill)",
        color: disabled ? "var(--text-3)" : on ? "var(--text)" : "var(--text-2)", fontWeight: on ? 600 : 500, opacity: disabled ? 0.6 : 1,
        transition: "border-color .15s, background .15s",
      }}
    >
      {children}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ date parts multi-select */

export function PartsPicker({ value, onChange }: { value: DatePart[]; onChange: (v: DatePart[]) => void }) {
  const set = new Set(value);
  const toggle = (p: DatePart) => onChange(DATE_PARTS.map((d) => d.value).filter((d) => (d === p ? !set.has(d) : set.has(d))));
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {DATE_PARTS.map((d) => (
        <Chip key={d.value} on={set.has(d.value)} onClick={() => toggle(d.value)} title={d.hint}>
          <AnimatePresence initial={false}>
            {set.has(d.value) && (
              <motion.span key="tick" initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }} style={{ overflow: "hidden", color: "var(--accent)", fontWeight: 700 }}>✓</motion.span>
            )}
          </AnimatePresence>
          {d.label}
          <span className="faint" style={{ fontSize: 10.5 }}>{d.hint}</span>
        </Chip>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ formula editor */

export function FormulaEditor({ value, onChange, columns, target }: {
  value: string; onChange: (v: string) => void; columns: string[]; target: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const insert = (text: string, caretInside?: boolean) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length, end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start), after = value.slice(end);
    const pad = before && !/[\s(,]$/.test(before) && !caretInside ? " " : "";
    const next = before + pad + text + after;
    onChange(next);
    const caret = before.length + pad.length + (caretInside && text.includes("(") ? text.indexOf("(") + 1 : text.length);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };
  const usesTarget = new RegExp(`(^|[^A-Za-z0-9_])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9_])`).test(value);
  return (
    <div className="col" style={{ gap: 8, width: "100%" }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="mono faint" style={{ fontSize: 13 }}>=</span>
        <input
          ref={ref}
          className="input mono grow"
          value={value}
          spellCheck={false}
          placeholder="e.g. weight_kg / height_m ** 2"
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 13, height: 36 }}
        />
      </div>
      {usesTarget && (
        <span className="small" style={{ color: "var(--danger)" }}>⛔ This uses “{target}”, the column you're predicting. At prediction time it won't exist — and in training it's cheating.</span>
      )}
      <div className="col" style={{ gap: 5 }}>
        <span className="tiny faint">Click to insert a column</span>
        <div className="row wrap" style={{ gap: 5 }}>
          {columns.map((c) => {
            const ok = IDENT.test(c);
            return (
              <Chip key={c} mono disabled={!ok} onClick={() => insert(c)} title={ok ? `Insert ${c}` : "Names with spaces or symbols can't be used in formulas"}>{c}</Chip>
            );
          })}
        </div>
      </div>
      <div className="col" style={{ gap: 5 }}>
        <span className="tiny faint">Operators <span className="mono">+ − * / ** ( )</span> and comparisons <span className="mono">&gt; &lt; ==</span> · functions:</span>
        <div className="row wrap" style={{ gap: 5 }}>
          {FUNCTIONS.map((f) => (
            <Tooltip key={f.sig} content={<><b className="mono">{f.sig}</b> — {f.help}</>} width={200}>
              <Chip mono onClick={() => insert(f.insert, true)}>{f.sig.split("(")[0]}()</Chip>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ quantile buckets on the source histogram */

/** Colours the source column's histogram bars by the (approximate) quantile bucket they fall into. */
export function BucketPreview({ hist, bins }: { hist?: H; bins: number }) {
  if (!hist?.counts?.length) return null;
  const total = hist.counts.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(1, ...hist.counts);
  let cum = 0;
  const bucketOf = hist.counts.map((c) => {
    const mid = (cum + c / 2) / total;
    cum += c;
    return Math.min(bins - 1, Math.floor(mid * bins));
  });
  const W = 260, Hh = 54, bw = W / hist.counts.length;
  return (
    <div className="col" style={{ gap: 4 }}>
      <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" style={{ display: "block", maxWidth: 320 }}>
        {hist.counts.map((c, i) => (
          <motion.rect
            key={i}
            x={i * bw + 0.5}
            width={Math.max(1, bw - 1)}
            rx={1.5}
            initial={false}
            animate={{ y: Hh - (c / max) * Hh, height: (c / max) * Hh, fill: colorAt(bucketOf[i]) }}
            transition={spring.gentle}
            opacity={0.85}
          />
        ))}
      </svg>
      <span className="tiny muted">Each colour is one bucket — the edges sit where each holds about {Math.round(100 / bins)}% of the rows.</span>
    </div>
  );
}

/* ------------------------------------------------------------------ preview of one new column */

export function ColumnPreview({ col, index, loading }: { col?: ColumnSummary; name: string; index: number; loading: boolean }) {
  if (!col) return <div className="skeleton" style={{ height: 52, borderRadius: 12, opacity: loading ? 1 : 0.5 }} />;
  const color = colorAt(index + 2);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.gentle}
      style={{ padding: "8px 10px", borderRadius: 12, background: "var(--glass-strong)", border: "1px solid var(--hairline)", display: "flex", flexDirection: "column", gap: 5 }}
    >
      <div className="row between" style={{ gap: 8 }}>
        <span className="mono truncate" style={{ fontSize: 12, fontWeight: 650 }} title={col.name}>✨ {col.name}</span>
        <span className={`badge ${col.role === "numeric" ? "accent" : "success"}`} style={{ fontSize: 10 }}>{col.role === "numeric" ? "number" : "category"}</span>
      </div>
      {col.histogram ? (
        <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <MiniHist data={col.histogram} width={110} height={26} color={color} />
          {col.stats && (
            <span className="tiny muted num" style={{ lineHeight: 1.4 }}>
              {fmt(col.stats.min)} … {fmt(col.stats.max)}<br />avg <b style={{ color: "var(--text)" }}>{fmt(col.stats.mean)}</b>
            </span>
          )}
        </div>
      ) : col.top ? (
        <TopBars top={col.top} />
      ) : (
        <span className="tiny faint">No values to show.</span>
      )}
      {col.missing > 0 && (
        <span className="tiny" style={{ color: "var(--warning)" }}>🕳️ {col.missing.toLocaleString()} blank (e.g. divide by zero) — filled like other blanks.</span>
      )}
      {col.unique <= 1 && <span className="tiny" style={{ color: "var(--warning)" }}>⚠️ Every row has the same value — this tells the model nothing.</span>}
    </motion.div>
  );
}

function TopBars({ top }: { top: NonNullable<ColumnSummary["top"]> }) {
  // bucket labels like "22–39" read best in numeric order
  const ranged = top.labels.every((l) => /^-?[\d.]+(e[+-]?\d+)?–/.test(l));
  const order = top.labels.map((_, i) => i);
  if (ranged) order.sort((a, b) => parseFloat(top.labels[a]) - parseFloat(top.labels[b]));
  const shown = order.slice(0, 6).map((i) => top.labels[i]);
  const counts = order.slice(0, 6).map((i) => top.counts[i]);
  const max = Math.max(1, ...top.counts);
  return (
    <div className="col" style={{ gap: 3 }}>
      {shown.map((l, i) => (
        <div key={l} className="row" style={{ gap: 6 }}>
          <span className="tiny mono truncate" style={{ width: 86, color: "var(--text-2)" }} title={l}>{l}</span>
          <div style={{ flex: 1, height: 7, borderRadius: 4, background: "var(--fill)", overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${(counts[i] / max) * 100}%` }} transition={{ ...spring.gentle, delay: i * 0.04 }}
              style={{ height: "100%", borderRadius: 4, background: colorAt(i) }} />
          </div>
          <span className="tiny num faint" style={{ width: 34, textAlign: "right" }}>{counts[i]}</span>
        </div>
      ))}
      {(top.labels.length > shown.length || top.other > 0) && <span className="tiny faint">+ more</span>}
    </div>
  );
}
