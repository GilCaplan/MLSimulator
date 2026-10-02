import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { toast, useProject } from "../../../lib/store";
import type { DatasetProfile, DatasetSummary, Suggestion } from "../../../lib/types";
import { Glass, Segmented, Spinner } from "../../glass";
import { CoachPanel, NextBar, StepLayout } from "../../shell/Wizard";
import { ColumnsTable } from "../ColumnsTable";
import { RowsTable } from "../RowsTable";
import { panelSwap } from "../shared";
import { Disclosure } from "../ui";
import { adoptRatingsDataset, fmtInt, headSize, profileFits, rolesOf, rolesReady, setRole, type RoleId } from "./ratingsData";
import { RatingsHeader } from "./RatingsHeader";
import { LongTailCard, PerUserCard, RatingDistCard, TopItemsCard } from "./RatingsInsights";
import { RatingsSetsPanel } from "./RatingsSetsPanel";
import { RatingsUploadPanel } from "./RatingsUploadPanel";

type Source = "sets" | "upload";

const INTRO = (
  <>
    A recommender learns from a simple list: <b>who</b> rated <b>what</b>, and <b>how much</b> they liked it.
    <br /><br />Imagine that list as a giant grid — people down the side, items across the top. Almost every cell is <b>empty</b>, because nobody has seen everything.
    The model's job is to guess the blanks and suggest the items each person would rate highest.
    <br /><br />Look at the <b>long tail</b> below: a few blockbusters get most of the attention. A great recommender also finds the right <b>niche</b> picks.
  </>
);

function ratingsSuggestions(p: DatasetProfile | null): Suggestion[] {
  if (!p || p.n_users === undefined) return [];
  const out: Suggestion[] = [];
  if ((p.sparsity ?? 0) > 0.995) out.push({ id: "sparse", severity: "warn", title: "An extremely empty grid", why: `Over ${((p.sparsity ?? 0) * 100).toFixed(1)}% of the grid is blank. Neighbour models struggle when people share few items — filter out people and items with very few ratings in Prepare.` });
  if ((p.n_users ?? 0) < 50 || (p.n_items ?? 0) < 20) out.push({ id: "small", severity: "warn", title: "Very few people or items", why: "Recommenders learn from overlaps in taste. With this few people or items there's little to compare, and the scores will jump around." });
  const lt = p.long_tail ?? [];
  if (lt.length) {
    const sorted = [...lt].sort((a, b) => b - a);
    const head = headSize(sorted);
    if (head / sorted.length < 0.1) out.push({ id: "tail", severity: "info", title: "A strong long tail", why: `Only ${head} items collect half the ratings. "Most popular" will look good here — check that personal models also cover niche items (coverage) after training.` });
  }
  const labels = p.rating_hist?.labels ?? [];
  if (labels.length === 1) out.push({ id: "one", severity: "info", title: "Every rating is the same", why: "That looks like purchases or clicks. That's fine — set “Liked =” to that value in Prepare so every interaction counts as a like." });
  return out;
}

