import { motion } from "framer-motion";
import { useMemo } from "react";
import { spring } from "../../../design/motion";
import type { PipelineSpec } from "../../../lib/types";
import { Slider } from "../../glass";
import { ChoiceGrid, StageCard } from "../StageCard";
import { patchRecsys, recsysOf } from "./ratingsPrepState";

/** How many ratings per person are hidden for the final exam, and which ones. */
export function HeldOutCard({ spec, hasTime, open, onToggle, flash }: {
  spec: PipelineSpec;
  hasTime: boolean;
  open: boolean;
  onToggle: () => void;
  flash: boolean;
}) {
  const r = recsysOf(spec);
  const recent = r.split === "leave_last_out";
  return (
    <StageCard id="heldout" icon="⏳" title="Held-out ratings" open={open} onToggle={onToggle} flash={flash}
      why="Hide a few of each person's ratings. After training, we check whether the recommender would have suggested them."
      info="This is the recommender's test set. For every person with enough ratings, their last k ratings are hidden from training. A good model puts the hidden items they liked near the top of its list. People with very few ratings stay entirely in training."
      summary={`${r.test_k} per person · ${recent ? "most recent" : "random"}`}>
      <div className="row wrap" style={{ gap: "18px 28px", alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 14, flex: "1 1 280px" }}>
          <Slider label="🎯 Ratings hidden per person" help="More hidden ratings = a steadier score, but less history left to learn from."
            value={r.test_k} min={1} max={10} integer onChange={(v) => patchRecsys(spec, { test_k: v })} />
          <ChoiceGrid<"leave_last_out" | "random"> value={r.split} min={170} onChange={(v) => patchRecsys(spec, { split: v })}
            options={[
              { value: "leave_last_out", icon: "🕒", label: "Most recent", blurb: "Train on the past, test on the future — just like real life.", tag: hasTime ? undefined : <span className="badge warning">needs a time column</span> },
              { value: "random", icon: "🎲", label: "Random", blurb: "Hide any k ratings. Easier — the model may peek at the future." },
            ]} />
          {recent && !hasTime && (
            <span className="tiny" style={{ color: "var(--warning)", lineHeight: 1.5 }}>⚠️ This dataset has no “when” column, so the hidden ratings will be picked at random. Choose a time column on the Data step to test on the most recent ones.</span>
          )}
        </div>
        <div className="inset col" style={{ flex: "1 1 300px", padding: 12, gap: 8 }}>
          <div className="row between">
            <span className="eyebrow">{recent ? "Train on the past, test on the last k" : "Test on k random ratings"}</span>
            <Legend />
          </div>
          <Timeline k={r.test_k} recent={recent} />
        </div>
      </div>
    </StageCard>
  );
}

function Legend() {
  return (
    <span className="row tiny muted" style={{ gap: 10 }}>
      <span className="row" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#0A84FF" }} />train</span>
      <span className="row" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#FF9F0A" }} />test</span>
    </span>
  );
}

const PEOPLE = [{ n: 13, who: "🧑" }, { n: 9, who: "👩" }, { n: 15, who: "👨" }, { n: 4, who: "🧒" }];

