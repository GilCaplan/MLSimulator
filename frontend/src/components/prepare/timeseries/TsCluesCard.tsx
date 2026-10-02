import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { DatasetProfile, PipelineSpec } from "../../../lib/types";
import { lagWords, type TsRoles } from "../../data/timeseries/tsData";
import { InfoTip, NumberField, Segmented, Toggle } from "../../glass";
import { Note, StageCard, SubHead } from "../StageCard";
import { effLags, effWindows, fcOf, patchForecast, type TsLimits } from "./tsPrepState";

/** The clues each forecast is built from: past values (lags), rolling averages, calendar, trend, transforms and extra columns. */
export function TsCluesCard({ spec, profile, roles, lim, open, onToggle, flash }: {
  spec: PipelineSpec; profile: DatasetProfile | null; roles: TsRoles; lim: TsLimits; open: boolean; onToggle: () => void; flash: boolean;
}) {
  const fc = fcOf(spec);
  const lags = effLags(fc, lim);
  const windows = effWindows(fc, lim);
  const S = lim.season;
  const u = lim.unit;
  const candidates = (profile?.exog_candidates ?? []).filter((c) => c !== roles.time && c !== roles.value && c !== roles.series);
  const exog = fc.exog.filter((c) => candidates.includes(c));
  const canLog = (profile?.value_stats?.min ?? 0) > -1;
  const n = lags.length + windows.length + (fc.calendar ? 1 : 0) + (fc.trend ? 1 : 0) + exog.length;

  const lagQuick = [1, 2, 3, ...(S > 3 ? [S] : []), ...(S > 1 ? [2 * S] : [])].filter((k, i, a) => k <= lim.maxLag && a.indexOf(k) === i);
  const winQuick = [3, ...(S > 3 ? [S] : []), ...(S > 1 ? [2 * S] : []), ...(S <= 3 ? [7, 14] : [])].filter((k, i, a) => k > 1 && k <= lim.maxLag && a.indexOf(k) === i);
  const lagLabel = (k: number) => lagWords(k, u, S, lim.seasonName);

  return (
    <StageCard id="features" icon="🧩" title="Clues for the forecast" open={open} onToggle={onToggle} flash={flash}
      why="Regression models predict the next value from clues about the past: earlier values, recent averages, the calendar and extra columns."
      info="Each training row is one time step: the clues are what was known just before it, the answer is the value itself. Statistical models (Holt-Winters, naive) ignore these clues — they read the series directly."
      summary={`${n} clue${n === 1 ? "" : "s"}`}>

      <ChipSection title="Past values (lags)" info={`A lag of k is the value k ${u}s earlier. Lag 1 tells the model where the series is right now; a lag of ${S > 1 ? `${S} (${lagLabel(S)})` : "one season"} lets it copy the rhythm. Long lags need a long history.`}
        why={`“What was it ${lagLabel(1)}? ${S > 1 ? `And ${lagLabel(S)}?` : ""}”`}
        auto={fc.lags === null} values={lags} label={lagLabel} quick={lagQuick} max={lim.maxLag} season={S} unit={u}
        onAuto={(a) => patchForecast(spec, { lags: a ? null : lags })}
        onChange={(v) => patchForecast(spec, { lags: v })} />

      <ChipSection title="Rolling averages" info={`The average of the previous w ${u}s. It smooths away noise and tells the model the recent level — a ${S > 1 ? S : 7}-${u} average ignores the ${lim.seasonName ?? "weekly"} ups and downs.`}
        why="The recent level, without the day-to-day noise."
        auto={fc.windows === null} values={windows} label={(w) => `average of the last ${w} ${u}s`} quick={winQuick} max={lim.maxLag} season={S} unit={u} min={2}
        onAuto={(a) => patchForecast(spec, { windows: a ? null : windows })}
        onChange={(v) => patchForecast(spec, { windows: v })} />

      <div className="col" style={{ gap: 10 }}>
        <SubHead info="Switches that change what the models see or predict. Each one helps in a particular situation — try them and compare after training.">More clues & transforms</SubHead>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          <Switch icon="📅" label="Calendar" checked={fc.calendar} onChange={(v) => patchForecast(spec, { calendar: v })} disabled={lim.freq === "step" || lim.freq === "year"}
            why={lim.freq === "hour" ? "Hour of day and day of week as flags." : lim.freq === "day" ? "Day of week and month as flags — “Saturdays are busy”." : "Month (or quarter) flags — “summers are busy”."}
            info="One yes/no column per hour, weekday or month. Lets models learn rhythms directly from the calendar instead of reconstructing them from lags — and the calendar is always known in advance." />
          <Switch icon="📐" label="Trend counter" checked={fc.trend} onChange={(v) => patchForecast(spec, { trend: v })}
            why="A number that grows with time, so models can follow a steady climb."
            info="Linear models use it to extrapolate a trend. Tree models can't extend it beyond what they've seen — for them, differencing works better." />
          <Switch icon="Δ" label="Predict the change" checked={fc.diff} onChange={(v) => patchForecast(spec, { diff: v })}
            why="Predict how much the value moves from one step to the next, not the value itself."
            info="Called differencing. Tree models can only predict values they've seen before, so a trend that climbs past the training range gets cut off. Predicting the step-to-step change lets them follow it." />
          <Switch icon="🌱" label="Log transform" checked={fc.log && canLog} onChange={(v) => patchForecast(spec, { log: v })} disabled={!canLog}
            why={canLog ? "For growth that multiplies: when the swings grow with the level." : "Needs every value above −1."}
            info="Works on log(1 + value) and converts back afterwards. If the summer peak is always +20% (not +20 units), the log turns that growing swing into a steady one that's easier to learn." />
        </div>
      </div>

      <div className="col" style={{ gap: 10 }}>
        <SubHead info="Extra numeric columns used as clues at the time being forecast. Only use columns whose future values you'd really know when making the forecast — planned promotions, a weather forecast, holidays.">Extra columns — known in advance?</SubHead>
        {candidates.length === 0 ? (
          <span className="small muted">No other numeric columns in this data — the forecast uses the series' own past only.</span>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {candidates.map((c) => (
              <div key={c} className="inset row between" style={{ padding: "8px 12px", gap: 10 }}>
                <span className="col" style={{ gap: 1, minWidth: 0 }}>
                  <b className="small truncate">➕ {c}</b>
                  <span className="tiny muted">{profile?.exog?.includes(c) ? "suggested: known ahead" : "known ahead? only if yes"}</span>
                </span>
                <Toggle checked={exog.includes(c)} onChange={(v) => patchForecast(spec, { exog: v ? [...exog, c] : exog.filter((x) => x !== c) })} />
              </div>
            ))}
          </div>
        )}
        {candidates.length > 0 && (
          <Note icon="🕵️" tone="warn">
            Only tick columns you'd know <b>before</b> the day you forecast — a planned promotion, a temperature forecast. Columns only known <b>after the fact</b> (number of customers, items returned) leak the answer: great test scores, useless forecasts.
          </Note>
        )}
      </div>
    </StageCard>
  );
}

