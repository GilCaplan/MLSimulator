import { motion } from "framer-motion";
import { colorAt } from "../../lib/colors";
import { fmt } from "../../lib/format";
import type { ColumnSummary, DatasetSummary } from "../../lib/types";
import { MiniHist } from "../charts";
import { Glass, Tooltip } from "../glass";
import { Meter, SectionTitle } from "./ui";

const ROLE: Record<ColumnSummary["role"], { label: string; cls: string; help: string }> = {
  numeric: { label: "numeric", cls: "accent", help: "Numbers the models can use directly." },
  categorical: { label: "categorical", cls: "success", help: "A handful of labels (like 'city' or 'plan'). They'll be turned into numbers during preparation." },
  id: { label: "id", cls: "warning", help: "Looks like a unique ID for each row. IDs don't help predictions — consider dropping it." },
  text: { label: "text", cls: "", help: "Free text with many unique values. Usually not useful as-is." },
  datetime: { label: "date", cls: "accent", help: "Dates and times. Models can't use them raw — turn them into month, weekday or hour under Prepare → Create features." },
};

export function ColumnsTable({ dataset, target }: { dataset: DatasetSummary; target: string | null }) {
  const n = dataset.n_rows || 1;
  return (
    <Glass animate_in>
      <SectionTitle icon="🧾" title="Columns" sub="What's in each column — its kind, gaps, and shape."
        help="Each column is one measurement. 'Missing' counts empty cells; 'unique' is how many different values appear." />
      <div className="scroll" style={{ maxHeight: 440, borderRadius: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Column</th><th>Kind</th><th>Missing</th><th style={{ textAlign: "right" }}>Unique</th><th>Shape</th><th style={{ textAlign: "right" }}>Average</th><th style={{ textAlign: "right" }}>Spread</th>
            </tr>
          </thead>
          <tbody>
            {dataset.columns.map((c, i) => {
              const role = ROLE[c.role] ?? ROLE.text;
              const isT = c.name === target;
              const miss = c.missing / n;
              return (
                <motion.tr key={c.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
                  style={isT ? { background: "var(--accent-soft)" } : undefined}>
                  <td style={{ fontWeight: 600, maxWidth: 200 }} className="truncate" title={c.name}>{isT && "🎯 "}{c.name}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <Tooltip content={role.help}><span className={`badge ${role.cls}`}>{role.label}</span></Tooltip>
                      {c.role === "datetime" && !isT && (
                        <Tooltip content="Models can't use raw dates. In Prepare → Create features, one click turns this into month, weekday, hour… — and you can also split train/test by time.">
                          <span className="tiny" style={{ color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>→ make date parts in Prepare</span>
                        </Tooltip>
                      )}
                      {c.repeats && c.repeats > 1.2 && !isT && (
                        <Tooltip content={`Each value appears in about ${c.repeats.toFixed(1)} rows — maybe the same person or thing measured several times. In Prepare → Split, “Keep groups together” stops the same ${c.name} landing in both train and test.`}>
                          <span className="tiny" style={{ color: "var(--warning)", fontWeight: 600, whiteSpace: "nowrap" }}>🔁 ×{c.repeats.toFixed(1)}</span>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td>
                    {c.missing ? (
                      <div className="row" style={{ gap: 8 }}>
                        <Meter value={miss} color={miss > 0.3 ? "var(--danger)" : "var(--warning)"} width={46} />
                        <span className="num small">{(miss * 100).toFixed(miss < 0.01 ? 1 : 0)}%</span>
                      </div>
                    ) : <span className="faint small">none</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>{c.unique.toLocaleString()}</td>
                  <td>
                    {c.histogram ? <MiniHist data={c.histogram} width={90} height={22} color={isT ? "var(--accent-2)" : colorAt(i)} /> :
                      c.top ? (
                        <div className="row" style={{ gap: 4 }}>
                          {c.top.labels.slice(0, 3).map((l, j) => (
                            <span key={l} className="badge truncate" style={{ maxWidth: 80, height: 20, fontSize: 10.5, fontWeight: 560 }} title={`${l}: ${c.top!.counts[j]}`}>{l}</span>
                          ))}
                          {c.top.labels.length > 3 && <span className="tiny faint">+{c.top.labels.length - 3 + (c.top.other ? 1 : 0)}</span>}
                        </div>
                      ) : <span className="faint">—</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>{c.stats ? fmt(c.stats.mean, 3) : <span className="faint">—</span>}</td>
                  <td className="num" style={{ textAlign: "right" }}>{c.stats ? fmt(c.stats.std, 3) : <span className="faint">—</span>}</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Glass>
  );
}
