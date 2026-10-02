import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Glass } from "../components/glass";
import { CheckDot } from "../components/models/ModelCard";
import { ClassificationArt, ImageClassifyArt, ImageNumberArt, RegressionArt } from "../components/models/TaskArt";
import { CoachPanel, NextBar, StepLayout } from "../components/shell/Wizard";
import { fadeUp, spring, stagger } from "../design/motion";
import { api } from "../lib/api";
import { toast, useProject } from "../lib/store";
import type { Modality, ProblemType, Task } from "../lib/types";

/** Used until /api/problems answers (or if it can't be reached) so the page is never empty. */
const FALLBACK: ProblemType[] = [
  { id: "classification", task: "classification", modality: "tabular", group: "Predict", emoji: "🏷️", label: "Classification", question: "Which group does it belong to?", primary_metric: "accuracy", lower_is_better: false, enabled: true, steps: [] },
  { id: "regression", task: "regression", modality: "tabular", group: "Predict", emoji: "📈", label: "Regression", question: "How much / how many?", primary_metric: "r2", lower_is_better: false, enabled: true, steps: [] },
];

/** Presentation for each problem: examples, looping illustration and a soft tint. */
const LOOK: Record<string, { examples: string[]; art?: (active: boolean) => ReactNode; tint: string }> = {
  classification: {
    examples: ["📧 Spam or not spam", "🌸 Which flower species", "👋 Will a customer churn"],
    art: (a) => <ClassificationArt active={a} />,
    tint: "linear-gradient(135deg, rgba(10,132,255,.14), rgba(255,55,95,.12))",
  },
  regression: {
    examples: ["🏡 A house's price", "🌡️ Tomorrow's temperature", "📦 Next month's sales"],
    art: (a) => <RegressionArt active={a} />,
    tint: "linear-gradient(135deg, rgba(94,92,230,.14), rgba(191,90,242,.12))",
  },
  image_classification: {
    examples: ["🐱 Cat, dog or bird?", "✍️ Which digit was written", "🔩 Healthy or damaged part"],
    art: (a) => <ImageClassifyArt active={a} />,
    tint: "linear-gradient(135deg, rgba(255,159,10,.15), rgba(255,55,95,.1))",
  },
  image_regression: {
    examples: ["🎲 How many dots are there", "📐 How tilted is the line", "🍎 How ripe is the fruit (1–10)"],
    art: (a) => <ImageNumberArt active={a} />,
    tint: "linear-gradient(135deg, rgba(48,209,88,.14), rgba(94,92,230,.12))",
  },
};

const GROUP_BLURB: Record<string, string> = {
  Predict: "Learn from a table — one row per example, one column per clue.",
  Vision: "Learn straight from pictures — the model finds the clues itself.",
  Language: "Learn from words and sentences.",
  Discover: "No answers given — find the structure hiding in the data.",
  Recommend: "Learn tastes from ratings and suggest what's next.",
  Forecast: "Learn from the past to predict what comes next in time.",
};

const modalityOf = (m?: Modality | null): Modality => m ?? "tabular";

/** Set the project's problem (task × modality); downstream choices are reset when it changes. */
function chooseProblem(task: Task, modality: Modality) {
  const st = useProject.getState();
  const p = st.project;
  if (!p) return;
  const sameTask = p.task === task;
  const sameModality = modalityOf(p.modality) === modality;
  if (sameTask && sameModality) return;
  if (!p.task) {
    st.update({ task, modality });
    return;
  }
  const patch: Partial<typeof p> = { task, modality, models: [], pipeline: null, prepared_id: null, last_job_id: null };
  // a table can't feed an image model (and vice versa): forget the dataset too
  if (!sameModality) Object.assign(patch, { dataset_id: null, target: null });
  st.update(patch);
  st.setReport(null);
  st.setResult(null);
  if (!sameModality) { st.setDataset(null); st.setProfile(null); }
  if (p.models.length || p.prepared_id || p.last_job_id || (!sameModality && p.dataset_id)) {
    toast.info(sameModality ? "Switched problem type — model picks and preparation were reset." : "Switched to a different kind of data — models, data and preparation were reset.");
  }
}

