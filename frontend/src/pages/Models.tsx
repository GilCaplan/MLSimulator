import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, Glass, Tooltip } from "../components/glass";
import { LineupTray } from "../components/models/LineupTray";
import { ModelCard } from "../components/models/ModelCard";
import { ModelSettingsModal } from "../components/models/ModelSettingsModal";
import { configsFor, FAMILIES, lineupLabels, modalityOf, specFits, specModalities, starterFor, VISION_IDS } from "../components/models/meta";
import { CoachPanel, NextBar, StepLayout } from "../components/shell/Wizard";
import { fadeUp, spring, stagger } from "../design/motion";
import { navigate } from "../lib/router";
import { isUnsupervised, modelConfigFor, toast, useProject } from "../lib/store";
import type { ModelSpec, Suggestion } from "../lib/types";

const UNSUP_INTRO: Record<string, React.ReactNode> = {
  clustering: <>There's <b>no answer column</b> here — the models have to find the groups on their own. That's called <b>unsupervised learning</b>.
    <br /><br /><b>K-Means</b> looks for round blobs, <b>Gaussian Mixture</b> allows stretched ones, <b>DBSCAN</b> follows dense regions of any shape. Not sure? Hit <b>Starter set</b>.</>,
  reduction: <>Your data may have many columns — far too many to draw. <b>Dimensionality reduction</b> squashes them onto a flat map while trying to keep similar rows close together.
    <br /><br /><b>PCA</b> is quick and honest; <b>t-SNE</b> draws prettier clusters but can exaggerate gaps. Compare both!</>,
  anomaly: <>Anomaly detectors never see an example of a fault — they learn what's <b>normal</b> and flag whatever doesn't fit.
    <br /><br /><b>Isolation Forest</b> is a fast all-rounder, <b>Local Outlier Factor</b> compares each row with its neighbours, <b>One-Class SVM</b> draws a fence around normal. Hit <b>Starter set</b> to race all three.</>,
};

/** Line-up tips for unsupervised problems. */
function unsupSuggestions(task: string, ids: string[]): Suggestion[] {
  const out: Suggestion[] = [];
  if (ids.length === 1) out.push({ id: "one", severity: "info", title: "Add a second opinion", why: "There's no right answer to score against, so comparing two algorithms is the best way to see whether a pattern is real or just one model's quirk." });
  if (task === "clustering" && ids.length && !ids.includes("dbscan")) out.push({ id: "dbscan", severity: "info", title: "Try a shape-free clusterer", why: "K-Means and friends assume round-ish groups. DBSCAN follows dense regions of any shape and can leave loners out as noise.", action: { kind: "add_models", label: "Add DBSCAN", model_ids: ["dbscan"] } });
  if (task === "reduction" && ids.includes("tsne") && !ids.includes("pca")) out.push({ id: "pca", severity: "info", title: "Add PCA as a reference", why: "t-SNE maps look great but can invent gaps. PCA is a faithful, straight-line view to compare against.", action: { kind: "add_models", label: "Add PCA", model_ids: ["pca"] } });
  if (task === "anomaly" && ids.length === 1) out.push({ id: "more", severity: "info", title: "Race a few detectors", why: "Different detectors flag different rows. If several agree a row is odd, it probably is.", action: { kind: "add_models", label: "Add LOF + Isolation Forest", model_ids: ["lof", "isolation_forest"].filter((x) => !ids.includes(x)) } });
  return out;
}

