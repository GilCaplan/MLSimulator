import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { Glass } from "../components/glass";
import { CheckDot } from "../components/models/ModelCard";
import { ClassificationArt, RegressionArt } from "../components/models/TaskArt";
import { CoachPanel, NextBar, StepLayout } from "../components/shell/Wizard";
import { fadeUp, spring } from "../design/motion";
import { toast, useProject } from "../lib/store";
import type { Task } from "../lib/types";

const TASKS: { id: Task; title: string; question: string; examples: string[]; art: (active: boolean) => ReactNode; tint: string }[] = [
  {
    id: "classification",
    title: "Classification",
    question: "Which group does it belong to?",
    examples: ["📧 Spam or not spam", "🌸 Which flower species", "👋 Will a customer churn"],
    art: (a) => <ClassificationArt active={a} />,
    tint: "linear-gradient(135deg, rgba(10,132,255,.14), rgba(255,55,95,.12))",
  },
  {
    id: "regression",
    title: "Regression",
    question: "How much? How many?",
    examples: ["🏡 A house's price", "🌡️ Tomorrow's temperature", "📦 Next month's sales"],
    art: (a) => <RegressionArt active={a} />,
    tint: "linear-gradient(135deg, rgba(94,92,230,.14), rgba(191,90,242,.12))",
  },
];

function chooseTask(task: Task) {
  const st = useProject.getState();
  const p = st.project;
  if (!p || p.task === task) return;
  if (p.task) {
    st.update({ task, models: [], pipeline: null, prepared_id: null, last_job_id: null });
    st.setReport(null);
    st.setResult(null);
    if (p.models.length || p.prepared_id || p.last_job_id) toast.info("Switched problem type — model picks and preparation were reset.");
  } else {
    st.update({ task });
  }
}

export function ProblemStep() {
  const task = useProject((s) => s.project?.task ?? null);

  return (
    <StepLayout
      title="What do you want to predict?"
      subtitle="Every machine-learning project starts with one question. Pick the kind of answer you're after."
      coach={
        <CoachPanel
          intro={<>A model learns from examples where the answer is already known, then guesses the answer for new ones.
            <br /><br />The first big choice is <b>what kind of answer</b> it gives: a <b>category</b> (classification) or a <b>number</b> (regression).
            It decides which algorithms and scores make sense later on.</>}
        />
      }
      footer={<NextBar next="models" nextDisabled={!task} status={task ? `Great — we'll build a ${task} model.` : "Choose one to continue"} />}
    >
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        {TASKS.map((t) => {
          const selected = task === t.id;
          return (
            <motion.div key={t.id} variants={fadeUp}>
              <motion.div
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => chooseTask(t.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chooseTask(t.id); } }}
                whileTap={{ scale: 0.985 }}
                animate={{ opacity: task && !selected ? 0.72 : 1 }}
                className={`glass tile${selected ? " selected" : ""}`}
                style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16, height: "100%" }}
              >
                <div style={{ position: "absolute", top: 18, right: 18 }}>
                  <CheckDot checked={selected} size={28} />
                </div>
                <div className="inset" style={{ height: 170, padding: "18px 22px", background: t.tint, borderRadius: 18, overflow: "hidden" }}>
                  {t.art(selected)}
                </div>
                <div className="col" style={{ gap: 4 }}>
                  <span className="eyebrow" style={{ color: selected ? "var(--accent)" : undefined }}>{t.title}</span>
                  <h2 style={{ fontSize: 25 }}>{t.question}</h2>
                </div>
                <div className="col" style={{ gap: 6 }}>
                  {t.examples.map((ex, i) => (
                    <motion.span key={ex} className="row small muted" style={{ gap: 8 }}
                      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.07 }}>
                      {ex}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      <Glass animate_in>
        <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
          <div className="col" style={{ gap: 4, minWidth: 200, flex: "1 1 200px" }}>
            <span className="eyebrow">Not sure?</span>
            <h3>Is the answer a category or a number?</h3>
            <p className="small muted" style={{ lineHeight: 1.55 }}>
              If you could list every possible answer in advance, it's a <b>category</b>. If the answer is a measurement on a scale, it's a
              <b> number</b>. Tap an example to choose.
            </p>
          </div>
          <Examples label="Category → Classification" task="classification" items={["Yes / no", "Cat, dog or bird", "Low · medium · high risk", "Fraud or genuine"]} />
          <Examples label="Number → Regression" task="regression" items={["$312,000", "23.4 °C", "1,240 units", "4.7 stars"]} />
        </div>
      </Glass>
    </StepLayout>
  );
}

function Examples({ label, task, items }: { label: string; task: Task; items: string[] }) {
  const current = useProject((s) => s.project?.task);
  const on = current === task;
  return (
    <div className="inset col" style={{ padding: 14, gap: 10, flex: "1 1 220px", transition: "border-color .2s", borderColor: on ? "var(--accent)" : undefined }}>
      <span className="small" style={{ fontWeight: 650 }}>{label}</span>
      <div className="row wrap" style={{ gap: 6 }}>
        {items.map((it) => (
          <motion.button key={it} whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} transition={spring.snappy}
            className="badge" style={{ border: "none", cursor: "pointer", height: 26, fontSize: 12, background: on ? "var(--accent-soft)" : "var(--glass-strong)", color: on ? "var(--accent)" : "var(--text-2)" }}
            onClick={() => chooseTask(task)}>
            {it}
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {on && (
          <motion.span initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="tiny" style={{ color: "var(--accent)", fontWeight: 600 }}>
            ✓ Selected
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
