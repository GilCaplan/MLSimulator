import { MotionConfig } from "framer-motion";
import { useEffect, useState, type ComponentType } from "react";
import { EmptyState, Spinner } from "./components/glass";
import { AppShell } from "./components/shell/AppShell";
import { WizardFrame } from "./components/shell/Wizard";
import { navigate, useRouter } from "./lib/router";
import { useProject, useUI } from "./lib/store";
import { resumeRunningJob } from "./components/train/util";
import type { StepId } from "./lib/types";
import { HomePage } from "./pages/Home";
import { ProblemStep } from "./pages/Problem";
import { ModelsStep } from "./pages/Models";
import { DataStep } from "./pages/Data";
import { PrepareStep } from "./pages/Prepare";
import { TrainStep } from "./pages/Train";
import { ImproveStep } from "./pages/Improve";
import { LibraryPage } from "./pages/Library";
import { ModelPage } from "./pages/ModelDetail";
import { SettingsPage } from "./pages/Settings";
import { LessonsPage } from "./pages/Lessons";
import { LessonPage } from "./pages/Lesson";

const STEP_PAGES: Record<StepId, ComponentType> = {
  problem: ProblemStep,
  models: ModelsStep,
  data: DataStep,
  prepare: PrepareStep,
  train: TrainStep,
  improve: ImproveStep,
};

function Wizard({ projectId, step }: { projectId: string; step: string }) {
  const project = useProject((s) => s.project);
  const load = useProject((s) => s.load);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    load(projectId).then(() => resumeRunningJob(projectId)).catch((e) => setError(String(e.message || e)));
  }, [projectId, load]);
  useEffect(() => {
    if (project && project.id === projectId && project.step !== step && step in STEP_PAGES) useProject.getState().update({ step: step as StepId });
  }, [project?.id, projectId, step]);
  if (error) return <EmptyState icon="🧭" title="Project not found" text={error} action={<button className="btn primary" onClick={() => navigate("/")}>Back to projects</button>} />;
  if (!project || project.id !== projectId) return <div className="row center" style={{ height: "100%" }}><Spinner size={28} /></div>;
  const Page = STEP_PAGES[(step as StepId) in STEP_PAGES ? (step as StepId) : "problem"];
  return (
    <WizardFrame step={step as StepId}>
      <Page />
    </WizardFrame>
  );
}

export function App() {
  const route = useRouter((s) => s.route);
  const reduceMotion = useUI((s) => s.reduceMotion);
  let page;
  switch (route.name) {
    case "wizard": page = <Wizard projectId={route.projectId} step={route.step} />; break;
    case "library": page = <LibraryPage />; break;
    case "model": page = <ModelPage modelId={route.modelId} />; break;
    case "settings": page = <SettingsPage />; break;
    case "lessons": page = <LessonsPage />; break;
    case "lesson": page = <LessonPage lessonId={route.lessonId} />; break;
    default: page = <HomePage />;
  }
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <AppShell>{page}</AppShell>
    </MotionConfig>
  );
}
