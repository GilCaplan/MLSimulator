import { motion } from "framer-motion";
import { useState } from "react";
import { api } from "../../lib/api";
import { fmt } from "../../lib/format";
import { Glass, Spinner } from "../glass";
import { useLatest } from "./shared";
import { SectionTitle } from "./ui";

const PAGE = 50;

type RowsResp = { columns: string[]; rows: any[][]; total: number; offset: number };

const cell = (v: any) => {
  if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) return <span className="faint" title="missing">∅</span>;
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : fmt(v, 4);
  return String(v);
};

/** Paged raw-data table with a sticky header and horizontal scroll. */
export function RowsTable({ datasetId, target, mark = "🎯" }: { datasetId: string; target: string | null; mark?: string }) {
  const [offset, setOffset] = useState(0);
  const { data, loading, error } = useLatest<RowsResp>(`${datasetId}:${offset}`, () => api.rows(datasetId, offset, PAGE));
  const total = data?.total ?? 0;
  const tIdx = data && target ? data.columns.indexOf(target) : -1;
  return (
    <Glass animate_in>
      <SectionTitle icon="🔍" title="Peek at the data" sub="The raw rows, exactly as the models will see them (before preparation)."
        right={
          <div className="row" style={{ gap: 8 }}>
            {loading && <Spinner size={14} color="var(--accent)" />}
            <span className="small muted num">{total ? `${(offset + 1).toLocaleString()}–${Math.min(offset + PAGE, total).toLocaleString()} of ${total.toLocaleString()}` : ""}</span>
            <button className="btn sm icon" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} title="Previous page">‹</button>
            <button className="btn sm icon" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} title="Next page">›</button>
          </div>
        } />
      {error && <p className="small" style={{ color: "var(--danger)" }}>⚠️ {error}</p>}
      {data ? (
        <div className="scroll" style={{ maxHeight: 380, borderRadius: 12, border: "1px solid var(--hairline)" }}>
          <table className="table">
            <thead>
              <tr>
                <th className="faint" style={{ width: 50 }}>#</th>
                {data.columns.map((c, i) => <th key={c} style={i === tIdx ? { color: "var(--accent)" } : undefined}>{i === tIdx && `${mark} `}{c}</th>)}
              </tr>
            </thead>
            <motion.tbody key={data.offset} initial={{ opacity: 0 }} animate={{ opacity: loading ? 0.6 : 1 }} transition={{ duration: 0.2 }}>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td className="faint num">{data.offset + i + 1}</td>
                  {r.map((v, j) => <td key={j} className="num" style={j === tIdx ? { fontWeight: 650, background: "var(--accent-soft)" } : undefined}>{cell(v)}</td>)}
                </tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      ) : (
        <div className="skeleton" style={{ height: 240 }} />
      )}
    </Glass>
  );
}
