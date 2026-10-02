import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { fullPipeline, toast, useProject } from "../../../lib/store";
import type { Suggestion } from "../../../lib/types";
import { tsProfileFits, tsProfileQuery, tsRolesOf, tsRolesReady } from "../../data/timeseries/tsData";
import { EmptyState, Glass, Spinner } from "../../glass";
import { CoachPanel, NextBar, StepLayout, useStepLabel } from "../../shell/Wizard";
import { FlowStripView, type FlowItem } from "../FlowStrip";
import { ResultsSkeleton } from "../Results";
import { HorizonCard } from "./HorizonCard";
import { TsCluesCard } from "./TsCluesCard";
import { TsResults } from "./TsResults";
import { TsSplitCard } from "./TsSplitCard";
import { fcOf, limitsOf, patchForecast, splitOf, TS_STAGES, tsStageState, type TsStageId } from "./tsPrepState";

const DEFAULT_OPEN: Record<TsStageId, boolean> = { horizon: true, split: true, features: true };

const INTRO = (
  <>Forecasting needs three decisions before training:
    <br /><br />🔭 <b>Horizon</b> — how far ahead to predict. Further is more useful, and harder.
    <br /><br />✂️ <b>Split</b> — hide the most recent stretch as the exam. Train on the past, forecast the future — never the other way round.
    <br /><br />🧩 <b>Clues</b> — what the regression models get to see: the value yesterday, the same day last week, the calendar…
    <br /><br />The defaults are sensible — press <b>Run preparation</b> and look at the timeline.</>
);

