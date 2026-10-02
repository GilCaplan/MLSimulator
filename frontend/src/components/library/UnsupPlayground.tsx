import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { AssignResponse, SavedModel } from "../../lib/types";
import { useSize } from "../charts";
import { Glass } from "../glass";
import { AssignPanel } from "./AssignPanel";
import { InputControl } from "./InputControl";
import { randomRow, typicalRow, useDebounced, type Row } from "./inputs";
import { SectionTitle, rise } from "./shared";

const COLLAPSED = 12;

const COPY: Record<string, { title: string; subtitle: string; hint: string }> = {
  clustering: {
    title: "Which group is it in?",
    subtitle: "Describe a row and the model tells you which of its groups it belongs to — and how close it came to the others.",
    hint: "Slide an input and watch the row hop between groups on the map. Inputs that make it switch groups are the ones that define the groups.",
  },
  anomaly: {
    title: "Is it unusual?",
    subtitle: "Describe a row and the detector scores how strange it looks compared with everything it learned from.",
    hint: "Push an input to an extreme and watch the score climb past the threshold. Combinations that never happen together can be flagged too — even when each value alone looks fine.",
  },
  reduction: {
    title: "Where does it land?",
    subtitle: "Describe a row and see where it would sit on the map.",
    hint: "Move one input and watch the dot travel — inputs that move it a lot are the ones the map's directions are built from.",
  },
};

/** "Try it live" for clustering / map / anomaly models: the generated input form with group, score or map position. */
export function UnsupPlayground({ model }: { model: SavedModel }) {
  const schema = model.input_schema ?? [];
  const task = model.task as string;
  const copy = COPY[task] ?? COPY.clustering;
  const [row, setRow] = useState<Row>(() => typicalRow(schema));
  const [result, setResult] = useState<AssignResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [dice, setDice] = useState(0);
  const [gridRef, { width }] = useSize<HTMLDivElement>();
  const wide = width > 860;
  const seq = useRef(0);
  const lastError = useRef<string | null>(null);

  const debounced = useDebounced(row, 120);
  useEffect(() => {
    const s = ++seq.current;
    setBusy(true);
    api.assign(model.id, [debounced])
      .then((r) => { if (s === seq.current) { setResult(r); lastError.current = null; } })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== lastError.current) toast.error(msg);
        lastError.current = msg;
      })
      .finally(() => s === seq.current && setBusy(false));
  }, [debounced, model.id]);

  const visible = showAll ? schema : schema.slice(0, COLLAPSED);

  return (
    <motion.section variants={rise}>
      <SectionTitle
        id="try"
        icon={task === "anomaly" ? "🚨" : task === "reduction" ? "🗺️" : "🫧"}
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setRow(typicalRow(schema))}>↺ Typical values</button>
            <button className="btn sm primary" onClick={() => { setRow(randomRow(schema)); setDice((d) => d + 1); }}>
              <motion.span key={dice} initial={{ rotate: -180, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={spring.pop} style={{ display: "inline-block" }}>🎲</motion.span>
              Random example
            </button>
          </div>
        }
      />
      <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1.4fr) minmax(360px, 1fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <Glass style={{ minWidth: 0, order: wide ? 0 : 1 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <h3>Inputs</h3>
            <span className="tiny faint">{schema.length} feature{schema.length === 1 ? "" : "s"}</span>
          </div>
          <p className="small muted" style={{ marginBottom: 16, lineHeight: 1.5 }}>{copy.hint}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "18px 24px" }}>
            <AnimatePresence initial={false}>
              {visible.map((item, i) => (
                <motion.div key={item.name} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.gentle, delay: Math.min(i, 12) * 0.025 } }} exit={{ opacity: 0 }}>
                  <InputControl item={item} value={row[item.name]} onChange={(v) => setRow((r) => ({ ...r, [item.name]: v }))} domain={[0, 1]} color="#5E5CE6" formatY={String} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {schema.length > COLLAPSED && (
            <button className="btn sm ghost" style={{ marginTop: 14 }} onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show fewer inputs" : `Show all ${schema.length} inputs`}
            </button>
          )}
        </Glass>
        <Glass variant="strong" style={{ position: wide ? "sticky" : "relative", top: 58, minWidth: 0, zIndex: 2 }}>
          <AssignPanel model={model} result={result} busy={busy && !!result} />
        </Glass>
      </div>
    </motion.section>
  );
}
