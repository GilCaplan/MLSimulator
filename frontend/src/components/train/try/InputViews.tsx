import { motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../../design/motion";
import { fmt } from "../../../lib/format";
import type { TryResult } from "../../../lib/types";
import { InfoTip, Slider } from "../../glass";
import { ExplainedSentence, InfluenceLegend } from "../textKit";
import { HeatLegend, Thumb } from "../visionKit";

/** A picture as the learner sees it, plus what the model actually sees with its saliency heat map on top. */
export function ImageView({ src, r, big = 220, showBig = true }: { src?: string | null; r: TryResult | null; big?: number; showBig?: boolean }) {
  const [strength, setStrength] = useState(0.65);
  const heat = r?.saliency ?? null;
  return (
    <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
      {showBig && (
        <div className="col" style={{ gap: 6 }}>
          <span className="tiny faint">The picture</span>
          {src ? (
            <motion.img key={src.slice(-48)} src={src} alt="" draggable={false} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring.gentle}
              style={{ width: big, height: big, borderRadius: 18, objectFit: "cover", imageRendering: "pixelated", display: "block", background: "var(--fill-2)",
                boxShadow: "0 0 0 1px var(--hairline), 0 10px 30px rgba(0,0,0,0.16)" }} />
          ) : <div className="skeleton" style={{ width: big, height: big, borderRadius: 18 }} />}
        </div>
      )}
      <div className="col" style={{ gap: 6, minWidth: 150 }}>
        <span className="row tiny faint" style={{ gap: 5 }}>
          What the model sees
          <InfoTip text="Before it looks, every picture is cropped to a square and shrunk to the size the model was trained on (and turned grey if it learned in grey). This tiny version is all it gets." />
        </span>
        {r?.model_input ? (
          <Thumb src={r.model_input} size={132} radius={14} heat={heat} strength={strength} />
        ) : <div className="skeleton" style={{ width: 132, height: 132, borderRadius: 14 }} />}
        {heat ? (
          <div className="col" style={{ gap: 4, width: 150 }}>
            <span className="tiny faint">Heat map strength</span>
            <Slider fixedRenderer="slider" value={strength} min={0} max={1} step={0.05} onChange={setStrength} format={(v) => `${Math.round(v * 100)}%`} />
            <HeatLegend width={56} low="ignored" high="looked" />
          </div>
        ) : r ? (
          <span className="tiny faint" style={{ maxWidth: 150, lineHeight: 1.4 }}>No heat map — only neural networks can show where they looked.</span>
        ) : null}
      </div>
    </div>
  );
}

/** A message with every word coloured by how much it pushed the answer. */
export function TextView({ text, r }: { text: string; r: TryResult | null }) {
  if (!r?.tokens?.length) {
    return <p style={{ fontSize: 15, lineHeight: 1.6, padding: "4px 2px" }}>“{text}”</p>;
  }
  return (
    <div className="col" style={{ gap: 10 }}>
      <ExplainedSentence tokens={r.tokens} pred={String(r.prediction)} size={15} />
      <InfluenceLegend width={110} />
    </div>
  );
}

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : fmt(v, 3)) : String(v));

/** A neat card of one row's input values. */
export function RowCard({ row }: { row: Record<string, unknown> }) {
  const entries = Object.entries(row);
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
      {entries.map(([k, v], i) => (
        <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: Math.min(i, 16) * 0.02 }}
          className="inset col" style={{ padding: "8px 10px", gap: 2, minWidth: 0 }}>
          <span className="tiny faint truncate" title={k}>{k}</span>
          <b className="num truncate" style={{ fontSize: 14 }} title={String(v ?? "")}>{show(v)}</b>
        </motion.div>
      ))}
    </div>
  );
}
