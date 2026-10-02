import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { EmptyState, Glass } from "../components/glass";
import { CoachPanel, NextBar, StepLayout } from "../components/shell/Wizard";
import { LiveDashboard } from "../components/train/LiveDashboard";
import { TrainResults } from "../components/train/TrainResults";
import { TrainSetup } from "../components/train/TrainSetup";
import { liveProjectId } from "../components/train/util";
import { navigate } from "../lib/router";
import { useJob, useProject } from "../lib/store";

/** View transition; uses variant labels so children with `animate_in` (fadeUp) still receive "show". */
const view = {
  variants: {
    hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" }, transition: { duration: 0.3, staggerChildren: 0.06 } },
    exit: { opacity: 0, y: -10, filter: "blur(6px)", transition: { duration: 0.2 } },
  },
  initial: "hidden",
  animate: "show",
  exit: "exit",
};

export function TrainStep() {
  const project = useProject((s) => s.project)!;
  const result = useProject((s) => s.result);
  const jobId = useJob((s) => s.jobId);
  const kind = useJob((s) => s.kind);
  const status = useJob((s) => s.status);
  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => { useProject.getState().ensureRegistry().catch(() => {}); }, []);
  useEffect(() => { if (status === "running") setShowSetup(false); }, [jobId, status]);

  const mine = kind === "train" && liveProjectId() === project.id;
  const live = mine && (status === "running" || (status === "finished" && result?.job_id !== jobId));
  const mode = live ? "live" : !result || showSetup ? (project.prepared_id ? "setup" : "cta") : "results";

  const img = project.modality === "image";
  const intro = img ? {
    cta: <>Before training, your pictures need to be prepared — resized to one size, split into practice and test pictures, and (optionally) augmented.</>,
    setup: <>Each model studies the <b>training pictures</b>, then sits an exam on <b>test pictures</b> it has never seen. Classic models see the picture as a long list of pixel numbers; <b>convolutional networks</b> slide little pattern detectors over it — watch which approach wins.</>,
    live: <>Watch them learn! <b>Loss</b> is how wrong a model currently is, so you want those lines heading <b>down</b>. Image networks need more epochs than table models — they're inventing their own edge and shape detectors from scratch.</>,
    results: <>Here's how every model did on pictures it never saw. Open a model and look at its <b>Gallery</b> of mistakes and <b>What it looks at</b> — the pictures tell you far more than the score. Save the ones you like and try them on your own drawings in the library.</>,
  }[mode] : {
    cta: <>Before training, your data needs to be prepared — cleaned, split into practice and test rows, and scaled.</>,
    setup: <>Each model studies the <b>training rows</b>, then sits an exam on <b>test rows</b> it has never seen. That exam score is what really counts — anyone can ace questions they've memorised.</>,
    live: <>Watch them learn! <b>Loss</b> is how wrong a model currently is, so you want those lines heading <b>down</b>. If the validation line turns back up while training keeps falling, the model is starting to memorise.</>,
    results: <>Here's how every model did on rows it never saw. A big gap between the <b>train</b> and <b>test</b> score means it memorised instead of learning patterns. Save the ones you like to the library to use them later.</>,
  }[mode];

  return (
    <StepLayout
      title="Train"
      subtitle={mode === "results" ? "The results are in. Compare the models and dig into how each one behaves." : "Send your models off to learn from the data — and watch it happen live."}
      coach={<CoachPanel intro={intro} suggestions={mode === "results" ? result?.coach ?? [] : []} />}
      footer={
        <NextBar back="prepare" next="improve" nextLabel="Improve" nextDisabled={!result}
          status={live ? "Training in progress…" : result ? undefined : "Train once to unlock the Improve step."} />
      }
    >
      <AnimatePresence mode="wait">
        {mode === "cta" && (
          <motion.div key="cta" {...view}>
            <Glass>
              <EmptyState icon="🧪" title="Prepare your data first" text="Your models need cleaned, split data to learn from. It only takes a moment."
                action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/prepare`)}>Go to Prepare →</button>} />
            </Glass>
          </motion.div>
        )}
        {mode === "setup" && (
          <motion.div key="setup" {...view}>
            <TrainSetup onCancel={result ? () => setShowSetup(false) : undefined} />
          </motion.div>
        )}
        {mode === "live" && (
          <motion.div key="live" {...view}>
            <LiveDashboard />
          </motion.div>
        )}
        {mode === "results" && result && (
          <motion.div key="results" {...view}>
            <TrainResults result={result} onOptions={() => setShowSetup(true)} />
          </motion.div>
        )}
      </AnimatePresence>
    </StepLayout>
  );
}
