import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../design/motion";
import { withAlpha } from "../../lib/colors";
import { METRIC_HELP } from "../../lib/format";
import type { RunResult } from "../../lib/types";
import { AnimatedNumber, InfoTip, Select, Slider } from "../glass";
import { LineChart } from "../charts";

/** Interactive decision-threshold explorer for binary classifiers. */
export function ThresholdTuner({ result }: { result: RunResult }) {
  const models = Object.values(result.models).filter((m) => !m.baseline && m.thresholds?.length);
  const [key, setKey] = useState(models[0]?.key ?? "");
  const [t, setT] = useState(0.5);
  useEffect(() => {
    if (!models.some((m) => m.key === key)) setKey(models[0]?.key ?? "");
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = result.models[key] ?? models[0];
  if (!model?.thresholds) return null;
  const rows = model.thresholds;
  const row = rows.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
  const pos = result.classes?.[1] ?? "yes";
  const neg = result.classes?.[0] ?? "no";
  const total = row.tp + row.fp + row.fn + row.tn || 1;
  const readouts = [
    { k: "precision", label: "Precision", v: row.precision, color: "#0A84FF" },
    { k: "recall", label: "Recall", v: row.recall, color: "#FF375F" },
    { k: "f1", label: "F1", v: row.f1, color: "#BF5AF2" },
    { k: "accuracy", label: "Accuracy", v: row.accuracy, color: "#30D158" },
  ];
  const cells = [
    { label: "Caught", sub: `real ${pos}, flagged`, v: row.tp, good: true },
    { label: "False alarm", sub: `real ${neg}, flagged`, v: row.fp, good: false },
    { label: "Missed", sub: `real ${pos}, not flagged`, v: row.fn, good: false },
    { label: "Correctly ignored", sub: `real ${neg}, not flagged`, v: row.tn, good: true },
  ];

  return (
    <div className="col" style={{ gap: 16 }}>
      <p className="small muted" style={{ lineHeight: 1.6 }}>
        Your model doesn't just say <i>{pos}</i> or <i>{neg}</i> — it gives a probability, and anything above the <b>threshold</b> gets flagged as <i>{pos}</i>.
        Think of a bank's fraud alarm: set it <b>low</b> and it catches nearly every fraud but pesters honest customers with false alarms; set it <b>high</b> and alarms are rarely wrong, but some fraud slips through.
        Slide to find the balance that suits your problem. (Models use 0.5 by default.)
      </p>
      <div className="row wrap" style={{ gap: 16, alignItems: "flex-end" }}>
        {models.length > 1 && (
          <div className="col" style={{ gap: 6 }}>
            <span className="small" style={{ fontWeight: 560 }}>Model</span>
            <Select value={model.key} onChange={setKey} options={models.map((m) => ({ value: m.key, label: m.label }))} />
          </div>
        )}
        <div className="grow" style={{ minWidth: 240 }}>
          <Slider label={<>Threshold <span className="faint small">— flag as “{pos}” when probability ≥</span></>} value={t} min={0.05} max={0.95} step={0.05} onChange={setT} format={(v) => v.toFixed(2)} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        {readouts.map((r) => (
          <div key={r.k} className="inset col" style={{ padding: 12, gap: 6 }}>
            <span className="row small muted" style={{ gap: 5 }}>{r.label}<InfoTip text={METRIC_HELP[r.k]} /></span>
            <b style={{ fontSize: 22, color: r.color }}><AnimatedNumber value={r.v * 100} format={(v) => `${v.toFixed(1)}%`} duration={0.4} /></b>
            <div style={{ height: 5, borderRadius: 3, background: "var(--fill-2)", overflow: "hidden" }}>
              <motion.div style={{ height: "100%", background: r.color, borderRadius: 3 }} animate={{ width: `${r.v * 100}%` }} transition={spring.snappy} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(240px, 0.9fr) minmax(0, 1.4fr)", gap: 16, alignItems: "start" }}>
        <div className="col" style={{ gap: 6 }}>
          <div className="row tiny faint" style={{ gap: 6, paddingLeft: 2 }}>
            <span style={{ flex: 1, textAlign: "center" }}>Flagged “{pos}”</span>
            <span style={{ flex: 1, textAlign: "center" }}>Not flagged</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {cells.map((c) => {
              const base = c.good ? "#30D158" : "#FF453A";
              const frac = c.v / total;
              return (
                <motion.div key={c.label} className="col center" animate={{ background: withAlpha(base, 0.1 + Math.min(0.6, frac * 1.6)) }} transition={{ duration: 0.3 }}
                  style={{ borderRadius: 14, padding: "14px 8px", gap: 2, textAlign: "center", minHeight: 92 }}>
                  <b style={{ fontSize: 24 }}><AnimatedNumber value={c.v} duration={0.4} /></b>
                  <span className="small" style={{ fontWeight: 600 }}>{c.label}</span>
                  <span className="tiny muted">{c.sub}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
        <div className="inset" style={{ padding: 8 }}>
          <LineChart height={210} xLabel="Threshold" yDomain={[0, 1]} marker={{ x: row.t, label: row.t.toFixed(2) }}
            series={[
              { name: "Precision", color: "#0A84FF", points: rows.map((r) => ({ x: r.t, y: r.precision })) },
              { name: "Recall", color: "#FF375F", points: rows.map((r) => ({ x: r.t, y: r.recall })) },
              { name: "F1", color: "#BF5AF2", points: rows.map((r) => ({ x: r.t, y: r.f1 })), dashed: true },
            ]} />
        </div>
      </div>
    </div>
  );
}
