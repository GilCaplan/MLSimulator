import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { api } from "../../../lib/api";
import { toast } from "../../../lib/store";
import type { DatasetSummary } from "../../../lib/types";
import { Dropzone, Glass, Spinner } from "../../glass";
import { SectionTitle } from "../ui";

const FORMATS = ["CSV", "TSV", "JSON", "JSONL", "Excel"];
const EXAMPLE = [
  ["Arrived broken, very disappointed", "negative"],
  ["Love it — works perfectly", "positive"],
  ["Not bad at all for the price", "positive"],
];

/** Upload a table of texts; the text and label columns are picked (and can be changed) afterwards. */
export function TextUploadPanel({ onLoaded }: { onLoaded: (d: DatasetSummary) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const upload = async (f: File) => {
    setBusy(f.name);
    setLastError(null);
    try {
      const d = await api.upload(f);
      toast.success(`Read ${d.n_rows.toLocaleString()} texts from ${f.name} — check the text and label columns below.`);
      onLoaded(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      toast.error(`Couldn't use ${f.name}: ${msg}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Glass>
      <SectionTitle icon="📁" title="Upload your own texts" sub="A table with one message per row: a column with the text, and a column with its label." />
      <div className="row wrap" style={{ gap: 16, alignItems: "stretch" }}>
        <div style={{ flex: "2 1 320px" }}>
          <Dropzone onFile={upload} busy={!!busy} accept=".csv,.tsv,.txt,.json,.jsonl,.ndjson,.xlsx,.xlsm,.xls">
            <AnimatePresence mode="wait">
              {busy ? (
                <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col center" style={{ gap: 12, padding: "18px 0" }}>
                  <Spinner size={30} color="var(--accent)" />
                  <b>Reading {busy}…</b>
                  <span className="small muted">Looking for the column with the text.</span>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col center" style={{ gap: 10, padding: "18px 0" }}>
                  <motion.span animate={{ y: [0, -6, 0], rotate: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }} style={{ fontSize: 40 }}>💬</motion.span>
                  <b style={{ fontSize: 15 }}>Drop a file here, or click to choose</b>
                  <div className="row wrap center" style={{ gap: 6 }}>
                    {FORMATS.map((f) => <span key={f} className="badge">{f}</span>)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Dropzone>
        </div>
        <div className="inset col" style={{ flex: "1 1 240px", padding: 12, gap: 8 }}>
          <span className="eyebrow">It should look like this</span>
          <table className="table" style={{ fontSize: 11.5 }}>
            <thead><tr><th>💬 text</th><th>🎯 label</th></tr></thead>
            <tbody>
              {EXAMPLE.map(([t, l], k) => (
                <motion.tr key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + k * 0.08 }}>
                  <td style={{ whiteSpace: "normal" }}>{t}</td>
                  <td><span className={`badge ${l === "positive" ? "success" : "danger"}`} style={{ height: 18, fontSize: 10.5 }}>{l}</span></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          <span className="tiny faint" style={{ lineHeight: 1.5 }}>Extra columns are fine — you'll choose which one holds the text and which one is the answer.</span>
        </div>
      </div>
      <AnimatePresence>
        {lastError && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="small" style={{ color: "var(--danger)", marginTop: 10 }}>
            ⚠️ {lastError}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="row small muted" style={{ gap: 8, marginTop: 14 }}>
        <span>🔒</span>
        <span>Your file stays on this computer — it's read by the app running locally and never uploaded to the internet.</span>
      </div>
    </Glass>
  );
}
