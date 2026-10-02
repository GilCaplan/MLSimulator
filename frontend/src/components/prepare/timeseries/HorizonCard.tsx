import { motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { DatasetProfile, PipelineSpec } from "../../../lib/types";
import { fmtMs, isDateSeries, tNum } from "../../data/timeseries/tsData";
import { TimeChart } from "../../data/timeseries/viz";
import { Slider } from "../../glass";
import { StageCard } from "../StageCard";
import { fcOf, patchForecast, type TsLimits } from "./tsPrepState";

const STEP_MS: Record<string, number> = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30.44 * 86400e3, quarter: 91.3 * 86400e3, year: 365.25 * 86400e3 };

/** How far ahead to forecast: a slider and a picture of the history with the future stretch to fill in. */
export function HorizonCard({ spec, profile, lim, open, onToggle, flash }: {
  spec: PipelineSpec; profile: DatasetProfile | null; lim: TsLimits; open: boolean; onToggle: () => void; flash: boolean;
}) {
  const fc = fcOf(spec);
  const H = Math.min(Math.max(1, fc.horizon), lim.maxHorizon);
  const u = (n: number) => `${n} ${lim.unit}${n === 1 ? "" : "s"}`;
  const quick = [
    ...(lim.season > 1 ? [{ v: lim.season, label: `1 ${lim.seasonName ?? "season"}` }, { v: 2 * lim.season, label: `2 ${lim.seasonName ?? "season"}s` }] : []),
    ...(profile?.horizon_default ? [{ v: profile.horizon_default, label: "suggested" }] : []),
  ].filter((q, i, a) => q.v <= lim.maxHorizon && a.findIndex((x) => x.v === q.v) === i);

  // the last stretch of the first series, then the empty future
  const s0 = profile?.timeline?.[0];
  const isDate = !!s0 && isDateSeries(s0.points);
  const keep = Math.max(3 * H, 3 * lim.season, 40);
  const hist = (s0?.points ?? []).slice(-keep).map((p) => ({ x: tNum(p.t), y: p.y }));
  const step = hist.length > 1 ? (isDate ? STEP_MS[lim.freq] ?? hist[hist.length - 1].x - hist[hist.length - 2].x : 1) : 1;
  const last = hist[hist.length - 1];
  const fut = last ? { x0: last.x, x1: last.x + H * step } : null;
  const ghost = fut ? [last, { x: fut.x1, y: last.y }] : [];

  return (
    <StageCard id="horizon" icon="🔭" title="Forecast horizon" open={open} onToggle={onToggle} flash={flash}
      why={`How many ${lim.unit}s ahead the models must predict — the test asks them to forecast exactly this far.`}
      info="Forecasts get harder the further you look: each guess becomes an input for the next one, so small errors snowball. Pick the horizon you'd really need — e.g. 4 weeks of sales to plan staff. The test block at the end of every series is this long."
      summary={`${u(H)} ahead`}>
      <div className="row wrap" style={{ gap: "18px 28px", alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 12, flex: "1 1 260px" }}>
          <Slider label={`🔭 Forecast ${u(H)} ahead`} help={`At most a fifth of the shortest series (${u(lim.maxHorizon)}), so there's enough left to learn from.`}
            value={H} min={1} max={lim.maxHorizon} integer format={(v) => u(Math.round(v))} onChange={(v) => patchForecast(spec, { horizon: v })} />
          {quick.length > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              {quick.map((q) => (
                <motion.button key={q.label} whileTap={{ scale: 0.94 }} transition={spring.snappy} className={`btn sm${H === q.v ? " primary" : ""}`}
                  onClick={() => patchForecast(spec, { horizon: q.v })}>
                  {q.label} <span className="faint num">({q.v})</span>
                </motion.button>
              ))}
            </div>
          )}
          <span className="tiny muted" style={{ lineHeight: 1.5 }}>
            Longer horizons are more useful for planning, but every step further out adds uncertainty — watch the error grow step by step after training.
          </span>
        </div>
        <div className="inset col" style={{ flex: "2 1 320px", padding: 12, gap: 6 }}>
          <div className="row between">
            <span className="eyebrow">The past → the {u(H)} to forecast</span>
            {fut && isDate && <span className="tiny muted">until ≈ {fmtMs(fut.x1, lim.freq)}</span>}
          </div>
          {hist.length > 1 && fut ? (
            <TimeChart key={H} height={150} isDate={isDate}
              lines={[{ key: "history", color: "var(--accent)", points: hist }, { key: "future", color: "var(--text-3)", points: ghost, dashed: true, width: 1.4 }]}
              bands={[{ x0: fut.x0, x1: fut.x1, color: "#FF9F0A", label: "forecast ?" }]} />
          ) : <div className="skeleton" style={{ height: 150 }} />}
        </div>
      </div>
    </StageCard>
  );
}
