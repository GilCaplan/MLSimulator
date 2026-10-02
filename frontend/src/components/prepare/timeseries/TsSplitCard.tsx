import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { spring } from "../../../design/motion";
import type { PipelineSpec } from "../../../lib/types";
import { partColor } from "../../data/timeseries/tsData";
import { Segmented } from "../../glass";
import { Note, StageCard } from "../StageCard";
import { effLags, effWindows, fcOf, setSplitMethod, splitOf, type TsLimits } from "./tsPrepState";

const CELLS = 48;

/** Which time steps are kept back for the exam: the last stretch (honest) or random rows (a peek at the future). */
export function TsSplitCard({ spec, lim, open, onToggle, flash }: { spec: PipelineSpec; lim: TsLimits; open: boolean; onToggle: () => void; flash: boolean }) {
  const method = splitOf(spec);
  const fc = fcOf(spec);
  const H = Math.min(Math.max(1, fc.horizon), lim.maxHorizon);
  const L = Math.max(1, ...effLags(fc, lim), ...effWindows(fc, lim)) + (fc.diff ? 1 : 0);
  const hasVal = lim.n - 2 * H - L >= Math.max(40, 3 * H);
  const u = (n: number) => `${n} ${lim.unit}${n === 1 ? "" : "s"}`;
  return (
    <StageCard id="split" icon="✂️" title="Hide the future" open={open} onToggle={onToggle} flash={flash}
      why="Keep the most recent stretch of every series back as the exam — the models train on what came before."
      info="A forecast is always made from the past about the future. The honest test copies that: train on everything up to a point, then forecast the next steps without seeing them. Each guess is fed back in as input for the next one — exactly as in real life."
      summary={method === "time" ? "last stretch" : "random ⚠️"}>
      <Segmented<"time" | "random"> kind="form" full value={method} onChange={setSplitMethod}
        options={[{ value: "time", label: "🕒 Last stretch of time (honest)" }, { value: "random", label: "🎲 Random rows (peeks at the future)" }]} />
      <div className="inset col" style={{ padding: 12, gap: 8 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <span className="eyebrow">{method === "time" ? "Train on the past, test on the future" : "Test rows scattered through time"}</span>
          <Legend hasVal={method === "random" || hasVal} />
        </div>
        <Cells method={method} H={H} n={lim.n} hasVal={hasVal} />
        <span className="tiny muted" style={{ lineHeight: 1.5 }}>
          {method === "time"
            ? <>Every series: the last <b style={{ color: partColor("test") }}>{u(H)}</b> are the test{hasVal ? <>, the <b style={{ color: partColor("val") }}>{u(H)}</b> before them check progress while training</> : <> (too short for a separate validation stretch)</>}. The test is a real multi-step forecast: step 1, then step 2 built on the guess for step 1, and so on.</>
            : <>20% of the steps are the test and 10% validation, picked at random. Each test step sits between training steps and is predicted <b>one step ahead</b> with the true recent values.</>}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {method === "random" && (
          <motion.div key="warn" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle} style={{ overflow: "hidden" }}>
            <Note icon="⚠️" tone="warn">
              <b>This test cheats.</b> The model has seen the days on both sides of every test day, and never has to forecast more than one step ahead. Scores will look much better than any real forecast — fine for an experiment, but switch back before you trust a number.
            </Note>
          </motion.div>
        )}
      </AnimatePresence>
    </StageCard>
  );
}

function Legend({ hasVal }: { hasVal: boolean }) {
  const items: ["train" | "val" | "test", string][] = [["train", "train"], ...(hasVal ? [["val", "validation"] as ["val", string]] : []), ["test", "test"]];
  return (
    <span className="row tiny muted" style={{ gap: 10 }}>
      {items.map(([p, l]) => <span key={p} className="row" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: partColor(p) }} />{l}</span>)}
    </span>
  );
}

/** A row of time steps that recolour (staggered) when the split changes. */
function Cells({ method, H, n, hasVal }: { method: "time" | "random"; H: number; n: number; hasVal: boolean }) {
  const parts = useMemo(() => {
    const out: ("train" | "val" | "test")[] = Array(CELLS).fill("train");
    if (method === "time") {
      const t = Math.max(1, Math.round((CELLS * H) / n));
      for (let i = CELLS - t; i < CELLS; i++) out[i] = "test";
      if (hasVal) for (let i = CELLS - 2 * t; i < CELLS - t; i++) out[i] = "val";
    } else {
      const order = Array.from({ length: CELLS - 3 }, (_, i) => i + 3).sort((a, b) => Math.sin(a * 91.3) - Math.sin(b * 91.3));
      order.slice(0, Math.round(CELLS * 0.2)).forEach((i) => (out[i] = "test"));
      order.slice(Math.round(CELLS * 0.2), Math.round(CELLS * 0.3)).forEach((i) => (out[i] = "val"));
    }
    return out;
  }, [method, H, n, hasVal]);
  const W = 100 / CELLS;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div style={{ position: "relative", height: 34, marginTop: method === "time" ? 12 : 0 }}>
        <svg viewBox="0 0 100 20" preserveAspectRatio="none" width="100%" height="34" style={{ display: "block" }}>
          {parts.map((p, i) => (
            <motion.rect key={i} x={i * W + W * 0.12} width={W * 0.76} rx={0.6} initial={false}
              animate={{ fill: partColor(p), y: p === "train" ? 6 : 2, height: p === "train" ? 12 : 16 }}
              transition={{ ...spring.gentle, delay: method === "time" ? (CELLS - i) * 0.008 : (i % 9) * 0.03 }} />
          ))}
        </svg>
        {method === "time" && (
          <motion.div style={{ position: "absolute", top: -2, bottom: -2, width: 2, borderRadius: 2, background: "var(--text-2)" }}
            initial={false} animate={{ left: `${(parts.indexOf(hasVal ? "val" : "test") / CELLS) * 100}%` }} transition={spring.gentle}>
            <span className="tiny" style={{ position: "absolute", top: -14, left: -10, whiteSpace: "nowrap", color: "var(--text-2)", fontWeight: 650 }}>now</span>
          </motion.div>
        )}
      </div>
      <div className="row between tiny faint"><span>past</span><span>time →</span></div>
    </div>
  );
}