/** Each person's ratings as dots on a time line; a "now" line sweeps across and the hidden ones turn orange. */
function Timeline({ k, recent }: { k: number; recent: boolean }) {
  const rows = useMemo(() => PEOPLE.map((p, row) => {
    const xs = Array.from({ length: p.n }, (_, j) => {
      const s = Math.sin((row + 1) * 91.7 + j * 12.9898) * 43758.5453;
      // longer histories stretch further back in time; everyone's latest rating is recent
      const span = 0.9 * Math.min(1, p.n / 15);
      return 0.94 - span + (j / Math.max(1, p.n - 1)) * span + ((s - Math.floor(s)) - 0.5) * 0.02;
    });
    const tested = p.n > k + 2; // short histories stay in training
    let test = new Set<number>();
    if (tested) {
      if (recent) test = new Set(xs.map((_, j) => j).slice(-k));
      else {
        const order = xs.map((_, j) => ({ j, s: Math.sin((row + 3) * 47.1 + j * 7.77) })).sort((a, b) => a.s - b.s);
        test = new Set(order.slice(0, k).map((o) => o.j));
      }
    }
    return { ...p, xs, test, tested };
  }), [k, recent]);
  const ROW = 30;
  const W = 300;
  const X = (x: number) => 30 + x * (W - 8);
  return (
    <div className="col" style={{ gap: 6 }}>
      <svg viewBox={`0 0 ${W + 30} ${PEOPLE.length * ROW + 22}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* time arrow */}
        <line x1={30} x2={W + 22} y1={PEOPLE.length * ROW + 8} y2={PEOPLE.length * ROW + 8} stroke="var(--text-3)" strokeWidth={1} />
        <text x={30} y={PEOPLE.length * ROW + 20} fontSize={9.5} fill="var(--text-3)">past</text>
        <text x={W + 22} y={PEOPLE.length * ROW + 20} fontSize={9.5} fill="var(--text-3)" textAnchor="end">time → now</text>
        {rows.map((p, row) => {
          const y = row * ROW + 14;
          const tx = [...p.test].map((j) => X(p.xs[j]));
          return (
            <g key={row}>
              <text x={8} y={y + 5} fontSize={14}>{p.who}</text>
              <line x1={30} x2={W + 22} y1={y} y2={y} stroke="var(--hairline)" />
              {/* the hidden stretch of a person's history */}
              {recent && tx.length > 0 && (
                <motion.rect key={`pill-${k}`} y={y - 10} height={20} rx={10} fill="rgba(255,159,10,.14)" stroke="rgba(255,159,10,.45)" strokeDasharray="3 2"
                  initial={{ opacity: 0, x: Math.min(...tx) - 9, width: 0 }} animate={{ opacity: 1, x: Math.min(...tx) - 9, width: Math.max(...tx) - Math.min(...tx) + 18 }}
                  transition={{ ...spring.gentle, delay: 0.2 + row * 0.05 }} />
              )}
              {p.xs.map((x, j) => {
                const isTest = p.test.has(j);
                const cx = X(x);
                return (
                  <motion.circle key={`${j}-${recent}-${k}`} cx={cx} r={isTest ? 5.5 : 4.5}
                    initial={{ scale: 0, opacity: 0, cy: y }}
                    animate={{ scale: 1, opacity: 1, fill: isTest ? "#FF9F0A" : "#0A84FF", cy: isTest ? [y, y - 4, y] : y }}
                    transition={{ ...spring.pop, delay: j * 0.025 + row * 0.04, cy: isTest ? { duration: 1.6, repeat: Infinity, delay: j * 0.05 } : spring.pop }}
                    style={{ originX: `${cx}px`, originY: `${y}px` }}
                    stroke="white" strokeWidth={1} />
                );
              })}
              {!p.tested && <text x={X(p.xs[0]) - 10} y={y + 3.5} fontSize={9.5} fill="var(--text-3)" textAnchor="end">too few ratings — all train</text>}
            </g>
          );
        })}
        {/* sweeping "now" line */}
        <motion.line y1={0} y2={PEOPLE.length * ROW} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 3"
          animate={{ x1: [30, W + 24, W + 24], x2: [30, W + 24, W + 24], opacity: [0, 0.8, 0] }}
          transition={{ duration: 3.6, times: [0, 0.8, 1], repeat: Infinity, repeatDelay: 0.8, ease: "linear" }} />
      </svg>
      <span className="tiny muted" style={{ lineHeight: 1.5 }}>
        {recent
          ? <>The model learns from the <b style={{ color: "#0A84FF" }}>blue</b> past and must guess each person's <b style={{ color: "#E08A00" }}>last {k}</b> — like predicting next week's watch list.</>
          : <>Any <b style={{ color: "#E08A00" }}>{k}</b> of each person's ratings are hidden — the model may learn from ratings that came later, so scores look a little rosier.</>}
      </span>
    </div>
  );
}
