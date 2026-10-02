import { motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { EmptyState, Glass, InfoTip } from "../components/glass";
import { ProgressOverRuns } from "../components/improve/ProgressOverRuns";
import { ThresholdTuner } from "../components/improve/ThresholdTuner";
import { Tuner } from "../components/improve/Tuner";
import { WaysToImprove } from "../components/improve/WaysToImprove";
import { CoachPanel, NextBar, StepLayout } from "../components/shell/Wizard";
import { navigate } from "../lib/router";
import { useProject } from "../lib/store";

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