export function ProblemStep() {
  const task = useProject((s) => s.project?.task ?? null);
  const modality = useProject((s) => modalityOf(s.project?.modality));
  const [problems, setProblems] = useState<ProblemType[]>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    api.problems()
      .then((ps) => { if (live) { setProblems(ps); setLoaded(true); } })
      .catch((e) => { if (live) { setLoaded(true); toast.error(`Couldn't load the problem list: ${e instanceof Error ? e.message : e}`); } });
    return () => { live = false; };
  }, []);

  const { enabled, soon } = useMemo(() => {
    const order: string[] = [];
    for (const p of problems) if (!order.includes(p.group)) order.push(p.group);
    const by = (on: boolean) => order
      .map((g) => ({ group: g, items: problems.filter((p) => p.group === g && p.enabled === on) }))
      .filter((g) => g.items.length);
    return { enabled: by(true), soon: by(false) };
  }, [problems]);

  const current = problems.find((p) => p.task === task && p.modality === modality);
  const status = current
    ? <>Great — we'll build {/^[aeiou]/i.test(current.label) ? "an" : "a"} <b>{current.label.toLowerCase()}</b> model.</>
    : "Choose one to continue";

  return (
    <StepLayout
      title="What do you want to predict?"
      subtitle="Every machine-learning project starts with one question. Pick the kind of answer you're after — and what your examples look like."
      coach={
        <CoachPanel
          intro={<>A model learns from examples where the answer is already known, then guesses the answer for new ones.
            <br /><br />The first big choice is <b>what kind of answer</b> it gives: a <b>category</b> (classification) or a <b>number</b> (regression).
            <br /><br />The second is <b>what the examples are</b>: rows in a table, or <b>pictures</b>. Together they decide which algorithms and scores make sense later on.</>}
        />
      }
      footer={<NextBar next="models" nextDisabled={!task} status={status} />}
    >
      {enabled.map((g) => (
        <motion.section key={g.group} variants={stagger(0.06)} className="col" style={{ gap: 10 }}>
          <motion.div variants={fadeUp} className="row" style={{ gap: 10, padding: "0 4px", alignItems: "baseline" }}>
            <h3>{g.group}</h3>
            <span className="small muted">{GROUP_BLURB[g.group]}</span>
          </motion.div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 18 }}>
            {g.items.map((p) => (
              <ProblemTile key={p.id} problem={p} selected={task === p.task && modality === p.modality} dim={!!task} />
            ))}
          </div>
        </motion.section>
      ))}

      {loaded && soon.length > 0 && <Roadmap groups={soon} />}

      <Glass animate_in>
        <div className="col" style={{ gap: 4, marginBottom: 14 }}>
          <span className="eyebrow">Not sure?</span>
          <h3>Two quick questions</h3>
        </div>
        <div className="row wrap" style={{ gap: 14, alignItems: "stretch" }}>
          <div className="inset col" style={{ padding: 14, gap: 10, flex: "2 1 380px" }}>
            <span className="small" style={{ fontWeight: 650 }}>1 · Is the answer a category or a number?</span>
            <p className="tiny muted" style={{ lineHeight: 1.55 }}>
              If you could list every possible answer in advance, it's a <b>category</b>. If it's a measurement on a scale, it's a <b>number</b>.
            </p>
            <div className="row wrap" style={{ gap: 10, alignItems: "flex-start" }}>
              <Examples label="Category → Classification" on={task === "classification"} onPick={() => chooseProblem("classification", modality)}
                items={modality === "image" ? ["Cat or dog", "Digit 0–9", "Ripe or not"] : ["Yes / no", "Cat, dog or bird", "Low · medium · high risk", "Fraud or genuine"]} />
              <Examples label="Number → Regression" on={task === "regression"} onPick={() => chooseProblem("regression", modality)}
                items={modality === "image" ? ["7 dots", "32° tilt", "Age 41"] : ["$312,000", "23.4 °C", "1,240 units", "4.7 stars"]} />
            </div>
          </div>
          <div className="inset col" style={{ padding: 14, gap: 10, flex: "1 1 240px", transition: "border-color .2s", borderColor: modality === "image" && task ? "var(--accent)" : undefined }}>
            <span className="small" style={{ fontWeight: 650 }}>2 · Is your data pictures?</span>
            <p className="tiny muted" style={{ lineHeight: 1.55 }}>
              Photos, scans or drawings → <b>Vision</b>. Spreadsheets, CSVs and databases → <b>Predict</b>.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <PictureButton on={modality === "image" && !!task} onClick={() => chooseProblem(task ?? "classification", "image")}>🖼️ Yes, pictures</PictureButton>
              <PictureButton on={modality === "tabular" && !!task} onClick={() => chooseProblem(task ?? "classification", "tabular")}>📋 No, a table</PictureButton>
            </div>
          </div>
        </div>
      </Glass>
    </StepLayout>
  );
}

