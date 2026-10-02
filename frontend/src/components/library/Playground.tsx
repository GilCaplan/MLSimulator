import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { classColor } from "../../lib/colors";
import { fmt, pct } from "../../lib/format";
import { toast } from "../../lib/store";
import type { PredictResponse, SavedModel } from "../../lib/types";
import { extent, useSize } from "../charts";
import { Glass, InfoTip } from "../glass";
import { InputControl, type CurveData } from "./InputControl";
import { randomRow, typicalRow, useDebounced, type Row } from "./inputs";
import { PredictionPanel } from "./PredictionPanel";
import { SectionTitle, rise } from "./shared";

const COLLAPSED = 12;

/** "Try it live": an auto-generated form whose every change re-asks the model, plus what-if curves. */
export function Playground({ model }: { model: SavedModel }) {
  const schema = model.input_schema ?? [];
  const isCls = model.task === "classification";
  const [row, setRow] = useState<Row>(() => typicalRow(schema));
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [curves, setCurves] = useState<Record<string, CurveData>>({});
  const [showAll, setShowAll] = useState(false);
  const [dice, setDice] = useState(0);
  const [gridRef, { width }] = useSize<HTMLDivElement>();
  const wide = width > 860;
  const predSeq = useRef(0);
  const sensSeq = useRef(0);
  const lastError = useRef<string | null>(null);

  const reportError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== lastError.current) toast.error(msg);
    lastError.current = msg;
  };

  /* ---- live prediction (debounced ~120ms) */
  const predRow = useDebounced(row, 120);
  useEffect(() => {
    const seq = ++predSeq.current;
    setBusy(true);
    api.predict(model.id, [predRow])
      .then((r) => { if (seq === predSeq.current) { setResult(r); lastError.current = null; } })
      .catch(reportError)
      .finally(() => seq === predSeq.current && setBusy(false));
  }, [predRow, model.id]);

  const classes = result?.classes ?? model.classes ?? [];
  const predicted = result ? String(result.predictions[0]) : null;
  const classIndex = isCls && predicted !== null ? classes.map(String).indexOf(predicted) : null;

  /* ---- what-if curves (debounced ~300ms), following the currently predicted class */
  const sensRow = useDebounced(row, 300);
  useEffect(() => {
    if (!result) return;
    const seq = ++sensSeq.current;
    api.sensitivity(model.id, sensRow, classIndex !== null && classIndex >= 0 ? classIndex : null)
      .then((r) => {
        if (seq !== sensSeq.current) return;
        const map: Record<string, CurveData> = {};
        for (const c of r.curves) map[c.name] = { x: c.x, y: c.y };
        setCurves(map);
      })
      .catch(() => { /* curves are a bonus — stay quiet */ });
  }, [sensRow, classIndex, model.id, !!result]); // eslint-disable-line react-hooks/exhaustive-deps

  const domain = useMemo<[number, number]>(() => {
    if (isCls) return [0, 1];
    const ys = Object.values(curves).flatMap((c) => c.y);
    const [lo, hi] = extent(ys);
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  }, [curves, isCls]);

  const targetRange = useMemo<[number, number] | null>(() => {
    const pts = model.detail?.residuals?.points;
    if (isCls || !pts?.length) return null;
    return extent(pts.map((p) => p.t));
  }, [model, isCls]);

  const curveColor = isCls ? classColor(predicted, classes) : "#5E5CE6";
  const formatY = isCls ? (v: number) => `${pct(v, 0)} ${predicted ?? ""}` : (v: number) => fmt(v);
  const visible = showAll ? schema : schema.slice(0, COLLAPSED);

  return (
    <motion.section variants={rise}>
      <SectionTitle
        id="try"
        icon="🎮"
        title="Try it live"
        subtitle="Change any input and the model answers instantly. Start from a typical example, or roll the dice for a random one."
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
      <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1.55fr) minmax(330px, 1fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <Glass style={{ minWidth: 0, order: wide ? 0 : 1 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <h3>Inputs</h3>
            <span className="tiny faint">{schema.length} feature{schema.length === 1 ? "" : "s"}</span>
          </div>
          <p className="small muted row" style={{ gap: 6, marginBottom: 16, lineHeight: 1.5, alignItems: "flex-start" }}>
            <span>
              The little curve under each slider shows <b>how the answer would change if only this one input moved</b> — the dot is where you are now.
              {isCls ? " Higher = more likely to be the predicted answer." : " Higher = a bigger predicted value."}
            </span>
            <InfoTip text="These are called sensitivity (or partial-dependence) curves. A flat line means the model barely cares about that input for this example; a steep one means it's a big lever." />
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "18px 24px" }}>
            <AnimatePresence initial={false}>
              {visible.map((item, i) => (
                <motion.div key={item.name} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.gentle, delay: Math.min(i, 12) * 0.025 } }} exit={{ opacity: 0 }}>
                  <InputControl
                    item={item}
                    value={row[item.name]}
                    onChange={(v) => setRow((r) => ({ ...r, [item.name]: v }))}
                    curve={curves[item.name]}
                    domain={domain}
                    color={curveColor}
                    formatY={formatY}
                  />
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
          <PredictionPanel model={model} result={result} warming={!result} busy={busy && !!result} targetRange={targetRange} />
        </Glass>
      </div>
    </motion.section>
  );
}
