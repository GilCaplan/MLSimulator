import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { classColor } from "../../../lib/colors";
import { fmt } from "../../../lib/format";
import { toast, useProject } from "../../../lib/store";
import type { DatasetProfile, DatasetSummary, Task } from "../../../lib/types";
import { BarList, Histogram } from "../../charts";
import { Glass, Segmented, Spinner } from "../../glass";
import { CoachPanel, NextBar, StepLayout } from "../../shell/Wizard";
import { adoptDataset, panelSwap } from "../shared";
import { SectionTitle } from "../ui";
import { ClassGallery } from "./ClassGallery";
import { ImageHeader } from "./ImageHeader";
import { ImageMap } from "./ImageMap";
import { ImageSetsPanel } from "./ImageSetsPanel";
import { storedSize } from "./Thumb";
import { ZipUploadPanel } from "./ZipUploadPanel";

type ImageSource = "sets" | "upload";

const INTRO = (
  <>
    For a computer, a picture is just a grid of numbers — one per pixel and colour. The model will learn which
    <b> patterns of numbers</b> go with which answer.
    <br /><br />Start with a ready-made <b>image set</b>, or zip up your own pictures. Then look through them: if <i>you</i> can
    tell the classes apart, a model can probably learn to as well.
  </>
);

/** The Data step for image projects: pick or upload pictures, then explore them. */
export function ImageDataStep() {
  const project = useProject((s) => s.project)!;
  const dataset = useProject((s) => s.dataset);
  const profile = useProject((s) => s.profile);
  /* image projects are always supervised */
  const task = project.task as Task | null;

  const [mode, setMode] = useState<ImageSource>("sets");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [missing, setMissing] = useState(false);
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
      .catch((e) => { if (live) { setMissing(true); toast.error(`Couldn't load the saved pictures: ${e instanceof Error ? e.message : e}`); } });
    return () => { live = false; };
  }, [project.dataset_id, dataset?.id]);

  const dsReady = !!dataset && dataset.id === project.dataset_id;
  const isImageData = dsReady && dataset!.modality === "image";
  useEffect(() => {
    if (!dsReady || !dataset) return;
    const my = ++profileSeq.current;
    setProfileLoading(true);
    api.profile(dataset.id, project.target, task)
      .then((p) => { if (my === profileSeq.current) useProject.getState().setProfile(p); })
      .catch((e) => { if (my === profileSeq.current) toast.error(e); })
      .finally(() => { if (my === profileSeq.current) setProfileLoading(false); });
  }, [dsReady, dataset?.id, project.target, task]);

  const onLoaded = useCallback((d: DatasetSummary) => {
    adoptDataset(d);
    setPickerOpen(false);
    setMissing(false);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const hasDataset = !!project.dataset_id && !missing;
  const showPicker = !hasDataset || pickerOpen || (dsReady && !isImageData);
  const freshProfile = profile && profile.modality === "image" && dsReady ? profile : null;
  const n = dataset?.n_images ?? dataset?.n_rows ?? 0;
  const size = storedSize(dataset?.image_shape);
  const status = !dsReady
    ? "Choose or upload some pictures to continue"
    : !isImageData
      ? "This project needs pictures — pick an image set or upload a ZIP"
      : <>Learning from <b>{n.toLocaleString()}</b> pictures · {size}×{size} px</>;

  return (
    <StepLayout
      title={<>Bring your <span className="gradient-text">pictures</span></>}
      subtitle="Examples are what models learn from. Here every example is a picture, labelled with the answer."
      coach={<CoachPanel intro={INTRO} suggestions={freshProfile?.coach ?? []} />}
      footer={<NextBar status={status} back="models" next="prepare" nextDisabled={!isImageData || !project.target} />}
    >
      <div ref={topRef} style={{ scrollMarginTop: 16 }} />

      {hasDataset && isImageData && <ImageHeader dataset={dataset!} project={project} profile={freshProfile} pickerOpen={pickerOpen} onTogglePicker={() => setPickerOpen((o) => !o)} />}
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
            {hasDataset && isImageData && (
              <div className="row between" style={{ padding: "4px 4px 0" }}>
                <span className="eyebrow">Use different pictures</span>
                <button className="btn ghost sm" onClick={() => setPickerOpen(false)}>Keep current pictures</button>
              </div>
            )}
            {missing && <p className="small" style={{ color: "var(--warning)" }}>The pictures this project used are gone — pick or upload new ones.</p>}
            {dsReady && !isImageData && <p className="small" style={{ color: "var(--warning)" }}>The current dataset is a table, not pictures — choose an image set or upload a ZIP.</p>}
            <div className="row center">
              <Segmented<ImageSource> value={mode} onChange={setMode}
                options={[{ value: "sets", label: "🖼️ Image sets" }, { value: "upload", label: "📦 Upload ZIP" }]} />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} {...panelSwap}>
                {mode === "sets" ? <ImageSetsPanel task={task} onLoaded={onLoaded} /> : <ZipUploadPanel onLoaded={onLoaded} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {isImageData && dataset && (
        <motion.div key={dataset.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }} className="col" style={{ gap: 16 }}>
          {freshProfile ? (
            <>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "stretch" }}>
                <BalanceCard profile={freshProfile} loading={profileLoading} />
                <Glass animate_in>
                  <SectionTitle icon="🗺️" title="Image map"
                    help="Each picture is shrunk to 16×16 greyscale, then PCA squashes those 256 numbers onto a flat map. Pictures that look alike land close together — but 'looks alike' here means raw pixels, not meaning."
                    sub="Every picture as a dot — similar-looking pictures sit together. Hover to peek." />
                  <ImageMap datasetId={dataset.id} points={freshProfile.projection} classes={freshProfile.class_balance?.labels ?? null}
                    continuous={!freshProfile.class_balance} size={size} height={260} />
                </Glass>
              </div>
              <MapInsight profile={freshProfile} />
              <ClassGallery dataset={dataset} profile={freshProfile} target={project.target ?? null} />
            </>
          ) : (
            <Glass animate_in>
              <div className="row" style={{ gap: 10, marginBottom: 12 }}><Spinner size={16} color="var(--accent)" /><span className="small muted">Looking through your pictures…</span></div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="skeleton" style={{ height: 200 }} />
                <div className="skeleton" style={{ height: 200 }} />
              </div>
            </Glass>
          )}
        </motion.div>
      )}
    </StepLayout>
  );
}