/** The Data step for recommendation projects: pick or upload ratings, say which column is who / what / rating / time, then explore. */
export function RatingsDataStep() {
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
      .catch((e) => { if (live) { setMissing(true); toast.error(`Couldn't load the saved ratings: ${e instanceof Error ? e.message : e}`); } });
    return () => { live = false; };
  }, [project.dataset_id, dataset?.id]);

  const dsReady = !!dataset && dataset.id === project.dataset_id;
  const roles = rolesOf(project, dsReady ? dataset : null);
  const ready = dsReady && rolesReady(roles);

  // Older projects (or a reload before the roles were saved): remember the guessed roles once.
  useEffect(() => {
    if (!dsReady || !ready) return;
    const saved = project.pipeline?.columns;
    if (!saved?.user || !saved?.item || !saved?.rating) {
      useProject.getState().update({ pipeline: { ...(project.pipeline ?? {}), columns: roles } });
    }
  }, [dsReady, ready, project.pipeline, roles.user, roles.item, roles.rating, roles.time]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dsReady || !dataset || !ready) return;
    const my = ++profileSeq.current;
    setProfileLoading(true);
    api.profile(dataset.id, null, null, { modality: "ratings", user_col: roles.user, item_col: roles.item, rating_col: roles.rating })
      .then((p) => { if (my === profileSeq.current) useProject.getState().setProfile(p); })
      .catch((e) => { if (my === profileSeq.current) toast.error(e); })
      .finally(() => { if (my === profileSeq.current) setProfileLoading(false); });
  }, [dsReady, dataset?.id, ready, roles.user, roles.item, roles.rating]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLoaded = useCallback((d: DatasetSummary, uploaded = false) => {
    adoptRatingsDataset(d);
    setPickerOpen(false);
    setMissing(false);
    if (uploaded) { setHighlight(true); setTimeout(() => setHighlight(false), 4500); }
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const onRole = (role: RoleId, col: string | null) => {
    if (col === roles[role]) return;
    setRole(roles, role, col);
  };

  const hasDataset = !!project.dataset_id && !missing;
  const showPicker = !hasDataset || pickerOpen;
  const fresh = profileFits(profile, roles) && dsReady ? profile : null;
  const status = !dsReady
    ? "Choose or upload some ratings to continue"
    : !ready
      ? "Point out the who, the what and the rating columns"
      : fresh
        ? <>{fmtInt(fresh.n_users ?? 0)} people · {fmtInt(fresh.n_items ?? 0)} items · <b>{fmtInt(dataset!.n_rows)}</b> ratings</>
        : <>{fmtInt(dataset!.n_rows)} ratings</>;

  return (
    <StepLayout
      title={<>Bring your <span className="gradient-text">ratings</span></>}
      subtitle="Recommenders learn tastes from who liked what. Load a ratings set or upload your own list of ratings or purchases."
      coach={<CoachPanel intro={INTRO} suggestions={ratingsSuggestions(fresh)} />}
      footer={<NextBar status={status} back="models" next="prepare" nextDisabled={!ready} />}
    >
      <div ref={topRef} style={{ scrollMarginTop: 16 }} />

      {hasDataset && dsReady && (
        <RatingsHeader dataset={dataset!} profile={fresh} roles={roles} pickerOpen={pickerOpen}
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
                <span className="eyebrow">Use different ratings</span>
                <button className="btn ghost sm" onClick={() => setPickerOpen(false)}>Keep current ratings</button>
              </div>
            )}
            {missing && <p className="small" style={{ color: "var(--warning)" }}>The ratings this project used are gone — pick or upload new ones.</p>}
            <div className="row center">
              <Segmented<Source> value={mode} onChange={setMode}
                options={[{ value: "sets", label: "🎬 Ratings sets" }, { value: "upload", label: "📁 Upload" }]} />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} {...panelSwap}>
                {mode === "sets" ? <RatingsSetsPanel onLoaded={(d) => onLoaded(d)} /> : <RatingsUploadPanel onLoaded={(d) => onLoaded(d, true)} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {dsReady && dataset && (
        <motion.div key={dataset.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }} className="col" style={{ gap: 16 }}>
          {fresh ? (
            <div className="col" style={{ gap: 16, opacity: profileLoading ? 0.6 : 1, transition: "opacity .3s" }}>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "stretch" }}>
                <RatingDistCard profile={fresh} />
                <PerUserCard profile={fresh} />
              </div>
              <LongTailCard profile={fresh} />
              <TopItemsCard profile={fresh} />
            </div>
          ) : ready ? (
            <Glass animate_in>
              <div className="row" style={{ gap: 10, marginBottom: 12 }}><Spinner size={16} color="var(--accent)" /><span className="small muted">Counting who rated what…</span></div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="skeleton" style={{ height: 180 }} />
                <div className="skeleton" style={{ height: 180 }} />
              </div>
            </Glass>
          ) : null}
          <div style={{ padding: "0 4px" }}>
            <Disclosure title={<span className="row" style={{ gap: 8 }}>📋 <b>The raw ratings</b> <span className="muted small">{dataset.n_cols} columns · {dataset.n_rows.toLocaleString()} rows</span></span>}>
              <div className="col" style={{ gap: 16 }}>
                <ColumnsTable dataset={dataset} target={roles.rating} mark="⭐" />
                <RowsTable key={dataset.id} datasetId={dataset.id} target={roles.rating} mark="⭐" />
              </div>
            </Disclosure>
          </div>
        </motion.div>
      )}
    </StepLayout>
  );
}
