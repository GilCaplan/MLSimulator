import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { toast, useProject } from "../../../lib/store";
import type { Suggestion } from "../../../lib/types";
import { profileFits, ratingsSpec, rolesOf, rolesReady } from "../../data/ratings/ratingsData";
import { EmptyState, Glass, Spinner } from "../../glass";
import { CoachPanel, NextBar, StepLayout, useStepLabel } from "../../shell/Wizard";
import { FlowStripView, type FlowItem } from "../FlowStrip";
import { ResultsSkeleton } from "../Results";
import { FiltersCard } from "./FiltersCard";
import { HeldOutCard } from "./HeldOutCard";
import { LikedCard } from "./LikedCard";
import { RATINGS_STAGES, ratingsStageState, recsysOf, type RatingsStageId, type RecsysSpec } from "./ratingsPrepState";
import { RatingsResults } from "./RatingsResults";

const DEFAULT_OPEN: Record<RatingsStageId, boolean> = { filters: true, liked: true, heldout: true };

const INTRO = (
  <>Ratings need less cleaning than a table, but three choices shape what the recommenders learn — and how fairly they're scored:
    <br /><br />🧹 <b>Filters</b> — leave out people and items with too little history.
    <br /><br />💚 <b>Liked =</b> — which ratings count as a thumbs-up. Models are scored on whether their top 10 contains things the person really liked.
    <br /><br />⏳ <b>Held-out</b> — hide each person's most recent ratings as the final exam: <b>train on the past, test on the future</b>.
    <br /><br />The defaults are sensible — press <b>Run preparation</b> and look at the results.</>
);

