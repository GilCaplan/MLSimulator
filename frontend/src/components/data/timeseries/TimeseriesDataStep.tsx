import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { stagger } from "../../../design/motion";
import { api } from "../../../lib/api";
import { toast, useProject } from "../../../lib/store";
import type { DatasetSummary, PipelineSpec, TimeseriesSetInfo } from "../../../lib/types";
import { Glass, Segmented, Spinner } from "../../glass";
import { CoachPanel, NextBar, StepLayout } from "../../shell/Wizard";
import { ColumnsTable } from "../ColumnsTable";
import { RowsTable } from "../RowsTable";
import { panelSwap } from "../shared";
import { Disclosure } from "../ui";
import { adoptTsDataset, setTsRole, tsColumns, tsProfileFits, tsProfileQuery, tsRolesOf, tsRolesReady, type ForecastSpec, type TsRoleId } from "./tsData";
import { TsHeader } from "./TsHeader";
import { AcfCard, SeasonCard, TimelineCard } from "./TsInsights";
import { TsSetsPanel } from "./TsSetsPanel";
import { TsUploadPanel } from "./TsUploadPanel";

type Source = "sets" | "upload";

const INTRO = (
  <>
    A forecast continues a line into the future. To do that, a model studies the <b>past</b>: one value per time step — sales per day, demand per hour, passengers per month.
    <br /><br />Look for three things below: a <b>trend</b> (does it climb?), a <b>rhythm</b> that repeats every week, day or year, and <b>surprises</b> like spikes or jumps.
    <br /><br />The <b>echoes</b> chart shows how much today resembles the past: a tall bar at 7 days means “next Monday looks like last Monday” — the most useful clue a forecaster can get.
  </>
);

