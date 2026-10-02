import { motion } from "framer-motion";
import { spring } from "../../design/motion";
import { classColor, withAlpha } from "../../lib/colors";
import { fmt, pct } from "../../lib/format";
import type { ModelResult } from "../../lib/types";
import { InfoTip } from "../glass";

type Mist = NonNullable<ModelResult["mistakes"]>;
type Slice = NonNullable<ModelResult["slices"]>[number];

const cell = (v: unknown) => (v === null || v === undefined ? <span className="faint">—</span> : typeof v === "number" ? fmt(v, 4) : String(v));

/** Error analysis: the worst individual misses plus the groups where the model is weakest. */
export function ErrorAnalysis({ mistakes, slices, classes }: { mistakes?: Mist | null; slices?: ModelResult["slices"]; classes?: string[] | null }) {
  return (
    <div className="col" style={{ gap: 22 }}>
      <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 720 }}>
        <b style={{ color: "var(--text)" }}>Error analysis: look at <i>which</i> rows fail, not just how many.</b> A single score hides patterns — maybe the model is great
        on weekdays but hopeless at weekends. Spotting the pattern tells you what to fix: more data of that kind, a better feature, or a different model.
      </p>
      {mistakes && mistakes.rows.length > 0 && <MistakesTable m={mistakes} classes={classes} />}
      {slices && slices.length > 0 && <Slices slices={slices} />}
    </div>
  );
}

export function MistakesTable({ m, classes }: { m: Mist; classes?: string[] | null }) {
  const isCls = m.rows[0]?.confidence !== undefined || m.wrong !== undefined;
  const maxErr = Math.max(1e-9, ...m.rows.map((r) => Math.abs(r.error ?? 0)));
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="col" style={{ gap: 2 }}>
          <h4 className="row" style={{ gap: 6 }}>
            {isCls ? "😬 Its most confident wrong answers" : "📏 Its biggest misses"}
            <InfoTip text={isCls
              ? "Test rows the model got wrong, sorted by how sure it was. Confident mistakes are the most interesting: they often point at mislabelled rows, a missing feature, or a pattern the model latched onto."
              : "Test rows where the prediction was furthest from the truth. Look for something these rows share — an unusual value, a rare category — that the model hasn't learned."} />
          </h4>
          <span className="small muted">
            {isCls && m.wrong !== undefined
              ? <>It got <b style={{ color: "var(--text)" }}>{m.wrong.toLocaleString()}</b> of {m.total.toLocaleString()} test rows wrong ({pct(m.wrong / Math.max(1, m.total), 1)}). Here are the {m.rows.length} it was surest about.</>
              : <>Average miss: <b style={{ color: "var(--text)" }}>{fmt(m.mae ?? 0, 4)}</b> across {m.total.toLocaleString()} test rows. These are the {m.rows.length} worst.</>}
          </span>
        </div>
      </div>
      <div className="inset scroll" style={{ maxHeight: 360, overflow: "auto" }}>
        <table className="table" style={{ minWidth: 520 + m.columns.length * 80 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--glass-strong)", backdropFilter: "var(--glass-blur)" }}>
            <tr>
              <th style={{ width: 28 }}>#</th>
              {isCls ? <><th>True → predicted</th><th style={{ minWidth: 120 }}>Confidence</th></> : <><th style={{ textAlign: "right" }}>Actual</th><th style={{ textAlign: "right" }}>Predicted</th><th style={{ minWidth: 130 }}>Miss</th></>}
              {m.columns.map((c) => <th key={c} className="truncate" style={{ maxWidth: 140 }} title={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r, i) => (
              <motion.tr key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: Math.min(i, 14) * 0.03 }}>
                <td className="faint num">{i + 1}</td>
                {isCls ? (
                  <>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="row" style={{ gap: 6 }}>
                        <Chip label={String(r.true)} color={classColor(r.true, classes)} />
                        <span className="faint">→</span>
                        <Chip label={String(r.pred)} color={classColor(r.pred, classes)} strike />
                      </span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <span style={{ flex: 1, height: 7, borderRadius: 4, background: "var(--fill)", overflow: "hidden", minWidth: 60 }}>
                          <motion.span initial={{ width: 0 }} animate={{ width: `${(r.confidence ?? 0) * 100}%` }} transition={{ ...spring.gentle, delay: 0.1 + Math.min(i, 14) * 0.03 }}
                            style={{ display: "block", height: "100%", borderRadius: 4, background: (r.confidence ?? 0) > 0.8 ? "var(--danger)" : "var(--warning)" }} />
                        </span>
                        <b className="num small" style={{ width: 36, textAlign: "right" }}>{pct(r.confidence ?? 0, 0)}</b>
                      </span>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="num" style={{ textAlign: "right" }}>{cell(r.true)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{cell(r.pred)}</td>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <span style={{ flex: 1, height: 7, borderRadius: 4, background: "var(--fill)", overflow: "hidden", minWidth: 50 }}>
                          <motion.span initial={{ width: 0 }} animate={{ width: `${(Math.abs(r.error ?? 0) / maxErr) * 100}%` }} transition={{ ...spring.gentle, delay: 0.1 + Math.min(i, 14) * 0.03 }}
                            style={{ display: "block", height: "100%", borderRadius: 4, background: (r.error ?? 0) > 0 ? "#FF375F" : "#0A84FF" }} />
                        </span>
                        <b className="num small" style={{ minWidth: 52, textAlign: "right", color: (r.error ?? 0) > 0 ? "#FF375F" : "#0A84FF" }}>{(r.error ?? 0) > 0 ? "+" : ""}{fmt(r.error ?? 0, 3)}</b>
                      </span>
                    </td>
                  </>
                )}
                {r.values.map((v, j) => <td key={j} className={typeof v === "number" ? "num" : ""} style={{ maxWidth: 160 }}><span className="truncate" style={{ display: "block" }}>{cell(v)}</span></td>)}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isCls && <span className="tiny faint">Pink = predicted too high · blue = predicted too low.</span>}
    </div>
  );
}

function Chip({ label, color, strike }: { label: string; color: string; strike?: boolean }) {
  return (
    <span className="row" style={{ gap: 5, padding: "2px 8px", borderRadius: 999, background: withAlpha(color, 0.14), border: `1px solid ${withAlpha(color, 0.35)}`, fontSize: 12, fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: color }} />
      <span style={{ textDecoration: strike ? "line-through" : undefined, textDecorationColor: "var(--danger)" }}>{label}</span>
    </span>
  );
}

/** "(7.2989999, 11.7]" → "7.3 – 11.7": quantile bins from pandas read nicer as plain ranges. */
export function prettyGroup(label: string) {
  const m = /^[([]\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+)\s*[\])]$/.exec(label.trim());
  if (!m) return label;
  const n = (x: string) => { const v = Number(x); return Number.isFinite(v) ? String(Number(v.toPrecision(3))) : x; };
  return `${n(m[1])} – ${n(m[2])}`;
}