function BalanceCard({ profile, loading }: { profile: DatasetProfile; loading: boolean }) {
  const cb = profile.class_balance;
  const total = cb ? cb.counts.reduce((a, b) => a + b, 0) + cb.other : 0;
  return (
    <Glass animate_in>
      <SectionTitle icon={cb ? "⚖️" : "📊"} title={cb ? "Pictures per class" : "Spread of the answers"}
        help={cb ? "How many pictures belong to each answer. If one class has far fewer, the model sees too few examples of it and may ignore it." : "How the numbers you want to predict are distributed across all pictures."}
        right={loading ? <Spinner size={14} color="var(--accent)" /> : null}
        sub={cb ? "Even bars = every class gets a fair share of practice." : "Each bar counts the pictures with answers in that range."} />
      {cb ? (
        <BarList labels={cb.labels} values={cb.counts} colors={cb.labels.map((l) => classColor(l, cb.labels))}
          format={(v) => `${Math.round(v).toLocaleString()} · ${total ? Math.round((v / total) * 100) : 0}%`} />
      ) : profile.target_hist ? (
        <Histogram data={profile.target_hist} color="var(--accent-2)" height={170} />
      ) : null}
      <BalanceInsight profile={profile} />
    </Glass>
  );
}

/** A small summary under the balance chart: how even the classes are, or the range of the answers. */
function BalanceInsight({ profile }: { profile: DatasetProfile }) {
  const cb = profile.class_balance;
  let icon = "", text: React.ReactNode = null;
  if (cb && cb.counts.length) {
    const total = cb.counts.reduce((a, b) => a + b, 0) + cb.other;
    const min = Math.min(...cb.counts), max = Math.max(...cb.counts);
    const rare = cb.labels[cb.counts.indexOf(min)];
    const ratio = max / Math.max(1, min);
    if (ratio < 1.3) { icon = "✅"; text = <>Nicely balanced — every class has about <b>{Math.round((max / total) * 100)}%</b> of the pictures.</>; }
    else if (ratio < 3) { icon = "👍"; text = <>A little uneven — “{rare}” is the rarest with <b>{min.toLocaleString()}</b> pictures. Usually fine.</>; }
    else { icon = "⚠️"; text = <>Uneven — “{rare}” has only <b>{min.toLocaleString()}</b> pictures, {ratio.toFixed(0)}× fewer than the biggest class. The model may neglect it.</>; }
  } else if (profile.target_hist) {
    const { edges, counts } = profile.target_hist;
    const n = counts.reduce((a, b) => a + b, 0) || 1;
    const mean = counts.reduce((a, c, k) => a + c * (edges[k] + edges[k + 1]) / 2, 0) / n;
    icon = "📏";
    text = <>Answers range from <b>{fmt(edges[0], 2)}</b> to <b>{fmt(edges[edges.length - 1], 2)}</b>, around <b>{fmt(mean, 2)}</b> on average. Always guessing the average is the score to beat.</>;
  }
  if (!text) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="inset row small" style={{ gap: 8, padding: "9px 12px", marginTop: 14, lineHeight: 1.5, alignItems: "flex-start" }}>
      <span>{icon}</span><span className="muted">{text}</span>
    </motion.div>
  );
}

/** One friendly line about the image map: do the classes form their own islands? */
function MapInsight({ profile }: { profile: DatasetProfile }) {
  if (!profile.class_balance || profile.projection.length < 20) return null;
  // nearest-neighbour agreement on the 2-D map: how often is a dot's closest neighbour the same class?
  const pts = profile.projection;
  let same = 0;
  for (let a = 0; a < pts.length; a++) {
    let best = -1, bd = Infinity;
    for (let b = 0; b < pts.length; b++) {
      if (a === b) continue;
      const d = (pts[a].x - pts[b].x) ** 2 + (pts[a].y - pts[b].y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (best >= 0 && pts[best].label === pts[a].label) same++;
  }
  const share = same / pts.length;
  const chance = 1 / profile.class_balance.labels.length;
  const mixed = share < chance + 0.25;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="row small" style={{ gap: 10, padding: "10px 14px", borderRadius: 14, background: mixed ? "var(--accent-soft)" : "rgba(48,209,88,.12)", lineHeight: 1.5 }}>
      <span style={{ fontSize: 16 }}>{mixed ? "🧩" : "🏝️"}</span>
      <span style={{ color: "var(--text-2)" }}>
        {mixed
          ? <>On the map the classes are <b>all mixed up</b> — the raw pixels alone don't separate them. That's normal for pictures: a star in the corner and a star in the middle share few pixels. <b>Convolutional networks</b> are built to see past that.</>
          : <>On the map the classes already form <b>their own islands</b> ({Math.round(share * 100)}% of dots sit next to a same-class neighbour) — even simple models should do well here.</>}
      </span>
    </motion.div>
  );
}
