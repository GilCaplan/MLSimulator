import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Glass } from "../components/glass";
import { CheckDot } from "../components/models/ModelCard";
import { FORECAST_STARTER } from "../components/models/meta";
import { AnomalyArt, ClassificationArt, ClusteringArt, ForecastArt, ImageClassifyArt, ImageNumberArt, MapArt, RecommendArt, RegressionArt, TextClassifyArt } from "../components/models/TaskArt";
import { CoachPanel, NextBar, StepLayout } from "../components/shell/Wizard";
import { fadeUp, spring, stagger } from "../design/motion";
import { api } from "../lib/api";
import { isUnsupervised, modelConfigFor, toast, useProject } from "../lib/store";
import type { Modality, ProblemType, Project } from "../lib/types";

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
  text_classification: {
    examples: ["⭐ Is a review positive or negative", "📵 Spam or a real message", "🎫 Which team should answer a ticket"],
    art: (a) => <TextClassifyArt active={a} />,
    tint: "linear-gradient(135deg, rgba(48,209,88,.13), rgba(10,132,255,.12))",
  },
  clustering: {
    examples: ["🛍️ Customer segments", "🎵 Songs that sound alike", "🧬 Similar patients or cells"],
    art: (a) => <ClusteringArt active={a} />,
    tint: "linear-gradient(135deg, rgba(10,132,255,.13), rgba(48,209,88,.12))",
  },
  reduction: {
    examples: ["🗺️ See 20 columns at once", "🔍 Spot hidden groups by eye", "🧹 Squash redundant columns"],
    art: (a) => <MapArt active={a} />,
    tint: "linear-gradient(135deg, rgba(191,90,242,.13), rgba(255,159,10,.11))",
  },
  recommendation: {
    examples: ["🎬 Films a viewer will love", "🛒 \u201cCustomers also bought…\u201d", "🎧 The next song in a playlist"],
    art: (a) => <RecommendArt active={a} />,
    tint: "linear-gradient(135deg, rgba(255,214,10,.15), rgba(255,55,95,.11))",
  },
  forecasting: {
    examples: ["🛒 Next month's daily sales", "⚡ Tomorrow's electricity demand", "✈️ Passengers next summer"],
    art: (a) => <ForecastArt active={a} />,
    tint: "linear-gradient(135deg, rgba(10,132,255,.13), rgba(255,159,10,.13))",
  },
  anomaly: {
    examples: ["💳 Odd card transactions", "🏭 Machines about to fail", "🧾 Data-entry mistakes"],
    art: (a) => <AnomalyArt active={a} />,
    tint: "linear-gradient(135deg, rgba(100,210,255,.14), rgba(255,69,58,.11))",
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
function chooseProblem(taskIn: string, modality: Modality) {
  const st = useProject.getState();
  const p = st.project;
  if (!p) return;
  // pictures are always supervised (an unsupervised task falls back to image classification); text is classification only;
  // ratings tables are always recommendation, and recommendation needs a ratings table
  if (taskIn === "recommendation" && modality !== "ratings") taskIn = "classification";
  // forecasting always learns from values over time, and values over time are always forecast
  if (taskIn === "forecasting" && modality !== "timeseries") taskIn = "classification";
  if (modality === "timeseries" && taskIn !== "forecasting") {
    if (taskIn === "classification" || taskIn === "regression" || isUnsupervised(taskIn) || taskIn === "recommendation") modality = taskIn === "recommendation" ? "ratings" : "tabular";
    else taskIn = "forecasting";
  }
  if (modality === "ratings" && taskIn !== "recommendation") {
    if (taskIn === "classification" || taskIn === "regression" || isUnsupervised(taskIn)) modality = "tabular";
    else taskIn = "recommendation";
  }
  const task = ((modality === "image" && isUnsupervised(taskIn)) || modality === "text" ? "classification" : taskIn) as NonNullable<Project["task"]>;
  if (modality === "text" && taskIn !== "classification") toast.info("Text projects sort messages into categories — predicting numbers from text is coming later.");
  const sameTask = p.task === task;
  const sameModality = modalityOf(p.modality) === modality;
  if (sameTask && sameModality) return;
  if (!p.task) {
    st.update({ task, modality });
    if (task === "forecasting") seedForecastModels();
    return;
  }
  const patch: Partial<typeof p> = { task, modality, models: [], pipeline: null, prepared_id: null, last_job_id: null };
  // the answer column and the hidden "truth" column are the same idea seen from two sides: carry it across
  const toUnsup = isUnsupervised(task), fromUnsup = isUnsupervised(p.task);
  if (toUnsup && !fromUnsup && p.target && !p.truth) patch.truth = p.target;
  if (!toUnsup && fromUnsup && !p.target && p.truth) patch.target = p.truth;
  // a table can't feed an image or text model (and vice versa): forget the dataset too
  if (!sameModality) Object.assign(patch, { dataset_id: null, target: null, truth: null });
  st.update(patch);
  if (task === "forecasting") seedForecastModels();
  st.setReport(null);
  st.setResult(null);
  if (!sameModality) { st.setDataset(null); st.setProfile(null); }
  if (p.models.length || p.prepared_id || p.last_job_id || (!sameModality && p.dataset_id)) {
    toast.info(sameModality ? "Switched problem type — model picks and preparation were reset." : "Switched to a different kind of data — models, data and preparation were reset.");
  }
}

/** A new forecasting project starts with a sensible line-up (the seasonal-naive baseline is added at training anyway). */
function seedForecastModels() {
  const st = useProject.getState();
  st.ensureRegistry()
    .then((reg) => {
      const p = useProject.getState().project;
      if (!p || p.task !== "forecasting" || p.models.length) return;
      const models = FORECAST_STARTER.map((id) => reg.find((s) => s.id === id)).filter((s) => !!s).map((s) => modelConfigFor(s!));
      if (models.length) useProject.getState().update({ models });
    })
    .catch(() => { /* the Models step offers the starter set too */ });
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
    ? current.task === "forecasting"
      ? <>Great — we'll learn from the <b>past</b> and forecast <b>what comes next</b>.</>
      : current.task === "recommendation"
      ? <>Great — we'll learn people's <b>tastes</b> and suggest what they'll like next.</>
      : current.unsupervised
      ? <>Great — no answers needed. We'll explore: <b>{current.question.replace(/\?$/, "").toLowerCase()}?</b></>
      : <>Great — we'll build {/^[aeiou]/i.test(current.label) ? "an" : "a"} <b>{current.label.toLowerCase()}</b> model.</>
    : "Choose one to continue";
  const discover = problems.filter((p) => p.unsupervised && p.enabled);

  return (
    <StepLayout
      title="What do you want to find out?"
      subtitle="Every machine-learning project starts with one question. Predict an answer you already have examples of — or discover structure nobody has labelled yet."
      coach={
        <CoachPanel
          intro={<>A model learns from examples where the answer is already known, then guesses the answer for new ones.
            <br /><br />The first big choice is <b>what kind of answer</b> it gives: a <b>category</b> (classification) or a <b>number</b> (regression).
            <br /><br />The second is <b>what the examples are</b>: rows in a table, <b>pictures</b>, or <b>sentences</b>. Together they decide which algorithms and scores make sense later on.
            <br /><br />No answer column at all? That's <b>unsupervised learning</b> — the <b>Discover</b> problems find groups, draw a map of your data or flag the odd rows out, all without being told what's right.
            <br /><br />Got <b>values measured over time</b> — sales per day, visitors per hour? That's <b>forecasting</b>: learn the trend and the rhythm, then continue the line into the future.
            <br /><br />Got <b>people</b> and the <b>things they rated or bought</b>? That's a <b>recommender</b> — it learns tastes and fills in the blanks: what would this person rate highly that they haven't seen yet?</>}
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
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 18 }}>
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
          <h3>A few quick questions</h3>
        </div>
        <div className="row wrap" style={{ gap: 14, alignItems: "stretch" }}>
          <div className="inset col" style={{ padding: 14, gap: 10, flex: "2 1 380px" }}>
            <span className="small" style={{ fontWeight: 650 }}>1 · Is the answer a category or a number?</span>
            <p className="tiny muted" style={{ lineHeight: 1.55 }}>
              If you could list every possible answer in advance, it's a <b>category</b>. If it's a measurement on a scale, it's a <b>number</b>.
            </p>
            <div className="row wrap" style={{ gap: 10, alignItems: "flex-start" }}>
              <Examples label="Category → Classification" on={task === "classification"} onPick={() => chooseProblem("classification", modality)}
                items={modality === "image" ? ["Cat or dog", "Digit 0–9", "Ripe or not"] : modality === "text" ? ["Positive or negative", "Spam or not", "Billing · tech · shipping"] : ["Yes / no", "Cat, dog or bird", "Low · medium · high risk", "Fraud or genuine"]} />
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
          <TextQuestion on={modality === "text" && !!task} />
          <DiscoverQuestion problems={discover} task={task} />
          <RecommendQuestion on={task === "recommendation"} available={problems.some((p) => p.id === "recommendation" && p.enabled)} />
          <ForecastQuestion on={task === "forecasting"} available={problems.some((p) => p.id === "forecasting" && p.enabled)} />
        </div>
      </Glass>
    </StepLayout>
  );
}