export function ModelsStep() {
  const project = useProject((s) => s.project);
  const registry = useProject((s) => s.registry);
  const dataset = useProject((s) => s.dataset);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    useProject.getState().ensureRegistry().catch((e) => { setLoadError(String(e?.message || e)); toast.error(e); });
  }, []);

  const task = project?.task ?? null;
  const modality = modalityOf(project?.modality);
  const image = modality === "image";
  const unsup = isUnsupervised(task);
  const models = project?.models ?? [];
  const available = useMemo(
    () => registry.filter((s) => task && !s.hidden && specFits(s, task) && specModalities(s).includes(modality)),
    [registry, task, modality],
  );
  const groups = useMemo(() => {
    if (image) {
      // vision networks first; everything else treats the picture as a long row of unrelated numbers
      const vision = available.filter((s) => VISION_IDS.has(s.id)).sort((a, b) => a.id.localeCompare(b.id));
      const table = available.filter((s) => !VISION_IDS.has(s.id)).sort((a, b) => Number(!!a.nn) - Number(!!b.nn));
      return [
        { id: "Vision", icon: "👁️", blurb: "Built for pictures — they look at neighbouring pixels together, so they spot edges, strokes and shapes wherever they are.", specs: vision },
        { id: "Pixels as a table", icon: "🔢", blurb: "These see each pixel as an unrelated number — a great baseline to beat.", specs: table },
      ].filter((g) => g.specs.length);
    }
    const known = FAMILIES.map((f) => ({ ...f, specs: available.filter((s) => s.family === f.id) }));
    const other = available.filter((s) => !FAMILIES.some((f) => f.id === s.family));
    if (other.length) known.push({ id: "Other", icon: "🧩", blurb: "More algorithms to explore.", specs: other });
    return known.filter((g) => g.specs.length);
  }, [available, image]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of models) c[m.model_id] = (c[m.model_id] || 0) + 1;
    return c;
  }, [models]);
  const labels = lineupLabels(models, (id) => registry.find((s) => s.id === id));

  if (!project) return null;
  if (!task) {
    return (
      <EmptyState icon="🎯" title="First, pick a problem" text="Models depend on whether you're predicting a category or a number."
        action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/problem`)}>Choose the problem →</button>} />
    );
  }

  const update = useProject.getState().update;
  const toggle = (spec: ModelSpec) => {
    if (counts[spec.id]) update((p) => ({ models: p.models.filter((m) => m.model_id !== spec.id) }));
    else update((p) => ({ models: [...p.models, modelConfigFor(spec)] }));
  };
  const addIds = (ids: string[], msg: string) => {
    const missing = ids.filter((id) => !counts[id]);
    if (!missing.length) return toast.info("Those are already in your line-up.");
    update((p) => ({ models: [...p.models, ...configsFor(missing, available)] }));
    toast.success(msg.replace("{n}", String(missing.length)));
  };
  const starter = starterFor(task, image);
  const starterNames = starter.map((id) => available.find((s) => s.id === id)?.label ?? id);
  const picks: { label: string; icon: string; tip: string; run: () => void }[] = unsup ? [
    { label: "Starter set", icon: "🌱", tip: `Replace the line-up with ${starterNames.join(", ")} — different ideas of what a ${task === "clustering" ? "group" : task === "reduction" ? "good map" : "weird row"} is.`, run: () => {
      update((p) => ({ models: configsFor(starter, available, p.models) }));
      toast.success(`Starter set ready — ${starterNames.join(", ")}.`);
    } },
    { label: "Add them all", icon: "📚", tip: "Add every algorithm for this problem and compare them side by side.", run: () =>
      addIds(available.map((s) => s.id), "Added {n} models.") },
    { label: "Clear", icon: "🧹", tip: "Remove everything from the line-up.", run: () => update({ models: [] }) },
  ] : [
    { label: image ? "Vision starter" : "Beginner trio", icon: "🌱", tip: image
      ? "Replace the line-up with two vision networks and one classic baseline to beat."
      : "Replace the line-up with three easy, reliable starters.", run: () => {
      update((p) => ({ models: configsFor(starter, available, p.models) }));
      toast.success(image ? "Vision starter ready — a CNN, a ResNet and a classic baseline." : "Beginner trio ready — a line, a tree and a forest.");
    } },
    { label: image ? "All pixel baselines" : "All classic models", icon: "📚", tip: image
      ? "Add every classic algorithm. They treat pixels as a table — see how far that gets."
      : "Add every non-neural algorithm. Great for a big bake-off.", run: () =>
      addIds(available.filter((s) => !s.nn).map((s) => s.id), "Added {n} classic models.") },
    { label: "Neural networks", icon: "🧠", tip: image
      ? "Add the image CNN, the Tiny ResNet and a plain neural network (MLP) for comparison."
      : "Add a neural network and a tabular transformer (plus the image CNN if your data is images).", run: () =>
      addIds((image ? ["cnn2d", "tiny_resnet", "mlp"] : ["mlp", "ft_transformer", ...(dataset?.image_shape ? ["cnn2d"] : [])]).filter((id) => available.some((s) => s.id === id)), "Added {n} neural networks.") },
    { label: "Clear", icon: "🧹", tip: "Remove everything from the line-up.", run: () => update({ models: [] }) },
  ];

  const suggestions: Suggestion[] = [];
  if (unsup) suggestions.push(...unsupSuggestions(task, models.map((m) => m.model_id)));
  else if (models.length === 1) suggestions.push({ id: "one", severity: "info", title: "Add a rival or two", why: "With a single model you can't tell whether its score is good. Two or three contenders make the comparison meaningful." });
  if (image && models.length && !models.some((m) => VISION_IDS.has(m.model_id))) suggestions.push({ id: "novision", severity: "warn", title: "Add a vision network", why: "None of your models are built for pictures. Add the Image CNN or Tiny ResNet — they usually beat pixel-by-pixel models by a wide margin.", action: { kind: "add_models", label: "Add CNN + ResNet", model_ids: ["cnn2d", "tiny_resnet"] } });
  if (image && models.length && models.every((m) => VISION_IDS.has(m.model_id))) suggestions.push({ id: "baseline", severity: "info", title: "Add a baseline to beat", why: "A classic model on raw pixels (like logistic regression) shows how much the vision networks actually add." });
  if (!image && counts.cnn2d && dataset && !dataset.image_shape) suggestions.push({ id: "img", severity: "warn", title: "The image CNN needs pictures", why: "Your dataset isn't image data, so the 2-D CNN won't be able to train. Try the handwritten-digits sample, or remove it." });
  if (models.filter((m) => registry.find((s) => s.id === m.model_id)?.nn).length >= 3) suggestions.push({ id: "slow", severity: "info", title: "Neural nets take a while", why: "Several neural networks will train one after another. That's fine — just expect to wait a little longer." });

  return (
    <StepLayout
      title={unsup ? "Pick your explorers" : "Pick your contenders"}
      subtitle={unsup
        ? task === "clustering" ? "Each algorithm has its own idea of what a “group” is. Try a few and see which grouping makes the most sense."
          : task === "reduction" ? "Each algorithm flattens your columns onto a 2-D map in its own way. Compare the maps side by side."
          : "Each detector learns what “normal” looks like differently. Compare which rows they find suspicious."
        : image
        ? "Choose a few algorithms to race on your pictures. Vision networks are built for images; the rest are a baseline to beat."
        : "Choose a few algorithms to race against each other. Tap a card to add it — you can tweak any of them later."}
      coach={
        <CoachPanel
          suggestions={suggestions}
          intro={unsup ? UNSUP_INTRO[task] : image
            ? <>Pictures are just grids of numbers — but the <b>arrangement</b> matters. <b>Vision networks</b> slide small filters over the image to find edges, then shapes, then objects.
              <br /><br />Classic models see the same pixels as an unordered list. Racing both shows <b>why convolutions changed computer vision</b>. Not sure? Hit <b>Vision starter</b>.</>
            : <>There's <b>no single best algorithm</b> — which one wins depends on your data. That's why the pros try several and compare.
            <br /><br />Not sure? Hit <b>Beginner trio</b>. Feeling curious? Add a 🧠 neural network and design its layers yourself.</>}
        />
      }
      footer={
        <NextBar
          back="problem"
          next="data"
          nextLabel={image ? "Images" : undefined}
          nextDisabled={models.length === 0}
          status={models.length === 0 ? "Pick at least one model" : `${models.length} model${models.length === 1 ? "" : "s"} selected`}
        />
      }
    >
      <motion.div variants={fadeUp} className="row wrap" style={{ gap: 8 }}>
        <span className="eyebrow" style={{ marginRight: 4 }}>Quick picks</span>
        {picks.map((p) => (
          <Tooltip key={p.label} content={p.tip} width={220}>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} transition={spring.snappy}
              className={`btn sm${p.label === "Clear" ? " ghost" : ""}`} disabled={p.label === "Clear" && models.length === 0} onClick={p.run}>
              <span>{p.icon}</span> {p.label}
            </motion.button>
          </Tooltip>
        ))}
      </motion.div>

      <LineupTray onSettings={setEditing} />

      {loadError && !registry.length && (
        <Glass><EmptyState icon="🔌" title="Couldn't load the model list" text={loadError}
          action={<button className="btn primary" onClick={() => { setLoadError(null); useProject.getState().ensureRegistry().catch((e) => setLoadError(String(e?.message || e))); }}>Try again</button>} /></Glass>
      )}

      {!registry.length && !loadError && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 148, borderRadius: 22 }} />)}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "22px 14px", marginTop: 4 }}>
        {groups.map((g) => {
          const n = g.specs.length;
          return (
            <motion.section key={g.id} variants={stagger(0.04)} initial="hidden" animate="show" className="col"
              style={{ gap: 10, flex: `${n} 1 ${n * 226 + (n - 1) * 12}px`, minWidth: 0 }}>
              <motion.div variants={fadeUp} className="col" style={{ gap: 1, padding: "0 4px" }}>
                <span className="row" style={{ gap: 8 }}>
                  <span style={{ fontSize: 17 }}>{g.icon}</span>
                  <h3>{g.id}</h3>
                  <span className="badge num">{n}</span>
                </span>
                <span className="small muted" style={{ lineHeight: 1.4, minHeight: 34 }}>{g.blurb}</span>
              </motion.div>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(214px, 1fr))", gap: 12 }}>
                {g.specs.map((s) => (
                  <ModelCard key={s.id} spec={s} count={counts[s.id] || 0} onToggle={() => toggle(s)}
                    onSettings={() => setEditing(models.find((m) => m.model_id === s.id)?.key ?? null)} />
                ))}
              </div>
            </motion.section>
          );
        })}
      </div>

      <ModelSettingsModal modelKey={editing} label={editing ? labels[editing] : undefined} onClose={() => setEditing(null)} />
    </StepLayout>
  );
}
