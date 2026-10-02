import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { spring, stagger } from "../../design/motion";
import { api } from "../../lib/api";
import { classColor } from "../../lib/colors";
import { fmt } from "../../lib/format";
import { toast } from "../../lib/store";
import type { BatchPredictResponse, SavedModel } from "../../lib/types";
import { BarList, ConfusionMatrix, Histogram } from "../charts";
import { AnimatedNumber, Dropzone, Glass, Spinner } from "../glass";
import { typicalRow } from "./inputs";
import { MetricTiles, SectionTitle, rise } from "./shared";

/** Build a one-row CSV template with the right column names and typical values. */
function downloadTemplate(model: SavedModel) {
  const row = typicalRow(model.input_schema);
  const cols = model.input_schema.map((s) => s.name);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = `${cols.map(esc).join(",")}\n${cols.map((c) => esc(row[c])).join(",")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${model.name.replace(/[^\w-]+/g, "_") || "model"}_template.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const isPredCol = (c: string) => c === "prediction" || c.startsWith("prob_");

/** Batch predictions: drop a file, get every row predicted, plus a score if the file had the answers. */
export function BatchPredict({ model }: { model: SavedModel }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<BatchPredictResponse | null>(null);
  const [fileName, setFileName] = useState("");

  const run = async (f: File) => {
    setBusy(f.name);
    setFileName(f.name);
    try {
      setRes(await api.predictFile(model.id, f));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const classes = res?.classes ?? model.classes ?? [];

  return (
    <motion.section variants={rise}>
      <SectionTitle
        id="batch"
        icon="📦"
        title="Batch predictions"
        subtitle="Have a whole spreadsheet of new examples? Drop it here and the model will fill in an answer for every row."
        right={res && <button className="btn sm" onClick={() => setRes(null)}>↺ Another file</button>}
      />
      <Glass>
        <AnimatePresence mode="wait" initial={false}>
          {!res ? (
            <motion.div key="drop" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="col" style={{ gap: 12 }}>
              <Dropzone onFile={run} busy={!!busy} accept=".csv,.tsv,.txt,.json,.xlsx,.xls,.parquet">
                {busy ? (
                  <div className="col center" style={{ gap: 10, padding: 10 }}>
                    <Spinner size={26} color="var(--accent)" />
                    <b>Predicting every row of {busy}…</b>
                  </div>
                ) : (
                  <div className="col center" style={{ gap: 8, padding: 10 }}>
                    <motion.span animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} style={{ fontSize: 34 }}>📄</motion.span>
                    <b style={{ fontSize: 15 }}>Drop a CSV, JSON or Excel file — or click to choose</b>
                    <span className="small muted" style={{ maxWidth: 520 }}>
                      It needs the same columns the model learned from. If it also has a <b>{model.target}</b> column, we'll check the model's answers against it.
                    </span>
                  </div>
                )}
              </Dropzone>
              <div className="row wrap small muted" style={{ gap: 8 }}>
                <span>Columns needed:</span>
                {model.input_schema.slice(0, 14).map((s) => <span key={s.name} className="badge">{s.name}</span>)}
                {model.input_schema.length > 14 && <span className="badge">+{model.input_schema.length - 14} more</span>}
                <span className="grow" />
                <button className="btn sm ghost" onClick={() => downloadTemplate(model)}>⬇︎ Download a template</button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="res" variants={stagger(0.07)} initial="hidden" animate="show" exit={{ opacity: 0 }} className="col" style={{ gap: 18 }}>
              <motion.div variants={rise} className="row wrap" style={{ gap: 14 }}>
                <div className="inset row" style={{ padding: "12px 16px", gap: 12 }}>
                  <span style={{ fontSize: 26 }}>✅</span>
                  <div className="col" style={{ gap: 0 }}>
                    <span style={{ fontSize: 26, fontWeight: 750, letterSpacing: "-0.02em" }}><AnimatedNumber value={res.n_rows} format={(v) => Math.round(v).toLocaleString()} /></span>
                    <span className="tiny muted">rows predicted from <b>{fileName}</b></span>
                  </div>
                </div>
                <span className="grow" />
                <a className="btn primary" href={api.downloadUrl(res.download_id)} download>⬇︎ Download CSV</a>
              </motion.div>

              <motion.div variants={rise} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16 }}>
                <div className="inset" style={{ padding: 16 }}>
                  <h4 style={{ marginBottom: 12 }}>{res.prediction_counts ? "What it predicted" : "Spread of predictions"}</h4>
                  {res.prediction_counts ? (
                    <BarList
                      labels={res.prediction_counts.labels}
                      values={res.prediction_counts.counts}
                      colors={res.prediction_counts.labels.map((l) => classColor(l, classes))}
                      format={(v) => Math.round(v).toLocaleString()}
                    />
                  ) : res.prediction_hist ? (
                    <>
                      <Histogram data={res.prediction_hist} color="#5E5CE6" height={130} />
                      <div className="tiny faint" style={{ marginTop: 6 }}>Predicted {model.target}, from {fmt(res.prediction_hist.edges[0])} to {fmt(res.prediction_hist.edges[res.prediction_hist.edges.length - 1])}</div>
                    </>
                  ) : null}
                </div>
                {res.metrics && (
                  <div className="inset" style={{ padding: 16, background: "linear-gradient(135deg, rgba(48,209,88,0.10), rgba(10,132,255,0.08))" }}>
                    <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                      <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.3 }} style={{ fontSize: 20 }}>🎯</motion.span>
                      <h4>Your file had the true answers!</h4>
                    </div>
                    <p className="small muted" style={{ marginBottom: 12 }}>So here's how the model scored on it:</p>
                    <MetricTiles metrics={res.metrics} limit={4} minWidth={112} />
                  </div>
                )}
              </motion.div>

              {res.confusion && (
                <motion.div variants={rise} className="inset" style={{ padding: 16 }}>
                  <h4 style={{ marginBottom: 10 }}>Right vs wrong on your file</h4>
                  <ConfusionMatrix labels={res.confusion.labels} matrix={res.confusion.matrix} />
                </motion.div>
              )}

              <motion.div variants={rise} className="col" style={{ gap: 8 }}>
                <div className="row between">
                  <h4>Preview</h4>
                  <span className="tiny faint">first {Math.min(50, res.preview.rows.length)} of {res.n_rows.toLocaleString()} rows · <span style={{ color: "var(--accent)" }}>blue</span> = added by the model</span>
                </div>
                <div className="inset" style={{ maxHeight: 360, overflow: "auto", padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>{res.preview.columns.map((c) => <th key={c} style={isPredCol(c) ? { color: "var(--accent)" } : undefined}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {res.preview.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((v, j) => {
                            const col = res.preview.columns[j];
                            const pred = isPredCol(col);
                            const shown = v === null ? "—" : typeof v === "number" ? fmt(v, 4) : String(v);
                            return (
                              <td key={j} className="num" style={pred ? { background: "var(--accent-soft)", fontWeight: col === "prediction" ? 650 : 500, color: col === "prediction" && classes.length ? classColor(String(v), classes) : undefined } : undefined}>
                                {shown}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Glass>
    </motion.section>
  );
}
