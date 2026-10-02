import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, Glass, Tooltip } from "../components/glass";
import { LineupTray } from "../components/models/LineupTray";
import { ModelCard } from "../components/models/ModelCard";
import { ModelSettingsModal } from "../components/models/ModelSettingsModal";
import { BEGINNER, configsFor, FAMILIES, lineupLabels } from "../components/models/meta";
import { CoachPanel, NextBar, StepLayout } from "../components/shell/Wizard";
import { fadeUp, spring, stagger } from "../design/motion";
import { navigate } from "../lib/router";
import { modelConfigFor, toast, useProject } from "../lib/store";
import type { ModelSpec, Suggestion } from "../lib/types";

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
  const models = project?.models ?? [];
  const available = useMemo(() => registry.filter((s) => task && !s.hidden && s.tasks.includes(task)), [registry, task]);
  const groups = useMemo(() => {
    const known = FAMILIES.map((f) => ({ ...f, specs: available.filter((s) => s.family === f.id) }));
    const other = available.filter((s) => !FAMILIES.some((f) => f.id === s.family));
    if (other.length) known.push({ id: "Other", icon: "🧩", blurb: "More algorithms to explore.", specs: other });
    return known.filter((g) => g.specs.length);
  }, [available]);
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
  const picks: { label: string; icon: string; tip: string; run: () => void }[] = [
    { label: "Beginner trio", icon: "🌱", tip: "Replace the line-up with three easy, reliable starters.", run: () => {
      update((p) => ({ models: configsFor(BEGINNER[task], available, p.models) }));
      toast.success("Beginner trio ready — a line, a tree and a forest.");
    } },
    { label: "All classic models", icon: "📚", tip: "Add every non-neural algorithm. Great for a big bake-off.", run: () =>
      addIds(available.filter((s) => !s.nn).map((s) => s.id), "Added {n} classic models.") },
    { label: "Neural networks", icon: "🧠", tip: "Add a neural network and a tabular transformer (plus the image CNN if your data is images).", run: () =>
      addIds(["mlp", "ft_transformer", ...(dataset?.image_shape ? ["cnn2d"] : [])].filter((id) => available.some((s) => s.id === id)), "Added {n} neural networks.") },
    { label: "Clear", icon: "🧹", tip: "Remove everything from the line-up.", run: () => update({ models: [] }) },
  ];

  const suggestions: Suggestion[] = [];
  if (models.length === 1) suggestions.push({ id: "one", severity: "info", title: "Add a rival or two", why: "With a single model you can't tell whether its score is good. Two or three contenders make the comparison meaningful." });
  if (counts.cnn2d && dataset && !dataset.image_shape) suggestions.push({ id: "img", severity: "warn", title: "The image CNN needs pictures", why: "Your dataset isn't image data, so the 2-D CNN won't be able to train. Try the handwritten-digits sample, or remove it." });
  if (models.filter((m) => registry.find((s) => s.id === m.model_id)?.nn).length >= 3) suggestions.push({ id: "slow", severity: "info", title: "Neural nets take a while", why: "Several neural networks will train one after another. That's fine — just expect to wait a little longer." });

  return (
    <StepLayout
      title="Pick your contenders"
      subtitle="Choose a few algorithms to race against each other. Tap a card to add it — you can tweak any of them later."
      coach={
        <CoachPanel
          suggestions={suggestions}
          intro={<>There's <b>no single best algorithm</b> — which one wins depends on your data. That's why the pros try several and compare.
            <br /><br />Not sure? Hit <b>Beginner trio</b>. Feeling curious? Add a 🧠 neural network and design its layers yourself.</>}
        />
      }
      footer={
        <NextBar
          back="problem"
          next="data"
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
