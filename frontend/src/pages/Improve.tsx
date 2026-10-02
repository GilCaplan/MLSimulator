import { motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { EmptyState, Glass, InfoTip } from "../components/glass";
import { KSweep } from "../components/improve/KSweep";
import { ProgressOverRuns } from "../components/improve/ProgressOverRuns";
import { ThresholdTuner } from "../components/improve/ThresholdTuner";
import { Tuner } from "../components/improve/Tuner";
import { UnsupWays } from "../components/improve/UnsupWays";
import { WaysToImprove } from "../components/improve/WaysToImprove";
import { CoachPanel, NextBar, StepLayout, useStepLabel } from "../components/shell/Wizard";
import { navigate } from "../lib/router";
import { isUnsupervised, useProject } from "../lib/store";
import type { Project, RunResult } from "../lib/types";

function Section({ icon, title, help, sub, children, sectionRef }: { icon: string; title: string; help?: ReactNode; sub?: ReactNode; children: ReactNode; sectionRef?: React.Ref<HTMLDivElement> }) {
  return (
    <Glass animate_in ref={sectionRef} style={{ scrollMarginTop: 16 }}>
      <div className="col" style={{ gap: 2, marginBottom: 14 }}>
        <h3 className="row" style={{ gap: 8 }}><span>{icon}</span>{title}{help && <InfoTip text={help} />}</h3>
        {sub && <span className="small muted">{sub}</span>}
      </div>
      {children}
    </Glass>
  );
}

export function ImproveStep() {
  const unsup = useProject((s) => isUnsupervised(s.project?.task));
  return unsup ? <RefineStep /> : <SupervisedImprove />;
}

const REFINE_COPY: Record<string, { sub: string; intro: React.ReactNode }> = {
  clustering: {
    sub: "How many groups are really in there? Sweep k, compare the scores, and sharpen the grouping.",
    intro: <>With no answer key, “better” means <b>tidier groups</b>: rows close to their own group and far from the others. That's what the <b>silhouette</b> score measures.
      <br /><br />The <b>k sweep</b> tries every number of groups in a range so you can see where the structure is strongest. If your data has a hidden truth, you'll also see which k matches reality.</>,
  },
  reduction: {
    sub: "Make the map more trustworthy: better scaling, fewer noisy columns and the right settings.",
    intro: <>A good map keeps <b>neighbours together</b> — that's what <b>trustworthiness</b> measures (1 = every close pair on the map is close in the real data too).
      <br /><br />Change one thing at a time, run it again, and compare the maps.</>,
  },
  anomaly: {
    sub: "Catch more real oddities with fewer false alarms: tune the alarm level and compare detectors.",
    intro: <>An anomaly detector gives every row a <b>weirdness score</b>; the alarm level decides where “unusual” starts.
      <br /><br />With a hidden truth you can see how well the scores rank the real faults (<b>ROC AUC</b>). Without one, look for rows that several detectors agree on.</>,
  },
};

/** Clustering / reduction / anomaly: k sweep (clustering) + task-specific ways to improve. */
function RefineStep() {
  const project = useProject((s) => s.project)!;
  const result = useProject((s) => s.result);
  const title = useStepLabel("improve");
  const trainLabel = useStepLabel("train");
  const sweepRef = useRef<HTMLDivElement>(null);
  useEffect(() => { useProject.getState().ensureRegistry().catch(() => {}); }, []);
  const task = project.task as string;
  const copy = REFINE_COPY[task] ?? REFINE_COPY.clustering;
  return (
    <StepLayout
      title={title}
      subtitle={copy.sub}
      coach={<CoachPanel intro={copy.intro} suggestions={(result?.coach ?? []).filter((s) => !(s.action?.kind === "goto" && s.action.step === "improve"))} />}
      footer={<NextBar back="train" next={() => navigate("/library")} nextLabel="Open library" />}
    >
      {!result ? (
        <Glass animate_in>
          <EmptyState icon="🔭" title={`${trainLabel} first`} text="Once your models have found some structure, this page helps you sharpen it."
            action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/train`)}>Go to {trainLabel} →</button>} />
        </Glass>
      ) : (
        <RefineSections project={project} result={result} task={task} sweepRef={sweepRef} />
      )}
    </StepLayout>
  );
}

function RefineSections({ project, result, task, sweepRef }: { project: Project; result: RunResult; task: string; sweepRef: React.RefObject<HTMLDivElement | null> }) {
  const toSweep = () => sweepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <>
      {task === "clustering" && (
        <Section icon="🔎" title="How many groups? The k sweep" sectionRef={sweepRef}
          help="Most clustering algorithms need to be told how many groups (k) to find. The sweep tries a whole range of k and scores each one, so the data can tell you."
          sub="Try a range of k, watch the scores arrive, and adopt the best one.">
          <KSweep result={result} />
        </Section>
      )}
      <Section icon="📈" title="Progress over runs" sub="The best score from each time you ran the models.">
        <ProgressOverRuns project={project} />
      </Section>
      <Section icon="💡" title="Ways to improve" sub="Classic moves for unsupervised learning. Click one to jump to the right step.">
        <UnsupWays projectId={project.id} task={task} onSweep={toSweep} />
      </Section>
      <motion.div style={{ height: 8 }} />
    </>
  );
}

function SupervisedImprove() {
  const project = useProject((s) => s.project)!;
  const result = useProject((s) => s.result);
  const tuneKey = useProject((s) => s.tuneKey);
  const tuneRef = useRef<HTMLDivElement>(null);
  useEffect(() => { useProject.getState().ensureRegistry().catch(() => {}); }, []);
  const scrollToTuner = () => tuneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  useEffect(() => {
    if (tuneKey && result) setTimeout(scrollToTuner, 350);
  }, [tuneKey, result]);

  const binary = result?.task === "classification" && result.classes?.length === 2 && Object.values(result.models).some((m) => !m.baseline && m.thresholds?.length);

  return (
    <StepLayout
      title="Improve"
      subtitle="Track your progress, let the computer search for better settings, and learn the tricks that make models better."
      coach={
        <CoachPanel
          intro={<>Improving a model is a loop: <b>change one thing</b>, train again, and compare. The chart on this page keeps score across your runs so you can see what actually helped.</>}
          suggestions={result?.coach ?? []}
        />
      }
      footer={<NextBar back="train" next={() => navigate("/library")} nextLabel="Open library" />}
    >
      {!result ? (
        <Glass animate_in>
          <EmptyState icon="🚀" title="Train some models first" text="Once you have results, this page helps you tune them and track progress over runs."
            action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/train`)}>Go to Train →</button>} />
        </Glass>
      ) : (
        <>
          <Section icon="📈" title="Progress over runs" sub="The best test score from each time you trained.">
            <ProgressOverRuns project={project} />
          </Section>

          <Section icon="🎛️" title="Automatic tuning" sectionRef={tuneRef}
            help="Every model has knobs (hyperparameters). Tuning tries many combinations, scores each with cross-validation on the training rows, and keeps the winner — so your test rows stay a fair final exam."
            sub="Let the computer try lots of settings for you and keep the best.">
            <Tuner result={result} />
          </Section>

          {binary && (
            <Section icon="🚦" title="Decision threshold" help="Only for yes/no problems: choose how sure the model must be before it says “yes”." sub="Trade false alarms against missed cases.">
              <ThresholdTuner result={result} />
            </Section>
          )}

          <Section icon="💡" title="Ways to improve" sub="Classic moves that data scientists reach for. Click one to jump to the right step.">
            <WaysToImprove projectId={project.id} onTune={scrollToTuner} />
          </Section>
          <motion.div style={{ height: 8 }} />
        </>
      )}
    </StepLayout>
  );
}