/** The Series step for forecasting projects: pick or upload a history, say which column is time / value / series, then explore. */
export function TimeseriesDataStep() {
  const project = useProject((s) => s.project)!;
  const dataset = useProject((s) => s.dataset);
  const profile = useProject((s) => s.profile);

  const [mode, setMode] = useState<Source>("sets");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const profileSeq = useRef(0);

  // The project remembers a dataset but the cache is empty (e.g. after a reload): fetch it.
  useEffect(() => {
    const id = project.dataset_id;
    setMissing(false);
    if (!id || (dataset && dataset.id === id)) return;
    let live = true;
    api.dataset(id)
      .then((d) => { if (live && useProject.getState().project?.dataset_id === id) useProject.getState().setDataset(d); })
      .catch((e) => { if (live) { setMissing(true); toast.error(`Couldn't load the saved data: ${e instanceof Error ? e.message : e}`); } });
    return () => { live = false; };
  }, [project.dataset_id, dataset?.id]);

  const dsReady = !!dataset && dataset.id === project.dataset_id;
  const roles = tsRolesOf(project, dsReady ? dataset : null, profile);
  const ready = dsReady && tsRolesReady(roles);
  const hasSaved = !!project.pipeline?.columns?.time && !!project.pipeline?.columns?.value;
  const fresh = dsReady && tsProfileFits(profile, roles) ? profile : null;

  // Fetch the profile for the chosen roles (or, with nothing chosen yet, let the backend guess them).
  useEffect(() => {
    if (!dsReady || !dataset) return;
    if (fresh) return;
    const my = ++profileSeq.current;
    setProfileLoading(true);
    api.profile(dataset.id, null, null, hasSaved && ready ? tsProfileQuery(roles) : { modality: "timeseries" })
      .then((p) => { if (my === profileSeq.current) useProject.getState().setProfile(p); })
      .catch((e) => { if (my === profileSeq.current) toast.error(e); })
      .finally(() => { if (my === profileSeq.current) setProfileLoading(false); });
  }, [dsReady, dataset?.id, hasSaved, ready, roles.time, roles.value, roles.series, !!fresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember the guessed roles once (uploads), plus a horizon / extra columns suited to the data.
  useEffect(() => {
    if (!dsReady || !fresh || !ready) return;
    const p = useProject.getState().project;
    if (!p) return;
    const cur = (p.pipeline ?? {}) as Partial<PipelineSpec>;
    const patch: Partial<PipelineSpec> = {};
    if (!hasSaved) Object.assign(patch, { modality: "timeseries", columns: tsColumns(roles) });
    if (!cur.forecast) patch.forecast = { horizon: fresh.horizon_default ?? 14, exog: fresh.exog ?? [], lags: null, windows: null } as ForecastSpec;
    if (Object.keys(patch).length) useProject.getState().update({ pipeline: { ...cur, ...patch } });
  }, [dsReady, fresh, ready, hasSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLoaded = useCallback((d: DatasetSummary, info?: TimeseriesSetInfo, uploaded = false) => {
    adoptTsDataset(d, info ? { columns: info.columns, horizon: info.horizon, exog: info.exog } : undefined);
    setPickerOpen(false);
    setMissing(false);
    if (uploaded) { setHighlight(true); setTimeout(() => setHighlight(false), 4500); }
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const onRole = (role: TsRoleId, col: string | null) => {
    if (col === roles[role]) return;
    setTsRole(roles, role, col);
  };

  const hasDataset = !!project.dataset_id && !missing;
  const showPicker = !hasDataset || pickerOpen;
  const valid = ready && !!fresh && !fresh.error && !!fresh.freq;
  const nSteps = fresh?.series?.reduce((a, s) => a + s.n, 0) ?? 0;
  const status = !dsReady
    ? "Choose or upload a history to continue"
    : !ready
      ? "Point out the time and the value columns"
      : !fresh
        ? "Reading the timeline…"
        : fresh.error
          ? <span style={{ color: "var(--warning)" }}>These columns can't be forecast yet — see the note above</span>
          : <>Forecasting <b>‘{roles.value}’</b> · {fresh.n_series ?? 1} series · {nSteps.toLocaleString()} {fresh.unit ?? "step"}s</>;

  return (
    <StepLayout
      title={<>Bring your <span className="gradient-text">history</span></>}
      subtitle="Forecasters learn from the past. Load a built-in series or upload your own values over time."
      coach={<CoachPanel intro={INTRO} suggestions={valid ? fresh!.coach : []} />}
      footer={<NextBar status={status} back="models" next="prepare" nextDisabled={!valid} />}
    >
      <div ref={topRef} style={{ scrollMarginTop: 16 }} />

      {hasDataset && dsReady && (
        <TsHeader dataset={dataset!} profile={fresh} roles={roles} pickerOpen={pickerOpen}
          onTogglePicker={() => setPickerOpen((o) => !o)} onRole={onRole} highlight={highlight} />
      )}
      {hasDataset && !dsReady && (
        <Glass animate_in>
          <div className="row" style={{ gap: 14 }}>
            <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 16 }} />
            <div className="col grow" style={{ gap: 8 }}>
              <div className="skeleton" style={{ height: 18, width: "40%" }} />
              <div className="skeleton" style={{ height: 14, width: "25%" }} />
            </div>
          </div>
        </Glass>
      )}

      <AnimatePresence initial={false}>
        {showPicker && (
          <motion.div key="picker" initial={{ opacity: 0, y: -10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.985, transition: { duration: 0.18 } }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="col" style={{ gap: 14 }}>
            {hasDataset && (
              <div className="row between" style={{ padding: "4px 4px 0" }}>
                <span className="eyebrow">Use a different history</span>
                <button className="btn ghost sm" onClick={() => setPickerOpen(false)}>Keep current data</button>
              </div>
            )}
            {missing && <p className="small" style={{ color: "var(--warning)" }}>The data this project used is gone — pick or upload a new history.</p>}
            <div className="row center">
              <Segmented<Source> value={mode} onChange={setMode}
                options={[{ value: "sets", label: "⏱️ Built-in series" }, { value: "upload", label: "📁 Upload" }]} />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} {...panelSwap}>
                {mode === "sets" ? <TsSetsPanel onLoaded={(d, info) => onLoaded(d, info)} /> : <TsUploadPanel onLoaded={(d) => onLoaded(d, undefined, true)} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {dsReady && dataset && (
        <motion.div key={dataset.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }} className="col" style={{ gap: 16 }}>
          {valid ? (
            <motion.div key={`${roles.time}|${roles.value}|${roles.series}`} variants={stagger(0.07)} initial="hidden" animate="show"
              className="col" style={{ gap: 16, opacity: profileLoading ? 0.6 : 1, transition: "opacity .3s" }}>
              <TimelineCard profile={fresh!} valueName={roles.value!} />
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "stretch" }}>
                <SeasonCard profile={fresh!} />
                <AcfCard profile={fresh!} />
              </div>
            </motion.div>
          ) : (ready && !fresh) || profileLoading ? (
            <Glass animate_in>
              <div className="row" style={{ gap: 10, marginBottom: 12 }}><Spinner size={16} color="var(--accent)" /><span className="small muted">Lining up the timeline…</span></div>
              <div className="skeleton" style={{ height: 220 }} />
            </Glass>
          ) : null}
          <div style={{ padding: "0 4px" }}>
            <Disclosure title={<span className="row" style={{ gap: 8 }}>📋 <b>The raw table</b> <span className="muted small">{dataset.n_cols} columns · {dataset.n_rows.toLocaleString()} rows</span></span>}>
              <div className="col" style={{ gap: 16 }}>
                <ColumnsTable dataset={dataset} target={roles.value} mark="📈" />
                <RowsTable key={dataset.id} datasetId={dataset.id} target={roles.value} mark="📈" />
              </div>
            </Disclosure>
          </div>
        </motion.div>
      )}
    </StepLayout>
  );
}