/** The Prepare step for forecasting projects: horizon → split → clues, then a look at the split timeline and the clue table. */
export function TimeseriesPrepareStep() {
  const project = useProject((s) => s.project);
  const dataset = useProject((s) => s.dataset);
  const report = useProject((s) => s.report);
  const profile = useProject((s) => s.profile);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [flash, setFlash] = useState<TsStageId | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);
  const trainLabel = useStepLabel("train");
  const datasetId = project?.dataset_id ?? null;
  const dsReady = !!dataset && dataset.id === datasetId;
  const roles = project ? tsRolesOf(project, dsReady ? dataset : null, profile) : null;
  const ready = !!roles && tsRolesReady(roles) && !!project?.pipeline?.columns?.time;

  useEffect(() => {
    if (!datasetId || dataset?.id === datasetId) return;
    let alive = true;
    api.dataset(datasetId)
      .then((d) => { if (alive && useProject.getState().project?.dataset_id === datasetId) useProject.getState().setDataset(d); })
      .catch((e) => toast.error(e));
    return () => { alive = false; };
  }, [datasetId, dataset?.id]);

  // Limits (series length, season) and the extra-column list come from the profile — fetch it if we arrived without one.
  const haveProfile = !!roles && tsProfileFits(profile, roles);
  useEffect(() => {
    if (!datasetId || !ready || !roles || haveProfile) return;
    let alive = true;
    api.profile(datasetId, null, null, tsProfileQuery(roles))
      .then((p) => { if (alive) useProject.getState().setProfile(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [datasetId, ready, haveProfile, roles?.time, roles?.value, roles?.series]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (manual: boolean) => {
    const p = useProject.getState().project;
    const spec = p && fullPipeline(p);
    if (!p?.dataset_id || !spec) return;
    setRunning(true);
    try {
      const rep = await api.prepare(p.dataset_id, spec, p.models.map((m) => m.model_id));
      const st = useProject.getState();
      if (st.project?.id !== p.id) return;
      setError(null);
      st.setReport(rep);
      const now = fullPipeline(st.project);
      if (JSON.stringify(now) === JSON.stringify(spec) && st.project.dataset_id === p.dataset_id) st.update({ prepared_id: rep.prepared_id });
      if (manual) {
        toast.success(`Ready: ${rep.splits.train.toLocaleString()} training rows · ${rep.n_features} clues · forecasting ${rep.horizon} ${rep.unit}s ahead`);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    } catch (e) {
      // a 400 from the backend explains what's wrong (e.g. series too short): show it as a card, not just a toast
      setError(e instanceof Error ? e.message : String(e));
      useProject.getState().setReport(null);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } finally {
      setRunning(false);
    }
  }, []);

  // Auto-run once on the first visit, when nothing has been prepared yet.
  useEffect(() => {
    if (autoRan.current || !project?.dataset_id || !ready || !project.task) return;
    if (report || project.prepared_id) return;
    autoRan.current = true;
    run(false);
  }, [project?.dataset_id, ready, project?.task, project?.prepared_id, report, run]);

  if (!project) return null;
  const spec = fullPipeline(project);
  if (!spec || !project.dataset_id || !ready || !roles) {
    return (
      <StepLayout title="Prepare your series" subtitle="Choose the horizon, hide the future, and pick the clues.">
        <Glass>
          <EmptyState icon="⏱️" title={project.dataset_id ? "Point out the time and value columns first" : "Pick a history first"}
            text="Choose a built-in series or upload values over time, and say which column is the time and which the value — then come back here."
            action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/data`)}>Go to Series →</button>} />
        </Glass>
      </StepLayout>
    );
  }

  const pick = (id: TsStageId) => {
    setOpen((o) => ({ ...o, [id]: true }));
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
    setTimeout(() => document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const toggle = (id: TsStageId) => () => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const fittingProfile = haveProfile ? profile : null;
  const lim = limitsOf(fittingProfile);
  const fc = fcOf(spec);
  const tsReport = report && report.modality === "timeseries" ? report : null;
  const stale = !!tsReport && project.prepared_id !== tsReport.prepared_id;
  const fresh = !!tsReport && !stale;
  const items: FlowItem[] = TS_STAGES.map((s) => ({ ...s, ...tsStageState(s.id, spec, lim) }));

  const suggestions: Suggestion[] = [];
  if (splitOf(spec) === "random") suggestions.push({ id: "random", severity: "high", title: "This split peeks at the future", why: "Random test steps sit between training steps and are scored one step ahead with the true recent values. Real forecasts never get that.", action: { kind: "pipeline", label: "Use the honest time split", patch: { split: { ...spec.split, method: "time" } } } });
  if (fittingProfile?.coach.some((c) => c.id === "ts_log") && !fc.log) suggestions.push({ id: "log", severity: "info", title: "Try the log transform", why: "The values span a wide range — when the swings grow with the level, a log scale makes the pattern steadier.", action: { kind: "pipeline", label: "Turn on log", patch: { forecast: { ...fc, log: true } } } });
  if (lim.season > 1 && fc.lags !== null && !fc.lags.some((k) => k % lim.season === 0)) suggestions.push({ id: "seasonlag", severity: "warn", title: `No lag at the season length`, why: `A lag of ${lim.season} (the same point last ${lim.seasonName ?? "season"}) is usually the single most useful clue.`, action: { kind: "pipeline", label: `Add lag ${lim.season}`, patch: { forecast: { ...fc, lags: [...fc.lags, lim.season].sort((a, b) => a - b) } } } });

  const status = running
    ? "Preparing your series…"
    : error
      ? <span style={{ color: "var(--warning)" }}>Preparation failed — see the note below</span>
      : fresh
        ? `Ready: ${tsReport!.splits.train.toLocaleString()} training rows · ${tsReport!.n_features} clues · ${tsReport!.horizon} ${tsReport!.unit}s ahead`
        : stale
          ? "Settings changed — run again"
          : project.prepared_id
            ? "Prepared — ready to train"
            : "Run the preparation to continue";

  return (
    <StepLayout
      title="Prepare your series"
      subtitle="Choose how far ahead to forecast, hide the most recent stretch as the exam, and pick the clues the models can use."
      coach={<CoachPanel intro={INTRO} suggestions={suggestions} />}
      footer={<NextBar status={status} back="data" next="train" nextLabel={trainLabel} nextDisabled={!project.prepared_id || running} />}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} style={{ position: "sticky", top: 4, zIndex: 6 }}>
        <FlowStripView items={items} running={running} onPick={(id) => pick(id as TsStageId)}
          header={<RunHeader running={running} stale={stale} fresh={fresh} hasReport={!!tsReport} onRun={() => run(true)} />} />
      </motion.div>

      <AnimatePresence>
        {project.prepared_id && !tsReport && !running && !error && (
          <motion.div key="reload" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle}>
            <Glass variant="thin" className="row between wrap" style={{ gap: 12, padding: "12px 16px" }}>
              <span className="row small" style={{ gap: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span>Your series are prepared and you can continue. <span className="muted">Run again to see the visuals.</span></span>
              </span>
              <button className="btn sm" onClick={() => run(true)}>Show visuals</button>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <HorizonCard spec={spec} profile={fittingProfile} lim={lim} open={open.horizon} onToggle={toggle("horizon")} flash={flash === "horizon"} />
      <TsSplitCard spec={spec} lim={lim} open={open.split} onToggle={toggle("split")} flash={flash === "split"} />
      <TsCluesCard spec={spec} profile={fittingProfile} roles={roles} lim={lim} open={open.features} onToggle={toggle("features")} flash={flash === "features"} />

      <div ref={resultsRef} className="col" style={{ gap: 14, scrollMarginTop: 150, marginTop: 8 }}>
        <AnimatePresence>
          {error && !running && (
            <motion.div key="err" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle}>
              <Glass>
                <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 30 }}>🧐</span>
                  <div className="col grow" style={{ gap: 6 }}>
                    <h3>The series couldn't be prepared</h3>
                    <span className="small" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>{error.replace("Series “all”", "The series")}</span>
                    <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                      {fc.horizon > 1 && <button className="btn sm" onClick={() => patchForecast(spec, { horizon: Math.max(1, Math.floor(Math.min(fc.horizon, lim.maxHorizon) / 2)) })}>🔭 Halve the horizon</button>}
                      {(fc.lags !== null || fc.windows !== null) && <button className="btn sm" onClick={() => patchForecast(spec, { lags: null, windows: null })}>🧩 Automatic lags & averages</button>}
                      <button className="btn sm ghost" onClick={() => navigate(`/p/${project.id}/data`)}>Check the columns →</button>
                      <button className="btn sm primary" onClick={() => run(true)}>Try again</button>
                    </div>
                  </div>
                </div>
              </Glass>
            </motion.div>
          )}
        </AnimatePresence>
        {(tsReport || running) && (
          <div className="row between wrap" style={{ gap: 10, padding: "0 4px" }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="eyebrow">Results</span>
              <h2 style={{ fontSize: 22 }}>What the forecasters will learn from</h2>
            </div>
            <AnimatePresence>
              {stale && !running && (
                <motion.button key="stale" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="btn sm" onClick={() => run(true)} style={{ color: "var(--warning)" }}>
                  ⟳ Settings changed — run again
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
        {tsReport ? (
          <div style={{ position: "relative" }}>
            <div style={{ opacity: stale || running ? 0.55 : 1, filter: stale || running ? "saturate(0.6)" : "none", transition: "opacity .35s, filter .35s" }}>
              <TsResults key={tsReport.prepared_id} report={tsReport} />
            </div>
            <AnimatePresence>
              {running && (
                <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 60, pointerEvents: "none" }}>
                  <div className="glass strong row" style={{ padding: "10px 18px", borderRadius: 999, gap: 10, position: "sticky", top: 200 }}>
                    <Spinner size={16} color="var(--accent)" /> <b className="small">Re-running the pipeline…</b>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : running ? <ResultsSkeleton /> : null}
      </div>
    </StepLayout>
  );
}

function RunHeader({ running, stale, fresh, hasReport, onRun }: { running: boolean; stale: boolean; fresh: boolean; hasReport: boolean; onRun: () => void }) {
  return (
    <div className="row between wrap" style={{ gap: 12 }}>
      <div className="col" style={{ gap: 1 }}>
        <span className="eyebrow">Your forecasting recipe</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={running ? "run" : stale ? "stale" : fresh ? "fresh" : "idle"}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
            className="small row" style={{ gap: 6, color: stale ? "var(--warning)" : "var(--text-2)" }}>
            {running ? <><Spinner size={12} color="var(--accent)" /> Building rows from the timeline…</>
              : stale ? <>⟳ Settings changed — run again to update the results</>
                : fresh ? <><span style={{ color: "var(--success)" }}>●</span> Up to date — click any stage to tweak it</>
                  : <>Click a stage to tweak it, then run</>}
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.button className="btn gradient" onClick={onRun} disabled={running}
        animate={stale && !running ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={stale && !running ? { repeat: Infinity, duration: 1.6 } : spring.snappy} style={{ minWidth: 168 }}>
        {running ? <><Spinner size={14} /> Preparing…</> : <>🧪 {hasReport ? "Run again" : "Run preparation"}</>}
      </motion.button>
    </div>
  );
}