function Switch({ icon, label, why, info, checked, onChange, disabled }: { icon: string; label: string; why: string; info: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="inset row" style={{ padding: "10px 12px", gap: 12, alignItems: "flex-start", opacity: disabled ? 0.55 : 1 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: checked ? "var(--accent-soft)" : "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, fontWeight: 700, color: "var(--text)", transition: "background .2s" }}>{icon}</span>
      <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
        <span className="row small" style={{ gap: 6, fontWeight: 650 }}>{label} <InfoTip text={info} /></span>
        <span className="tiny muted" style={{ lineHeight: 1.45 }}>{why}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function ChipSection({ title, info, why, auto, values, label, quick, max, min = 1, season, unit, onAuto, onChange }: {
  title: string; info: string; why: ReactNode; auto: boolean; values: number[]; label: (k: number) => string; quick: number[];
  max: number; min?: number; season: number; unit: string; onAuto: (auto: boolean) => void; onChange: (v: number[]) => void;
}) {
  const [draft, setDraft] = useState(Math.min(max, Math.max(min, season > 1 ? season : 4)));
  const set = (v: number[]) => onChange([...new Set(v)].filter((k) => k >= min && k <= max).sort((a, b) => a - b));
  const add = (k: number) => set([...values, k]);
  return (
    <div className="col" style={{ gap: 10 }}>
      <SubHead info={info} right={
        <Segmented<"auto" | "custom"> kind="form" size="sm" value={auto ? "auto" : "custom"} onChange={(v) => onAuto(v === "auto")}
          options={[{ value: "auto", label: "Automatic" }, { value: "custom", label: "My own" }]} />
      }>{title}</SubHead>
      <span className="tiny muted" style={{ marginTop: -4 }}>{why}</span>
      <motion.div layout className="row wrap" style={{ gap: 6, minHeight: 30 }}>
        <AnimatePresence initial={false}>
          {values.map((k) => {
            const seasonal = season > 1 && k % season === 0;
            return (
              <motion.span key={k} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring.pop}
                className="badge" title={label(k)}
                style={{ height: 28, gap: 6, paddingRight: auto ? 10 : 4, background: seasonal ? "var(--accent-soft)" : "var(--fill)", color: "var(--text)" }}>
                <b className="num">{k}</b><span className="muted" style={{ fontWeight: 500 }}>{label(k)}</span>
                {!auto && (
                  <button className="btn ghost sm icon" aria-label={`Remove ${k}`} onClick={() => set(values.filter((x) => x !== k))}
                    style={{ width: 20, height: 20, minHeight: 20, padding: 0, fontSize: 11 }}>✕</button>
                )}
              </motion.span>
            );
          })}
        </AnimatePresence>
        {values.length === 0 && <span className="small muted">none</span>}
      </motion.div>
      {!auto && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="row wrap" style={{ gap: 6, alignItems: "center" }}>
          <span className="tiny muted">Quick add:</span>
          {quick.filter((k) => !values.includes(k)).map((k) => (
            <motion.button key={k} whileTap={{ scale: 0.94 }} className="btn sm" onClick={() => add(k)} title={label(k)}>＋ {k}{season > 1 && k % season === 0 ? " 🔁" : ""}</motion.button>
          ))}
          <span className="row" style={{ gap: 6, marginLeft: 6 }}>
            <NumberField value={draft} min={min} max={max} onChange={setDraft} width={70} ariaLabel={`${title} to add`} />
            <button className="btn sm" disabled={values.includes(draft)} onClick={() => add(draft)}>Add</button>
          </span>
          <span className="tiny faint">max {max} {unit}s</span>
        </motion.div>
      )}
    </div>
  );
}
