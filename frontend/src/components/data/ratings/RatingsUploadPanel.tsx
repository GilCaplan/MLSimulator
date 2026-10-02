import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { api } from "../../../lib/api";
import { toast } from "../../../lib/store";
import type { DatasetSummary } from "../../../lib/types";
import { Dropzone, Glass, Spinner } from "../../glass";
import { SectionTitle } from "../ui";

const FORMATS = ["CSV", "TSV", "JSON", "Excel"];
const EXAMPLE = [
  ["ana", "Alien", "5", "2024-03-01"],
  ["ana", "Up", "3", "2024-03-04"],
  ["ben", "Alien", "4", "2024-03-02"],
  ["ben", "Heat", "2", "2024-03-09"],
];

/** Upload a ratings table (user, item, rating[, time]); the column roles are picked (and can be changed) afterwards. */
export function RatingsUploadPanel({ onLoaded }: { onLoaded: (d: DatasetSummary) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const upload = async (f: File) => {
    setBusy(f.name);
    setLastError(null);
    try {
      const d = await api.upload(f);
      toast.success(`Read ${d.n_rows.toLocaleString()} ratings from ${f.name} — check which column is who, what and the rating.`);
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
      <SectionTitle icon="📁" title="Upload your own ratings" sub="One row per rating: who, what, how much they liked it — and optionally when." />
      <div className="row wrap" style={{ gap: 16, alignItems: "stretch" }}>
        <div style={{ flex: "2 1 320px" }}>
          <Dropzone onFile={upload} busy={!!busy} accept=".csv,.tsv,.txt,.json,.jsonl,.ndjson,.xlsx,.xlsm,.xls">
            <AnimatePresence mode="wait">
              {busy ? (
                <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col center" style={{ gap: 12, padding: "18px 0" }}>
                  <Spinner size={30} color="var(--accent)" />
                  <b>Reading {busy}…</b>
                  <span className="small muted">Looking for the who, the what and the rating.</span>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col center" style={{ gap: 10, padding: "18px 0" }}>
                  <motion.span animate={{ y: [0, -6, 0], rotate: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }} style={{ fontSize: 40 }}>⭐</motion.span>
                  <b style={{ fontSize: 15 }}>Drop a file here, or click to choose</b>
                  <div className="row wrap center" style={{ gap: 6 }}>
                    {FORMATS.map((f) => <span key={f} className="badge">{f}</span>)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Dropzone>
        </div>
        <div className="inset col" style={{ flex: "1 1 260px", padding: 12, gap: 8 }}>
          <span className="eyebrow">It should look like this</span>
          <table className="table" style={{ fontSize: 11.5 }}>
            <thead><tr><th>👤 user</th><th>🎬 item</th><th>⭐ rating</th><th>🕒 time</th></tr></thead>
            <tbody>
              {EXAMPLE.map((r, k) => (
                <motion.tr key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + k * 0.08 }}>
                  <td>{r[0]}</td>
                  <td>{r[1]}</td>
                  <td style={{ color: "#FFB800", fontWeight: 700 }}>{"★".repeat(Number(r[2]))}</td>
                  <td className="muted num">{r[3]}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          <span className="tiny faint" style={{ lineHeight: 1.5 }}>Column names don't matter — you'll point out which is which. Purchases work too: use 1 as the “rating”, then set “Liked =” to 1★ in Prepare.</span>
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