/** "Is your data sentences / messages?" → Language. Text projects are always classification. */
function TextQuestion({ on }: { on: boolean }) {
  return (
    <div className="inset col" style={{ padding: 14, gap: 10, flex: "1 1 240px", transition: "border-color .2s", borderColor: on ? "var(--accent)" : undefined }}>
      <span className="small" style={{ fontWeight: 650 }}>3 · Is your data sentences / messages?</span>
      <p className="tiny muted" style={{ lineHeight: 1.55 }}>
        Reviews, emails, chat messages or support tickets → <b>Language</b>. The model learns which <b>words</b> point to which answer.
      </p>
      <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
        {["“the battery is not great”", "“WIN a free prize”"].map((t, i) => (
          <motion.span key={t} className="badge" animate={{ y: [0, -2, 0] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.4 }}
            style={{ height: 24, fontSize: 11.5, borderRadius: "12px 12px 12px 4px", background: on ? "var(--accent-soft)" : "var(--glass-strong)", color: on ? "var(--accent)" : "var(--text-2)" }}>
            {t}
          </motion.span>
        ))}
        <div className="row" style={{ marginLeft: "auto", minWidth: 150 }}><PictureButton on={on} onClick={() => chooseProblem("classification", "text")}>💬 Yes, text</PictureButton></div>
      </div>
    </div>
  );
}

