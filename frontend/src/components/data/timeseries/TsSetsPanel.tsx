import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring, stagger } from "../../../design/motion";
import { api } from "../../../lib/api";
import { colorAt } from "../../../lib/colors";
import { toast } from "../../../lib/store";
import type { DatasetSummary, TimeseriesSetInfo } from "../../../lib/types";
import { Glass, Spinner } from "../../glass";
import { SectionTitle } from "../ui";
import { MiniLine, previewValues } from "./viz";

const TINT: Record<string, number> = { store_sales: 0, energy: 3, airline: 4, web_traffic: 2 };
const STEP_WORD: Record<string, string> = { store_sales: "days", energy: "hours", airline: "months", web_traffic: "days" };

/** Gallery of built-in series: one click generates the set and makes it the project's data. */
export function TsSetsPanel({ onLoaded }: { onLoaded: (d: DatasetSummary, info: TimeseriesSetInfo) => void }) {
  const [sets, setSets] = useState<Record<string, TimeseriesSetInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.timeseriesSets()
      .then(setSets)
      .catch((e) => { setError(e instanceof Error ? e.message : String(e)); toast.error(e); });
  }, []);

  const create = async (name: string, info: TimeseriesSetInfo) => {
    if (busy) return;
    setBusy(name);
    try {
      const d = await api.createTimeseriesSet(name);
      toast.success(`Created “${d.name}” — ${d.n_rows.toLocaleString()} rows.`);
      onLoaded(d, info);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  if (error && !sets) return <Glass><p className="small" style={{ color: "var(--danger)" }}>⚠️ Couldn't load the built-in series: {error}</p></Glass>;

  return (
    <Glass>
      <SectionTitle icon="⏱️" title="Built-in series" sub="Realistic made-up histories with rhythms to discover — generated on your computer in a moment." />
      {!sets ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 190, borderRadius: 16 }} />)}
        </div>
      ) : (
        <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
          {Object.entries(sets).map(([name, s]) => {
            const color = name in TINT ? colorAt(TINT[name]) : "var(--accent)";
            const loading = busy === name;
            return (
              <motion.button key={name}
                variants={{ hidden: { opacity: 0, y: 12, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: spring.gentle } }}
                whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => create(name, s)} disabled={!!busy && !loading}
                className="inset col" data-set={name}
                style={{ padding: 14, gap: 10, textAlign: "left", cursor: busy ? "progress" : "pointer", alignItems: "stretch", color: "inherit", opacity: busy && !loading ? 0.55 : 1, borderColor: loading ? color : "var(--hairline)", transition: "border-color .2s, opacity .2s" }}>
                <div style={{ position: "relative" }}>
                  <MiniLine values={previewValues(name)} color={color} />
                  {loading && (
                    <div className="row center" style={{ position: "absolute", inset: 0, justifyContent: "center", gap: 8 }}>
                      <Spinner size={18} color={color} /><span className="small" style={{ fontWeight: 650 }}>Generating…</span>
                    </div>
                  )}
                </div>
                <div className="row between" style={{ gap: 8 }}>
                  <b style={{ fontSize: 14 }}>{s.emoji} {s.label}</b>
                  <span className="badge" style={{ color, background: "var(--fill)", whiteSpace: "nowrap" }}>{s.horizon} {STEP_WORD[name] ?? "steps"} ahead</span>
                </div>
                <span className="small muted" style={{ lineHeight: 1.45 }}>{s.blurb}</span>
                <div className="row wrap" style={{ gap: 5, marginTop: "auto" }}>
                  <span className="badge">🕒 {s.columns.time}</span>
                  <span className="badge">📈 {s.columns.value}</span>
                  {s.columns.series && <span className="badge">🏪 {s.columns.series}</span>}
                  {s.exog.map((x) => <span key={x} className="badge">➕ {x}</span>)}
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </Glass>
  );
}
