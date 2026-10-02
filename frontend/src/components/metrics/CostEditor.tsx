import { motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../design/motion";
import { classColor } from "../../lib/colors";
import type { RunResult } from "../../lib/types";
import { Slider } from "../glass";
import { fmtCost } from "./custom";

/** A square grid of costs with zeros on the diagonal (right answers are free). */
export const defaultMatrix = (k: number) => Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 0 : 1)));

/* ------------------------------------------------------------------ classification */

/** "Cost of predicting X when it's really Y" grid. Rows = the real answer, columns = what the model says. */
export function CostGrid({ classes, matrix, onChange }: { classes: string[]; matrix: number[][]; onChange: (m: number[][]) => void }) {
  const k = classes.length;
  const max = Math.max(1, ...matrix.flat());
  const set = (i: number, j: number, v: number) => onChange(matrix.map((row, a) => row.map((c, b) => (a === i && b === j ? v : c))));
  const binary = k === 2;
  return (
    <div className="col" style={{ gap: 10 }}>
      <span className="small muted" style={{ lineHeight: 1.5 }}>
        Each box is what <b>one</b> answer costs you. Right answers (the diagonal) are usually free. Use any unit you like — pounds, minutes, or just points.
        We count each model's mistakes on the test rows and work out its <b>average cost per prediction</b>.
      </span>
      <div className="row wrap" style={{ gap: 6 }}>
        <button type="button" className="btn sm" onClick={() => onChange(defaultMatrix(k))}>Every mistake costs 1</button>
        {binary && (
          <button type="button" className="btn sm" onClick={() => onChange([[0, 5], [500, 0]])} title={`A missed “${classes[1]}” costs 500, a false alarm 5`}>
            🕵️ Fraud-style: a miss costs 100× a false alarm
          </button>
        )}
        {!binary && k > 2 && (
          <button type="button" className="btn sm" onClick={() => onChange(matrix.map((row, i) => row.map((c, j) => (i === j ? 0 : Math.abs(i - j)))))} title="For ordered classes: confusing neighbours costs 1, two steps apart costs 2…">
            📏 Far-off mistakes cost more
          </button>
        )}
      </div>
      <div className="inset scroll" style={{ padding: 10 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 4, margin: "0 auto" }}>
          <thead>
            <tr>
              <th className="tiny faint" style={{ textAlign: "left", fontWeight: 500, padding: "0 6px", verticalAlign: "bottom", whiteSpace: "nowrap" }}>It's really ↓ · model says →</th>
              {classes.map((c, j) => (
                <th key={j} className="small" style={{ fontWeight: 600, padding: "0 4px", whiteSpace: "nowrap" }}>
                  <span className="row center" style={{ gap: 5 }}><Dot c={classColor(c, classes)} />{c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map((c, i) => (
              <tr key={i}>
                <th className="small" style={{ textAlign: "left", fontWeight: 600, padding: "0 6px", whiteSpace: "nowrap" }}>
                  <span className="row" style={{ gap: 5 }}><Dot c={classColor(c, classes)} />{c}</span>
                </th>
                {classes.map((_, j) => (
                  <td key={j} style={{ padding: 0 }}>
                    <CostCell value={matrix[i]?.[j] ?? 0} diag={i === j} heat={(matrix[i]?.[j] ?? 0) / max} onChange={(v) => set(i, j, v)}
                      label={i === j ? `Right answer: ${c}` : `Says ${classes[j]}, really ${c}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {binary && (
        <span className="tiny muted" style={{ lineHeight: 1.5 }}>
          Bottom-left is a <b>miss</b> (it's really “{classes[1]}” but the model says “{classes[0]}”); top-right is a <b>false alarm</b>. If a missed fraud costs £500 and checking a false alarm costs £5, type those in.
        </span>
      )}
    </div>
  );
}

const Dot = ({ c }: { c: string }) => <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: c, display: "inline-block", flexShrink: 0 }} />;

/** A compact stepper (template-styled via .stepper) whose number can also be typed. */
function CostCell({ value, onChange, diag, heat, label }: { value: number; onChange: (v: number) => void; diag: boolean; heat: number; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const step = value >= 100 ? 10 : value >= 20 ? 5 : 1;
  const commit = (s: string) => {
    const v = Number(s);
    if (s.trim() !== "" && Number.isFinite(v)) onChange(Math.max(0, v));
    setDraft(null);
  };
  const tint = diag ? (value === 0 ? "color-mix(in srgb, var(--success) 12%, var(--input-bg))" : "var(--input-bg)") : `color-mix(in srgb, var(--danger) ${Math.round(5 + heat * 20)}%, var(--input-bg))`;
  return (
    <div className="stepper" style={{ height: 32, background: tint }} title={label}>
      <button type="button" className="stepper-btn" style={{ width: 24, fontSize: 14 }} aria-label={`Decrease: ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, Number((value - step).toFixed(4))))}>−</button>
      <input className="stepper-value num" aria-label={label} inputMode="decimal" value={draft ?? fmtCost(value)}
        onChange={(e) => setDraft(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        style={{ minWidth: 0, width: 46, padding: 0, textAlign: "center", border: "none", borderLeft: "1px solid var(--hairline)", borderRight: "1px solid var(--hairline)", background: "transparent", color: diag && value === 0 ? "var(--success)" : "var(--text)", fontSize: 13, fontWeight: 650, outline: "none" }} />
      <button type="button" className="stepper-btn" style={{ width: 24, fontSize: 14 }} aria-label={`Increase: ${label}`} onClick={() => onChange(Number((value + step).toFixed(4)))}>+</button>
    </div>
  );
}

/* ------------------------------------------------------------------ regression */

/** Two sliders (cost per unit too low / too high) and a picture of the lopsided cost. */
export function AsymmetricCost({ under, over, onUnder, onOver, result }: { under: number; over: number; onUnder: (v: number) => void; onOver: (v: number) => void; result: RunResult | null }) {
  return (
    <div className="col" style={{ gap: 12 }}>
      <span className="small muted" style={{ lineHeight: 1.5 }}>
        Sometimes guessing too low hurts more than guessing too high — running out of stock loses a sale, while extra stock just sits on a shelf.
        Set the cost of each unit of miss in either direction; we average it over each model's test guesses.
      </span>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        <Slider label="Cost per unit guessed too low" help="e.g. each item short = one lost sale" value={under} min={0} max={10} step={0.5} onChange={onUnder} format={(v) => fmtCost(v)} />
        <Slider label="Cost per unit guessed too high" help="e.g. each item too many = storage cost" value={over} min={0} max={10} step={0.5} onChange={onOver} format={(v) => fmtCost(v)} />
      </div>
      <LossPicture under={under} over={over} result={result} />
    </div>
  );
}

function LossPicture({ under, over, result }: { under: number; over: number; result: RunResult | null }) {
  const W = 420, H = 150, cx = W / 2, base = H - 26, top = 16;
  const m = Math.max(under, over, 0.5);
  const yAt = (slope: number) => base - (slope / m) * (base - top);
  // misses of the best real model (predicted − true), as a faint histogram behind the cost curve
  const model = result ? Object.values(result.models).find((x) => !x.baseline && x.residuals?.points?.length) : undefined;
  const errs = model?.residuals?.points.map((q) => q.p - q.t) ?? [];
  const R = errs.length ? [...errs].map(Math.abs).sort((a, b) => a - b)[Math.floor(errs.length * 0.95)] || 1 : 1;
  const bins = new Array(28).fill(0);
  errs.forEach((e) => { const b = Math.floor(((Math.max(-R, Math.min(R, e)) + R) / (2 * R)) * 27.999); bins[b]++; });
  const bmax = Math.max(1, ...bins);
  const bw = (W - 40) / bins.length;
  return (
    <div className="inset" style={{ padding: "8px 10px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxHeight: 190 }} role="img" aria-label={`Cost of a miss: ${under} per unit too low, ${over} per unit too high`}>
        {bins.map((n, i) => n > 0 && (
          <rect key={i} x={20 + i * bw + 1} width={bw - 2} y={base - (n / bmax) * 46} height={(n / bmax) * 46} rx={2} fill="var(--fill-2)" />
        ))}
        <line x1={14} x2={W - 14} y1={base} y2={base} stroke="var(--hairline)" />
        <line x1={cx} x2={cx} y1={top - 6} y2={base + 4} stroke="var(--text-3)" strokeDasharray="3 3" />
        <motion.path fill="color-mix(in srgb, var(--danger) 16%, transparent)" stroke="none" animate={{ d: `M ${cx} ${base} L 20 ${yAt(under)} L 20 ${base} Z` }} transition={spring.snappy} />
        <motion.path fill="color-mix(in srgb, var(--warning) 16%, transparent)" stroke="none" animate={{ d: `M ${cx} ${base} L ${W - 20} ${yAt(over)} L ${W - 20} ${base} Z` }} transition={spring.snappy} />
        <motion.path fill="none" stroke="var(--danger)" strokeWidth={2.6} strokeLinecap="round" animate={{ d: `M 20 ${yAt(under)} L ${cx} ${base}` }} transition={spring.snappy} />
        <motion.path fill="none" stroke="var(--warning)" strokeWidth={2.6} strokeLinecap="round" animate={{ d: `M ${cx} ${base} L ${W - 20} ${yAt(over)}` }} transition={spring.snappy} />
        <text x={24} y={base + 17} fontSize={11} fill="var(--text-2)">← guessed too low</text>
        <text x={W - 24} y={base + 17} fontSize={11} fill="var(--text-2)" textAnchor="end">guessed too high →</text>
        <text x={cx} y={base + 17} fontSize={11} fill="var(--text-3)" textAnchor="middle">spot on</text>
        <text x={24} y={Math.max(top + 4, yAt(under) - 6)} fontSize={11.5} fontWeight={650} fill="var(--danger)">{fmtCost(under)} per unit</text>
        <text x={W - 24} y={Math.max(top + 4, yAt(over) - 6)} fontSize={11.5} fontWeight={650} fill="var(--warning)" textAnchor="end">{fmtCost(over)} per unit</text>
      </svg>
      {model && <span className="tiny faint">Grey bars: where {model.label}'s misses fell on the test rows.</span>}
    </div>
  );
}