/** "Where is it weakest?": per-column groups as small horizontal bar sets, weakest group highlighted, overall marker. */
export function Slices({ slices }: { slices: Slice[] }) {
  const s0 = slices[0];
  const higher = s0.better === "higher";
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="col" style={{ gap: 2 }}>
        <h4 className="row" style={{ gap: 6 }}>
          🔦 Where is it weakest?
          <InfoTip text="We split the test rows into groups by each input (quartiles for numbers, values for categories) and scored the model in each group. Columns are ordered by how uneven the model is across their groups." />
        </h4>
        <span className="small muted">
          {higher ? "Accuracy" : "Average miss"} per group of test rows. The <b style={{ color: "var(--danger)" }}>red</b> bar is the weakest group; the dashed line is the model's overall {higher ? "accuracy" : "miss"}.
        </span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {slices.map((s, si) => <SliceCard key={s.column} s={s} index={si} />)}
      </div>
    </div>
  );
}

function SliceCard({ s, index }: { s: Slice; index: number }) {
  const higher = s.better === "higher";
  const max = higher ? 1 : Math.max(s.overall, ...s.groups.map((g) => g.value)) * 1.1 || 1;
  const show = (v: number) => (higher ? pct(v, 0) : fmt(v, 3));
  const weakest = s.groups[0]; // the backend sorts weakest first
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: index * 0.06 }} className="inset col" style={{ padding: 12, gap: 8 }}>
      <div className="row between" style={{ gap: 8 }}>
        <b className="truncate" style={{ fontSize: 13 }} title={s.column}>{s.column}</b>
        <span className={`badge ${s.spread > (higher ? 0.15 : s.overall * 0.5) ? "warning" : ""}`} style={{ height: 20, fontSize: 10.5 }}>
          spread {higher ? `${(s.spread * 100).toFixed(0)} pts` : fmt(s.spread, 3)}
        </span>
      </div>
      <div className="col" style={{ gap: 5, position: "relative" }}>
        {s.groups.slice(0, 8).map((g, i) => {
          const weak = g === weakest;
          return (
            <div key={g.label} className="row" style={{ gap: 8 }}>
              <span className="tiny truncate" title={g.label} style={{ width: 86, flexShrink: 0, fontWeight: weak ? 700 : 500, color: weak ? "var(--danger)" : "var(--text-2)" }}>{prettyGroup(g.label)}</span>
              <span style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--fill)", position: "relative" }}>
                <motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(0.02, g.value / max) * 100}%` }} transition={{ ...spring.gentle, delay: 0.15 + index * 0.06 + i * 0.04 }}
                  style={{ display: "block", height: "100%", borderRadius: 5, background: weak ? "var(--danger)" : "var(--accent)", opacity: weak ? 0.95 : 0.55 }} />
                <span aria-hidden title={`overall ${show(s.overall)}`} style={{ position: "absolute", top: -3, bottom: -3, left: `${(s.overall / max) * 100}%`, borderLeft: "1.5px dashed var(--text)", opacity: 0.55 }} />
              </span>
              <span className="tiny num" style={{ width: 40, textAlign: "right", fontWeight: weak ? 700 : 500, color: weak ? "var(--danger)" : undefined }}>{show(g.value)}</span>
              <span className="tiny faint num" style={{ width: 30, textAlign: "right" }} title={`${g.n} test rows`}>{g.n}</span>
            </div>
          );
        })}
        {s.groups.length > 8 && <span className="tiny faint">+{s.groups.length - 8} more groups</span>}
      </div>
      <span className="tiny faint" style={{ lineHeight: 1.4 }}>
        Weakest: <b style={{ color: "var(--text-2)" }}>{prettyGroup(weakest.label)}</b> — {show(weakest.value)} vs {show(s.overall)} overall.
      </span>
    </motion.div>
  );
}