/** "People + things they rated or bought? → Recommend". */
function RecommendQuestion({ on, available }: { on: boolean; available: boolean }) {
  if (!available) return null;
  return (
    <div className="inset row wrap" style={{ padding: 14, gap: 14, flex: "1 1 100%", transition: "border-color .2s", borderColor: on ? "var(--accent)" : undefined }}>
      <div className="col" style={{ gap: 6, flex: "2 1 300px" }}>
        <span className="small" style={{ fontWeight: 650 }}>5 · Do you have people + things they rated or bought?</span>
        <span className="tiny muted" style={{ lineHeight: 1.55 }}>
          A list of <b>who</b> liked <b>what</b> — viewers and films, shoppers and products, listeners and songs → <b>Recommend</b>.
          The model fills in the blanks of a huge, mostly-empty grid.
        </span>
      </div>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        {[["👤", "🎬", "★★★★★"], ["👤", "🛒", "bought"], ["👤", "🎧", "★★★★"]].map(([who, what, how], i) => (
          <motion.span key={i} className="badge" animate={{ y: [0, -2, 0] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.35 }}
            style={{ height: 24, fontSize: 11, gap: 4, background: on ? "var(--accent-soft)" : "var(--glass-strong)", color: on ? "var(--accent)" : "var(--text-2)" }}>
            {who}<span className="faint">→</span>{what}<span style={{ color: "#FFB800", fontWeight: 700 }}>{how}</span>
          </motion.span>
        ))}
      </div>
      <div className="row" style={{ minWidth: 170 }}><PictureButton on={on} onClick={() => chooseProblem("recommendation", "ratings")}>🎬 Yes → Recommend</PictureButton></div>
    </div>
  );
}

