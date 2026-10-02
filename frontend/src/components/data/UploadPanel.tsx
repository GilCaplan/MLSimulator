import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { DatasetSummary } from "../../lib/types";
import { Dropzone, Glass, Spinner } from "../glass";
import { SectionTitle } from "./ui";

const FORMATS = ["CSV", "TSV", "JSON", "JSONL", "Excel"];

export function UploadPanel({ onLoaded }: { onLoaded: (d: DatasetSummary) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const upload = async (f: File) => {
    setBusy(f.name);
    setLastError(null);
    try {
      const d = await api.upload(f);
      toast.success(`Read ${d.n_rows.toLocaleString()} rows × ${d.n_cols} columns from ${f.name}.`);
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
      <SectionTitle icon="📁" title="Upload your own file" sub="One row per example, one column per measurement — with a header row." />
      <Dropzone onFile={upload} busy={!!busy} accept=".csv,.tsv,.txt,.json,.jsonl,.ndjson,.xlsx,.xlsm,.xls">
        <AnimatePresence mode="wait">
          {busy ? (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col center" style={{ gap: 12, padding: "18px 0" }}>
              <Spinner size={30} color="var(--accent)" />
              <b>Reading {busy}…</b>
              <span className="small muted">Detecting columns and number formats.</span>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col center" style={{ gap: 10, padding: "18px 0" }}>
              <motion.span animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }} style={{ fontSize: 40 }}>📄</motion.span>
              <b style={{ fontSize: 15 }}>Drop a file here, or click to choose</b>
              <div className="row wrap center" style={{ gap: 6 }}>
                {FORMATS.map((f) => <span key={f} className="badge">{f}</span>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Dropzone>
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
