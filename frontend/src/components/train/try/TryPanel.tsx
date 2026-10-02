import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { useProject } from "../../../lib/store";
import type { ModelResult, RunResult, TryExample, TryInputs } from "../../../lib/types";
import { Segmented } from "../../glass";
import { useSaved } from "../util";
import { OwnInput } from "./OwnInput";
import { RandomExample, type TryContext } from "./RandomExample";
import { nounFor } from "./tryKit";

type Mode = "random" | "own";

const GENERIC_SAMPLES = [
  "I absolutely loved it, would recommend to anyone!",
  "Terrible. It broke after one day and nobody answered my emails.",
  "It was okay, nothing special but not bad either.",
];

/**
 * "Try it": test a trained (not yet saved) model by hand — random examples from the hidden test set (optionally of one
 * class) or your own picture / message / row. Works for classification and regression on tables, images and text.
 */
export function TryPanel({ result, model, compact }: { result: RunResult; model: ModelResult; compact?: boolean }) {
  const [info, setInfo] = useState<TryInputs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("random");
  const [seed, setSeed] = useState<TryExample["input"] | null>(null);
  const [visitedOwn, setVisitedOwn] = useState(false);
  useEffect(() => { if (mode === "own") setVisitedOwn(true); }, [mode]);
  const savedId = useSaved((s) => s.saved[`${result.job_id}:${model.key}`]);
  const projectModality = useProject((s) => s.project?.modality);

  useEffect(() => {
    let live = true;
    setInfo(null); setError(null); setSeed(null); setMode("random"); setVisitedOwn(false);
    api.tryInputs(result.job_id, model.key)
      .then((r) => live && setInfo(r))
      .catch((e) => live && setError(e instanceof ApiError || e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [result.job_id, model.key]);

  const range = useMemo<[number, number] | null>(() => {
    const pts = model.residuals?.points;
    if (result.task !== "regression" || !pts?.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { lo = Math.min(lo, p.t); hi = Math.max(hi, p.t); }
    return Number.isFinite(lo) ? [lo, hi] : null;
  }, [model, result.task]);

  const samples = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of [...(model.text?.examples ?? []), ...(model.text?.mistakes ?? [])]) {
      if (!seen.has(e.text) && e.text.length < 220) { seen.add(e.text); out.push(e.text); }
    }
    return out.length ? out.slice(0, 6) : GENERIC_SAMPLES;
  }, [model]);

  if (error) {
    return (
      <div className="col center" style={{ padding: "34px 20px", gap: 10, textAlign: "center" }}>
        <motion.span animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 3, repeatDelay: 1 }} style={{ fontSize: 40 }}>🧪</motion.span>
        <h3>Hand-testing isn't available here</h3>
        <p className="small muted" style={{ maxWidth: 440, lineHeight: 1.55 }}>{error}</p>
        {savedId ? (
          <button className="btn primary" onClick={() => navigate(`/library/${savedId}`)}>Open its playground in the library →</button>
        ) : (
          <span className="small muted">Save the model, then play with it in the <b>Model Library</b> playground.</span>
        )}
      </div>
    );
  }

  const modality = info?.modality ?? projectModality ?? "tabular";
  const ctx: TryContext = {
    jobId: result.job_id, modelKey: model.key, modality, task: info?.task ?? result.task,
    classes: info?.classes ?? result.classes ?? null, range,
  };
  const ownLabel = modality === "image" ? "✏️ Your own picture" : modality === "text" ? "✍️ Your own message" : "✍️ Your own values";

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 560 }}>
          {compact ? "Check it by hand before you keep it." : "Test it by hand before you save it."} Pull a random {nounFor(modality)} from the <b>hidden test set</b> and compare its answer with the truth — or give it one of your own.
        </p>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "random", label: "🎲 Test examples" }, { value: "own", label: ownLabel }]} />
      </div>
      {!info ? (
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6 }}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ width: 80, height: 28, borderRadius: 999 }} />)}</div>
          <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
        </div>
      ) : (
        <>
          <Pane on={mode === "random"}>
            <RandomExample ctx={ctx} compact={compact} active={mode === "random"} onEdit={(input) => { setSeed({ ...input }); setMode("own"); }} />
          </Pane>
          {(visitedOwn || mode === "own") && (
            <Pane on={mode === "own"}>
              <OwnInput ctx={ctx} schema={info.input_schema ?? []} samples={samples} seed={seed} compact={compact} />
            </Pane>
          )}
        </>
      )}
    </div>
  );
}

/** Keeps both modes mounted (so the tally and your drawing survive switching) and fades the visible one in. */
function Pane({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <motion.div initial={false} animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }} transition={{ duration: 0.22 }} style={{ display: on ? "block" : "none" }}>
      {children}
    </motion.div>
  );
}
