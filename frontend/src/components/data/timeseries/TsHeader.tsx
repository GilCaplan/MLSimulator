import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { DatasetProfile, DatasetSummary } from "../../../lib/types";
import { AnimatedNumber, Glass, InfoTip, Select } from "../../glass";
import { freqWord, TS_ROLES, tsRolesReady, type TsRoleId, type TsRoles } from "./tsData";

/** Series dataset card: name, the headline facts about the timeline, and which column plays which part. */
export function TsHeader({ dataset, profile, roles, pickerOpen, onTogglePicker, onRole, highlight }: {
  dataset: DatasetSummary;
  /** the profile for these roles (null while loading) */
  profile: DatasetProfile | null;
  roles: TsRoles;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onRole: (role: TsRoleId, col: string | null) => void;
  highlight: boolean;
}) {
  const uploaded = dataset.source === "upload";
  const ready = tsRolesReady(roles);
  const ok = !!profile && !profile.error && !!profile.freq;
  const nSteps = ok ? (profile.series ?? []).reduce((a, s) => a + s.n, 0) : undefined;
  const valueCol = dataset.columns.find((c) => c.name === roles.value);
  const valueNotNumeric = !!valueCol && valueCol.role !== "numeric";
  const options = (role: TsRoleId) => {
    const r = TS_ROLES.find((x) => x.id === role)!;
    const cols = dataset.columns.filter((c) => role !== "value" || c.role === "numeric" || c.name === roles.value);
    return [
      ...(r.optional ? [{ value: "", label: "— none (one series) —" }] : roles[role] ? [] : [{ value: "", label: "Choose…" }]),
      ...cols.map((c) => ({ value: c.name, label: role === "series" && c.unique > 30 ? `${c.name} (${c.unique} values)` : c.name })),
    ];
  };
  return (
    <Glass animate_in variant="strong">
      <div className="row between wrap" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14, minWidth: 0 }}>
          <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg, #64D2FF, #0A84FF 55%, #5E5CE6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, boxShadow: "0 8px 22px rgba(10,132,255,.28)" }}>
            {uploaded ? "📁" : "⏱️"}
          </motion.div>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <h2 className="truncate" style={{ fontSize: 21 }}>{dataset.name}</h2>
              <span className={`badge ${uploaded ? "" : "success"}`}>{uploaded ? "Uploaded" : "Built-in series"}</span>
            </div>
            <span className="small muted">Values over time — the past the models learn from.</span>
          </div>
        </div>
        <button className={`btn ${pickerOpen ? "primary" : ""}`} onClick={onTogglePicker}>{pickerOpen ? "✕ Close" : "🔄 Change data"}</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 10, marginTop: 16 }}>
        <Tile icon="🗓️" label="Rhythm of the data" help="How far apart the time steps are. It decides the natural season: hours repeat every day, days every week, months every year.">
          {ok ? freqWord(profile.freq) : "—"}
        </Tile>
        <Tile icon="🔁" label="Season length" help="How many steps until the pattern repeats — 7 for daily data (a week), 24 for hourly data (a day), 12 for monthly data (a year). Seasonal models and lags lean on it.">
          {ok ? (profile.season ?? 1) > 1 ? <>{profile.season} <span className="small muted" style={{ fontWeight: 500 }}>{profile.unit}s = 1 {profile.season_name}</span></> : "none" : "—"}
        </Tile>
        <Tile icon="🏪" label="Series">{ok ? <AnimatedNumber value={profile.n_series ?? 1} format={(v) => String(Math.round(v))} /> : "—"}</Tile>
        <Tile icon="👣" label="Time steps" help="Total number of time steps across all series, after sorting by time.">
          {nSteps !== undefined ? <AnimatedNumber value={nSteps} format={(v) => Math.round(v).toLocaleString()} /> : "—"}
        </Tile>
        <Tile icon="🩹" label="Gaps filled" help="Missing steps in the middle of a series (e.g. a day with no row). They're filled by drawing a straight line between the neighbours, because models expect evenly spaced steps.">
          {ok ? <span style={{ color: (profile.filled ?? 0) > 0 ? "var(--warning)" : undefined }}><AnimatedNumber value={profile.filled ?? 0} format={(v) => Math.round(v).toLocaleString()} /></span> : "—"}
        </Tile>
      </div>

      <div className="divider" style={{ margin: "16px 0" }} />

      <div className="row wrap" style={{ gap: 16, alignItems: "flex-end" }}>
        {TS_ROLES.map((r, k) => (
          <Picker key={r.id} icon={r.icon} label={r.label} help={r.help} highlight={highlight} delay={k * 0.08}>
            <Select value={roles[r.id] ?? ""} onChange={(v) => onRole(r.id, v || null)} style={{ minWidth: 150 }} options={options(r.id)} />
          </Picker>
        ))}
        <div className="grow" />
        {ready && ok && (
          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="small" style={{ paddingBottom: 6, color: "var(--text-2)" }}>
            Forecasting <b>{roles.value}</b> {roles.series ? <>for each <b>{roles.series}</b></> : null} · {profile.n_series ?? 1} series
          </motion.span>
        )}
      </div>
      {!ready && <p className="small" style={{ color: "var(--warning)", marginTop: 12 }}>⚠️ Choose a time column and a value column (two different columns).</p>}
      {valueNotNumeric && <p className="small" style={{ color: "var(--warning)", marginTop: 12 }}>⚠️ ‘{roles.value}’ doesn't look like numbers — the value to forecast must be a number.</p>}
      <AnimatePresence>
        {ready && profile?.error && (
          <motion.div key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="row small" style={{ gap: 10, alignItems: "flex-start", marginTop: 14, padding: "10px 14px", borderRadius: 12, background: "rgba(255,159,10,.13)", lineHeight: 1.5 }}>
              <span style={{ fontSize: 18 }}>🧐</span>
              <span className="col" style={{ gap: 2 }}>
                <b>These columns can't be forecast yet</b>
                <span style={{ color: "var(--text-2)" }}>{profile.error} {hintFor(profile.error)}</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {(dataset.warnings ?? []).length > 0 && (
        <div className="col small" style={{ gap: 4, marginTop: 12 }}>
          {dataset.warnings!.map((w) => <span key={w} style={{ color: "var(--warning)" }}>⚠️ {w}</span>)}
        </div>
      )}
    </Glass>
  );
}

function hintFor(err: string): string {
  if (/dates or step numbers/i.test(err)) return "Pick the column that holds dates (like 2024-03-01) or step numbers.";
  if (/30 time steps/i.test(err)) return "Try “none” for the series column, or upload a longer history.";
  if (/30 series/i.test(err)) return "Pick a series column with fewer distinct values — or none.";
  if (/too short/i.test(err)) return "You can shorten the horizon or the lags in Prepare.";
  return "";
}

function Tile({ icon, label, help, children }: { icon: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="inset col" style={{ padding: "10px 12px", gap: 2, minWidth: 0 }}>
      <span className="tiny muted row" style={{ gap: 4 }}>{icon} {label} {help && <InfoTip text={help} />}</span>
      <b className="num truncate" style={{ fontSize: 18 }}>{children}</b>
    </div>
  );
}

function Picker({ icon, label, help, highlight, delay, children }: { icon: string; label: string; help: string; highlight: boolean; delay: number; children: ReactNode }) {
  return (
    <motion.div className="col" style={{ gap: 6, padding: 8, margin: -8, borderRadius: 14 }}
      animate={highlight ? { boxShadow: ["0 0 0 0px var(--accent-soft)", "0 0 0 6px var(--accent-soft)", "0 0 0 0px var(--accent-soft)"] } : { boxShadow: "0 0 0 0px rgba(0,0,0,0)" }}
      transition={highlight ? { duration: 1.4, repeat: 2, delay } : { duration: 0.2 }}>
      <span className="row small" style={{ gap: 6, fontWeight: 650 }}>{icon} {label} <InfoTip text={help} /></span>
      {children}
    </motion.div>
  );
}
