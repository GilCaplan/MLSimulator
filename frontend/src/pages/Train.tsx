import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { EmptyState, Glass } from "../components/glass";
import { CoachPanel, NextBar, StepLayout, useStepLabel } from "../components/shell/Wizard";
import { LiveDashboard } from "../components/train/LiveDashboard";
import { TrainResults } from "../components/train/TrainResults";
import { TrainSetup } from "../components/train/TrainSetup";
import { SaveHint, SaveModelButton, SaveStrip } from "../components/train/save/SaveEntry";
import { isForecast, isRecsys, liveProjectId } from "../components/train/util";
import { navigate } from "../lib/router";
import { isUnsupervised, useJob, useProject } from "../lib/store";

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
  const stepLabel = useStepLabel("train");
  const nextLabel = useStepLabel("improve");
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
  const txt = project.modality === "text";
  const unsup = isUnsupervised(project.task);
  const rec = isRecsys(project.task);
  const fc = isForecast(project.task);
  const intro = fc ? {
    cta: <>Before training, your series needs to be prepared — the time, value and series columns chosen, clues like lags and calendar flags built from the past, and the last stretch of time hidden away for the exam.</>,
    setup: <>Each model learns to guess <b>the next step</b> from what came before. The exam: we hide the <b>last stretch</b> of the series and ask for a forecast of all of it — <b>one guess feeding the next</b>, like a real forecast. <b>Same as last season</b> (next Monday = last Monday) is the baseline to beat.</>,
    live: <>Most forecasters learn in one go. The <b>GRU</b> learns epoch by epoch: watch its training and validation loss fall. Those losses are one-step errors — the real exam is the multi-step forecast that comes after.</>,
    results: <>Rank by <b>MAE</b> — the average miss in your series' own units. <b>MASE</b> below 1 means a model beats “same as last season”. Open a model's <b>Forecast</b> to see its guesses against what really happened, and <b>Error growth</b> to watch errors snowball further ahead.</>,
  }[mode] : rec ? {
    cta: <>Before training, your ratings need to be prepared — viewers and films with too few ratings filtered out, and each viewer's most recent ratings hidden away for the exam.</>,
    setup: <>Each model studies <b>who rated what</b>, then writes a <b>top-10 list</b> for every viewer. The exam: how many of the films each viewer rated (and liked) <i>most recently</i> made their list? <b>Most popular</b> gives everyone the same list — it's the baseline to beat.</>,
    live: <>Most recommenders learn in one go. <b>Matrix factorisation</b> learns step by step: every round it refines a hidden “taste vector” for each viewer and film, and the <b>RMSE</b> lines show its star-guesses getting closer.</>,
    results: <>Look past the top score: <b>coverage</b> tells you how much of the catalogue ever gets shown, and the <b>Long tail</b> tab shows whether a model only pushes blockbusters. Open <b>Recommendations</b> to see real top-10 lists — ✓ marks a film the viewer really went on to like.</>,
  }[mode] : unsup ? {
    cta: <>Before exploring, your data needs to be prepared — cleaned and scaled so every column speaks the same language. (There's nothing to predict, so no test split is needed.)</>,
    setup: project.task === "clustering"
      ? <>No answers this time: each model looks at the rows and tries to find <b>natural groups</b> on its own. If you kept a hidden <b>truth</b> column, we'll peek at it afterwards to see how well the groups match reality.</>
      : project.task === "anomaly"
        ? <>Each detector studies all the rows to learn what <b>normal</b> looks like, then gives every row an <b>unusualness score</b>. The highest scores get flagged.</>
        : <>Each model squashes all your columns onto a flat <b>2-D map</b>. Good maps keep rows that are similar close together — so you can <i>see</i> the shape of your data.</>,
    live: project.task === "clustering"
      ? <>Watch <b>k-means walk</b>: every point joins its nearest centre, then each centre moves to the middle of its points. Repeat until nothing moves any more. The <b>inertia</b> line shows the groups getting tighter.</>
      : <>The models are exploring your data. These ones work in one go, so there's no step-by-step curve to watch — the results are worth the wait.</>,
    results: project.task === "clustering"
      ? <>Open a model's <b>Map</b> to see its groups, <b>Profiles</b> to learn what makes each group different, and <b>Truth check</b> to compare them with the real categories you hid. A high silhouette means crisp groups — not necessarily meaningful ones.</>
      : project.task === "anomaly"
        ? <>Look at the <b>Scores</b> histogram: real anomalies should pile up to the right of the threshold. Then check the <b>Top anomalies</b> — do they look genuinely strange?</>
        : <>Explore each <b>Map</b>. Colours (from your hidden truth column) that form clean islands mean the structure survived the squashing. For PCA, the <b>Scree</b> plot shows how many directions really matter.</>,
  }[mode] : img ? {
    cta: <>Before training, your pictures need to be prepared — resized to one size, split into practice and test pictures, and (optionally) augmented.</>,
    setup: <>Each model studies the <b>training pictures</b>, then sits an exam on <b>test pictures</b> it has never seen. Classic models see the picture as a long list of pixel numbers; <b>convolutional networks</b> slide little pattern detectors over it — watch which approach wins.</>,
    live: <>Watch them learn! <b>Loss</b> is how wrong a model currently is, so you want those lines heading <b>down</b>. Image networks need more epochs than table models — they're inventing their own edge and shape detectors from scratch.</>,
    results: <>Here's how every model did on pictures it never saw. Open a model and look at its <b>Gallery</b> of mistakes and <b>What it looks at</b> — the pictures tell you far more than the score. Save the ones you like and try them on your own drawings in the library.</>,
  }[mode] : txt ? {
    cta: <>Before training, your texts need to be prepared — split into words, given a vocabulary, and split into practice and test messages.</>,
    setup: <>Each model studies the <b>training messages</b>, then sits an exam on <b>test messages</b> it has never seen. Word-count models (logistic regression, naive Bayes) weigh each word; <b>neural readers</b> (GRU, Transformer) learn what words mean in context — watch which approach wins.</>,
    live: <>Watch them learn! <b>Loss</b> is how wrong a model currently is, so you want those lines heading <b>down</b>. The word-count models finish in a blink; the neural readers learn a vector for every word, epoch by epoch.</>,
    results: <>Here's how every model did on messages it never saw. Open a model to read its <b>Mistakes</b>, the <b>Words</b> it relies on, and <b>Explanations</b> that colour each word by how much it mattered. Save one and type your own sentences in the library.</>,
  }[mode] : {
    cta: <>Before training, your data needs to be prepared — cleaned, split into practice and test rows, and scaled.</>,
    setup: <>Each model studies the <b>training rows</b>, then sits an exam on <b>test rows</b> it has never seen. That exam score is what really counts — anyone can ace questions they've memorised.</>,
    live: <>Watch them learn! <b>Loss</b> is how wrong a model currently is, so you want those lines heading <b>down</b>. If the validation line turns back up while training keeps falling, the model is starting to memorise.</>,
    results: <>Here's how every model did on rows it never saw. A big gap between the <b>train</b> and <b>test</b> score means it memorised instead of learning patterns. Save the ones you like to the library to use them later.</>,
  }[mode];

  return (
    <StepLayout
      title={stepLabel}
      subtitle={mode === "results" ? "The results are in. Compare the models and dig into how each one behaves." : fc ? "Teach your models the rhythm of the series — then see whose forecast of the hidden future comes closest." : rec ? "Teach your models who likes what — then see whose top-10 lists hit the mark." : unsup ? "Let your models explore the data on their own — and watch what they discover." : "Send your models off to learn from the data — and watch it happen live."}
      coach={<CoachPanel intro={intro} suggestions={mode === "results" ? result?.coach ?? [] : []} extra={mode === "results" ? <SaveHint result={result} /> : undefined} />}
      footer={
        <>
          <NextBar back="prepare"
            status={live ? (unsup ? "Exploring…" : "Training in progress…") : result ? undefined : unsup ? `Run once to unlock the ${nextLabel} step.` : `Train once to unlock the ${nextLabel} step.`} />
          {result && !live && (
            <SaveModelButton result={result} className="btn" finish title="Save a model to your library and stop here — improving is optional">💾 Save & finish</SaveModelButton>
          )}
          <NextBar next="improve" nextLabel={nextLabel} nextDisabled={!result} />
        </>
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
          <motion.div key="results" {...view} className="col" style={{ gap: 16 }}>
            <SaveStrip result={result} />
            <TrainResults result={result} onOptions={() => setShowSetup(true)} />
          </motion.div>
        )}
      </AnimatePresence>
    </StepLayout>
  );
}