/** "Values measured over time? → Forecast". */
function ForecastQuestion({ on, available }: { on: boolean; available: boolean }) {
  if (!available) return null;
  const bars = [0.5, 0.42, 0.55, 0.62, 0.78, 1, 0.7, 0.52, 0.45, 0.6];
  return (
    <div className="inset row wrap" style={{ padding: 14, gap: 14, flex: "1 1 100%", transition: "border-color .2s", borderColor: on ? "var(--accent)" : undefined }}>
      <div className="col" style={{ gap: 6, flex: "2 1 300px" }}>
        <span className="small" style={{ fontWeight: 650 }}>6 · Do you have one number measured again and again over time?</span>
        <span className="tiny muted" style={{ lineHeight: 1.55 }}>
          Sales per day, visitors per hour, passengers per month → <b>Forecast</b>. The model learns the trend and the rhythm of the past, then continues the line.
        </span>
      </div>
      <div className="row" style={{ gap: 3, alignItems: "flex-end", height: 34 }}>
        {bars.map((h, i) => (
          <motion.span key={i} animate={{ scaleY: [1, 0.85, 1] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.12 }}
            style={{ width: 7, height: 34 * h, borderRadius: 3, transformOrigin: "bottom", background: i >= 7 ? "var(--warning)" : on ? "var(--accent)" : "var(--fill-2)", opacity: i >= 7 ? 0.75 : 1 }} />
        ))}
      </div>
      <div className="row" style={{ minWidth: 170 }}><PictureButton on={on} onClick={() => chooseProblem("forecasting", "timeseries")}>⏱️ Yes → Forecast</PictureButton></div>
    </div>
  );
}

/** "No answer column? → Discover": the way into unsupervised learning. */
function DiscoverQuestion({ problems, task }: { problems: ProblemType[]; task: string | null }) {
  const on = isUnsupervised(task);
  if (!problems.length) return null;
  return (
    <div className="inset col" style={{ padding: 14, gap: 10, flex: "1 1 100%", transition: "border-color .2s", borderColor: on ? "var(--accent)" : undefined }}>
      <div className="row wrap" style={{ gap: 10, alignItems: "baseline" }}>
        <span className="small" style={{ fontWeight: 650 }}>4 · Is there an answer column at all?</span>
        <span className="tiny muted" style={{ lineHeight: 1.55 }}>
          No answer column? → <b>Discover</b>. The model looks for structure on its own — you judge whether it makes sense.
        </span>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {problems.map((p) => {
          const active = task === p.task;
          return (
            <motion.button key={p.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} transition={spring.snappy}
              className={`btn sm${active ? " primary" : ""}`} onClick={() => chooseProblem(p.task, "tabular")}>
              <span>{p.emoji}</span> {p.question}
              <AnimatePresence>{active && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>✓</motion.span>}</AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function ProblemTile({ problem, selected, dim }: { problem: ProblemType; selected: boolean; dim: boolean }) {
  const look = LOOK[problem.id] ?? { examples: [], tint: "var(--fill)" };
  const pick = () => chooseProblem(problem.task, problem.modality);
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
          {problem.unsupervised && <span className="tiny faint">No answer column needed</span>}
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