/** The Prepare step for recommendation projects: filters → liked threshold → held-out ratings. */
export function RatingsPrepareStep() {
  const project = useProject((s) => s.project);
  const dataset = useProject((s) => s.dataset);
  const report = useProject((s) => s.report);
  const profile = useProject((s) => s.profile);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [flash, setFlash] = useState<RatingsStageId | null>(null);
  const [lastRun, setLastRun] = useState<RecsysSpec | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);
  const trainLabel = useStepLabel("train");
  const datasetId = project?.dataset_id ?? null;
  const dsReady = !!dataset && dataset.id === datasetId;
  const roles = project ? rolesOf(project, dsReady ? dataset : null) : null;
  const ready = !!roles && rolesReady(roles);

  useEffect(() => {
    if (!datasetId || dataset?.id === datasetId) return;
    let alive = true;
    api.dataset(datasetId)
      .then((d) => { if (alive && useProject.getState().project?.dataset_id === datasetId) useProject.getState().setDataset(d); })
      .catch((e) => toast.error(e));
    return () => { alive = false; };
  }, [datasetId, dataset?.id]);

  // The filter estimates read the ratings profile — fetch it if we arrived here without one.
  const haveProfile = !!roles && profileFits(profile, roles);
  useEffect(() => {
    if (!datasetId || !ready || !roles || haveProfile) return;
    let alive = true;
    api.profile(datasetId, null, null, { modality: "ratings", user_col: roles.user, item_col: roles.item, rating_col: roles.rating })
      .then((p) => { if (alive) useProject.getState().setProfile(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [datasetId, ready, haveProfile, roles?.user, roles?.item, roles?.rating]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (manual: boolean) => {
    const p = useProject.getState().project;
    const spec = p && ratingsSpec(p);
    if (!p?.dataset_id || !spec) return;
    setRunning(true);
    try {
      const rep = await api.prepare(p.dataset_id, spec, p.models.map((m) => m.model_id));
      const st = useProject.getState();
      if (st.project?.id !== p.id) return;
      st.setReport(rep);
      setLastRun(recsysOf(spec));
      const now = ratingsSpec(st.project);
      if (JSON.stringify(now) === JSON.stringify(spec) && st.project.dataset_id === p.dataset_id) st.update({ prepared_id: rep.prepared_id });
      if (manual) {
        toast.success(`Ready: ${(rep.n_users ?? 0).toLocaleString()} people × ${(rep.n_items ?? 0).toLocaleString()} items · ${rep.splits.train.toLocaleString()} training ratings`);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    } catch (e) {
      toast.error(e);
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
  const spec = ratingsSpec(project);
  if (!spec || !project.dataset_id || !ready) {
    return (
      <StepLayout title="Prepare your ratings" subtitle="Filter, define “liked”, and hide a few ratings per person for the final exam.">
        <Glass>
          <EmptyState icon="🎬" title={project.dataset_id ? "Point out the rating columns first" : "Pick some ratings first"}
            text="Choose a ratings set or upload a list of ratings and say which column is who, what and the rating — then come back here."
            action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/data`)}>Go to Ratings →</button>} />
        </Glass>
      </StepLayout>
    );
  }

  const pick = (id: RatingsStageId) => {
    setOpen((o) => ({ ...o, [id]: true }));
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
    setTimeout(() => document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const toggle = (id: RatingsStageId) => () => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const r = recsysOf(spec);
  const ratingsReport = report && report.modality === "ratings" ? report : null;
  const stale = !!ratingsReport && project.prepared_id !== ratingsReport.prepared_id;
  const fresh = !!ratingsReport && !stale;
  const items: FlowItem[] = RATINGS_STAGES.map((s) => ({ ...s, ...ratingsStageState(s.id, spec) }));
  const fittingProfile = haveProfile ? profile : null;
  const hist = ratingsReport?.rating_hist ?? fittingProfile?.rating_hist ?? null;

  const suggestions: Suggestion[] = [];
  if (fresh && ratingsReport) {
    const total = ratingsReport.splits.train + ratingsReport.splits.test;
    if (ratingsReport.removed > total * 0.4) suggestions.push({ id: "strict", severity: "warn", title: "The filters remove a lot", why: `${ratingsReport.removed.toLocaleString()} ratings were dropped. Lower the minimums so the models see more of the long tail.`, action: { kind: "pipeline", label: "Relax the filters", patch: { recsys: { ...r, min_user: Math.max(1, Math.floor(r.min_user / 2)), min_item: Math.max(1, Math.floor(r.min_item / 2)) } } } });
    if (!roles?.time && r.split === "leave_last_out") suggestions.push({ id: "time", severity: "info", title: "No time column", why: "Without a “when” column the held-out ratings are picked at random, so the test is a little easier than real life. Pick a time column on the Ratings step if your data has one." });
    if (ratingsReport.splits.test < 100) suggestions.push({ id: "fewtest", severity: "info", title: "Only a few test ratings", why: "Scores will jump around between runs. Hide a couple more ratings per person, or use more people.", action: { kind: "pipeline", label: "Hide 5 per person", patch: { recsys: { ...r, test_k: Math.max(5, r.test_k) } } } });
  }

  const status = running
    ? "Preparing your ratings…"
    : fresh
      ? `Ready: ${(ratingsReport!.n_users ?? 0).toLocaleString()} people × ${(ratingsReport!.n_items ?? 0).toLocaleString()} items · ${ratingsReport!.splits.train.toLocaleString()} training ratings`
      : stale
        ? "Settings changed — run again"
        : project.prepared_id
          ? "Prepared — ready to train"
          : "Run the preparation to continue";

  return (
    <StepLayout
      title="Prepare your ratings"
      subtitle="Decide who has enough history, what counts as a thumbs-up, and which ratings to hide for the final exam."
      coach={<CoachPanel intro={INTRO} suggestions={suggestions} />}
      footer={<NextBar status={status} back="data" next="train" nextLabel={trainLabel} nextDisabled={!project.prepared_id || running} />}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} style={{ position: "sticky", top: 4, zIndex: 6 }}>
        <FlowStripView items={items} running={running} onPick={(id) => pick(id as RatingsStageId)}
          header={<RunHeader running={running} stale={stale} fresh={fresh} hasReport={!!ratingsReport} onRun={() => run(true)} />} />
      </motion.div>

      <AnimatePresence>
        {project.prepared_id && !ratingsReport && !running && (
          <motion.div key="reload" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle}>
            <Glass variant="thin" className="row between wrap" style={{ gap: 12, padding: "12px 16px" }}>
              <span className="row small" style={{ gap: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span>Your ratings are prepared and you can continue. <span className="muted">Run again to see the visuals.</span></span>
              </span>
              <button className="btn sm" onClick={() => run(true)}>Show visuals</button>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <FiltersCard spec={spec} profile={fittingProfile} report={ratingsReport} lastRun={lastRun} nRows={dataset?.n_rows ?? 0}
        open={open.filters} onToggle={toggle("filters")} flash={flash === "filters"} />
      <LikedCard spec={spec} hist={hist} open={open.liked} onToggle={toggle("liked")} flash={flash === "liked"} />
      <HeldOutCard spec={spec} hasTime={!!roles?.time} open={open.heldout} onToggle={toggle("heldout")} flash={flash === "heldout"} />

      <div ref={resultsRef} className="col" style={{ gap: 14, scrollMarginTop: 150, marginTop: 8 }}>
        {(ratingsReport || running) && (
          <div className="row between wrap" style={{ gap: 10, padding: "0 4px" }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="eyebrow">Results</span>
              <h2 style={{ fontSize: 22 }}>What the recommenders will learn from</h2>
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
        {ratingsReport ? (
          <div style={{ position: "relative" }}>
            <div style={{ opacity: stale || running ? 0.55 : 1, filter: stale || running ? "saturate(0.6)" : "none", transition: "opacity .35s, filter .35s" }}>
              <RatingsResults key={ratingsReport.prepared_id} report={ratingsReport} />
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
        <span className="eyebrow">Your ratings recipe</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={running ? "run" : stale ? "stale" : fresh ? "fresh" : "idle"}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
            className="small row" style={{ gap: 6, color: stale ? "var(--warning)" : "var(--text-2)" }}>
            {running ? <><Spinner size={12} color="var(--accent)" /> Ratings are flowing through the pipeline…</>
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