function ProblemTile({ problem, selected, dim }: { problem: ProblemType; selected: boolean; dim: boolean }) {
  const look = LOOK[problem.id] ?? { examples: [], tint: "var(--fill)" };
  const pick = () => chooseProblem(problem.task as Task, problem.modality);
  return (
    <motion.div variants={fadeUp}>
      <motion.div
        role="radio"
        aria-checked={selected}
        tabIndex={0}
        onClick={pick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}
        whileTap={{ scale: 0.985 }}
        animate={{ opacity: dim && !selected ? 0.72 : 1 }}
        className={`glass tile${selected ? " selected" : ""}`}
        style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
      >
        <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1 }}>
          <CheckDot checked={selected} size={28} />
        </div>
        <div className="inset" style={{ height: 150, padding: "14px 20px", background: look.tint, borderRadius: 18, overflow: "hidden" }}>
          {look.art ? look.art(selected) : <div className="center" style={{ height: "100%", display: "flex", fontSize: 54 }}>{problem.emoji}</div>}
        </div>
        <div className="col" style={{ gap: 4 }}>
          <span className="eyebrow row" style={{ gap: 6, color: selected ? "var(--accent)" : undefined }}>
            <span style={{ fontSize: 13 }}>{problem.emoji}</span>{problem.label}
          </span>
          <h2 style={{ fontSize: 23 }}>{problem.question}</h2>
        </div>
        <div className="col" style={{ gap: 6 }}>
          {look.examples.map((ex, i) => (
            <motion.span key={ex} className="row small muted" style={{ gap: 8 }}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.07 }}>
              {ex}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Problem types that aren't ready yet, dimmed — a glimpse of the roadmap. */
function Roadmap({ groups }: { groups: { group: string; items: ProblemType[] }[] }) {
  return (
    <motion.section variants={stagger(0.04)} initial="hidden" animate="show" className="col" style={{ gap: 10, marginTop: 4 }}>
      <motion.div variants={fadeUp} className="row" style={{ gap: 10, padding: "0 4px", alignItems: "baseline" }}>
        <h3>Coming soon</h3>
        <span className="small muted">More kinds of problems on the way — here's a sneak peek.</span>
      </motion.div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10 }}>
        {groups.flatMap((g) => g.items.map((p) => ({ g, p }))).map(({ g, p }, i) => (
          <motion.div key={p.id} variants={fadeUp} className="glass" aria-disabled title={GROUP_BLURB[g.group]}
            style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", opacity: 0.6, filter: "saturate(0.55)", cursor: "default" }}>
            <div className="row between" style={{ width: "100%" }}>
              <motion.span animate={{ y: [0, -3, 0] }} transition={{ duration: 3.2, repeat: Infinity, delay: (i * 0.37) % 2 }}
                style={{ width: 36, height: 36, borderRadius: 11, background: "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
                {p.emoji}
              </motion.span>
              <span className="badge" style={{ height: 18, fontSize: 10 }}>Soon</span>
            </div>
            <div className="col" style={{ gap: 3, minWidth: 0 }}>
              <span className="tiny faint" style={{ fontWeight: 650, textTransform: "uppercase", letterSpacing: ".04em" }}>{g.group}</span>
              <b style={{ fontSize: 13.5 }}>{p.label}</b>
              <span className="tiny muted" style={{ lineHeight: 1.4 }}>{p.question}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

function Examples({ label, items, on, onPick }: { label: string; items: string[]; on: boolean; onPick: () => void }) {
  return (
    <div className="col" style={{ gap: 8, flex: "1 1 180px" }}>
      <span className="tiny" style={{ fontWeight: 650, color: on ? "var(--accent)" : "var(--text-2)" }}>{label}{on && " ✓"}</span>
      <div className="row wrap" style={{ gap: 6 }}>
        {items.map((it) => (
          <motion.button key={it} whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} transition={spring.snappy}
            className="badge" style={{ border: "none", cursor: "pointer", height: 26, fontSize: 12, background: on ? "var(--accent-soft)" : "var(--glass-strong)", color: on ? "var(--accent)" : "var(--text-2)" }}
            onClick={onPick}>
            {it}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function PictureButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} transition={spring.snappy} onClick={onClick}
      className={`btn sm${on ? " primary" : ""}`} style={{ flex: 1 }}>
      {children}
      <AnimatePresence>{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>✓</motion.span>}</AnimatePresence>
    </motion.button>
  );
}
