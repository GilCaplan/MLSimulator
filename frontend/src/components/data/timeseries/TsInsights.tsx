import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { fadeUp } from "../../../design/motion";
import type { DatasetProfile } from "../../../lib/types";
import { Glass, Segmented } from "../../glass";
import { SectionTitle } from "../ui";
import { fmtMs, fmtTime, fmtVal, isDateSeries, lagWords, seriesColor, tNum } from "./tsData";
import { AcfBars, SeasonBars, TimeChart } from "./viz";

/** The whole history, per series: all together or one at a time. */
export function TimelineCard({ profile, valueName }: { profile: DatasetProfile; valueName: string }) {
  const tl = (profile.timeline ?? []).slice(0, 4);
  const [pick, setPick] = useState<string>("__all");
  const shown = pick === "__all" ? tl : tl.filter((s) => s.series === pick);
  const isDate = tl.length > 0 && isDateSeries(tl[0].points);
  const lines = shown.map((s) => {
    const i = tl.indexOf(s);
    return { key: s.series === "all" ? valueName : s.series, color: seriesColor(i), points: s.points.map((p) => ({ x: tNum(p.t), y: p.y })), width: shown.length > 1 ? 1.3 : 1.7 };
  });
  const more = (profile.n_series ?? 0) - tl.length;
  const info = profile.series ?? [];
  const range = info.length ? `${fmtTime(info[0].start.slice(0, profile.freq === "hour" ? 16 : 10), profile.freq)} → ${fmtTime(info[0].end.slice(0, profile.freq === "hour" ? 16 : 10), profile.freq)}` : "";
  return (
    <motion.div variants={fadeUp}>
      <Glass>
        <SectionTitle icon="📈" title="The history" help="Every point is one time step. Forecasting means continuing this line into the future — so look for a trend (does it climb?), a rhythm (does it repeat?) and surprises (spikes, jumps)."
          sub={<>{range}{more > 0 ? ` · showing the first ${tl.length} of ${profile.n_series} series` : ""}</>}
          right={tl.length > 1 ? (
            <Segmented size="sm" value={pick} onChange={setPick}
              options={[{ value: "__all", label: "All" }, ...tl.map((s) => ({ value: s.series, label: s.series }))]} />
          ) : undefined} />
        <TimeChart key={pick} lines={lines} isDate={isDate} height={240} valueName={valueName}
          timeLabel={(x) => (isDate ? fmtMs(x, profile.freq) : `step ${Math.round(x)}`)} />
        {info.length > 0 && (
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            {info.slice(0, 6).map((s, i) => (
              <span key={s.name} className="badge" style={{ gap: 6, height: 24 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: i < 4 ? seriesColor(i) : "var(--text-3)" }} />
                {s.name === "all" ? valueName : s.name}
                <span className="faint num">avg {fmtVal(s.mean)} · {fmtVal(s.min)}–{fmtVal(s.max)}</span>
              </span>
            ))}
          </div>
        )}
      </Glass>
    </motion.div>
  );
}

/** "Your weekly rhythm": the average level at each point of the season. */
export function SeasonCard({ profile }: { profile: DatasetProfile }) {
  const sp = profile.seasonal_profile;
  if (!sp || !sp.values.length) return null;
  const hi = sp.labels[sp.values.indexOf(Math.max(...sp.values))];
  const lo = sp.labels[sp.values.indexOf(Math.min(...sp.values))];
  const spread = Math.max(...sp.values) - Math.min(...sp.values);
  const strength = spread > 1.5 ? "a strong" : spread > 0.6 ? "a clear" : "a gentle";
  return (
    <motion.div variants={fadeUp} style={{ height: "100%" }}>
      <Glass style={{ height: "100%" }}>
        <SectionTitle icon="🔁" title={`Your ${sp.name}ly rhythm`}
          help={`The average value at each position of the ${sp.name} (scaled so 0 = the overall average). Tall bars are busy times, low bars quiet ones. Models that know the calendar — or look back exactly one ${sp.name} — can learn this pattern.`}
          sub={<>{strength[0].toUpperCase() + strength.slice(1)} rhythm: busiest on <b style={{ color: "var(--success)" }}>{hi}</b>, quietest on <b style={{ color: "var(--warning)" }}>{lo}</b>.</>} />
        <SeasonBars labels={sp.labels} values={sp.values} />
      </Glass>
    </motion.div>
  );
}

/** Autocorrelation: "how much does today look like k days ago?" */
export function AcfCard({ profile }: { profile: DatasetProfile }) {
  const acf = profile.acf ?? [];
  const [hov, setHov] = useState<number | null>(null);
  const season = profile.season ?? 1;
  const unit = profile.unit ?? "step";
  const best = useMemo(() => [...acf].filter((a) => a.lag > 1).sort((a, b) => b.r - a.r)[0], [acf]);
  if (!acf.length) return null;
  const seasonR = acf.find((a) => a.lag === season)?.r;
  const shown = hov !== null ? acf.find((a) => a.lag === hov) : null;
  const now = unit === "day" ? "today" : unit === "hour" ? "this hour" : `this ${unit}`;
  return (
    <motion.div variants={fadeUp} style={{ height: "100%" }}>
      <Glass style={{ height: "100%" }}>
        <SectionTitle icon="🪞" title="Echoes from the past"
          help={`Autocorrelation: for each lag k, how strongly the value now moves together with the value k ${unit}s earlier (1 = perfectly in step, 0 = unrelated, −1 = opposite). Tall bars are good “lag” features. Orange bars are whole ${profile.season_name ?? "season"}s back.`}
          sub={<>How much {now} looks like k {unit}s ago.</>} />
        <AcfBars acf={acf} season={season} onHover={setHov} />
        <div className="inset small" style={{ padding: "8px 12px", marginTop: 10, minHeight: 40, lineHeight: 1.5, color: "var(--text-2)" }}>
          {shown ? (
            <>Lag <b>{shown.lag}</b> ({lagWords(shown.lag, unit, season, profile.season_name)}): correlation <b className="num" style={{ color: shown.r > 0.3 ? "var(--success)" : undefined }}>{shown.r.toFixed(2)}</b> — {describeR(shown.r)}.</>
          ) : seasonR !== undefined && season > 1 ? (
            <>The value {lagWords(season, unit, season, profile.season_name)} has a correlation of <b className="num" style={{ color: seasonR > 0.3 ? "var(--success)" : undefined }}>{seasonR.toFixed(2)}</b> — {describeR(seasonR)}.{best && best.lag !== season ? <> Strongest echo after 1 step: lag <b>{best.lag}</b> ({best.r.toFixed(2)}).</> : null} <span className="faint">Hover a bar.</span></>
          ) : (
            <>Hover a bar to read it. Strongest echo after 1 step: {best ? <>lag <b>{best.lag}</b> ({best.r.toFixed(2)})</> : "none"}.</>
          )}
        </div>
      </Glass>
    </motion.div>
  );
}

function describeR(r: number) {
  if (r > 0.7) return "a very strong echo, a great clue";
  if (r > 0.4) return "a strong echo, a useful clue";
  if (r > 0.15) return "a weak echo";
  if (r > -0.15) return "practically unrelated";
  return "they tend to move in opposite directions";
}
