import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../lib/store";
import type { PrepareReport } from "../../lib/types";
import { Scatter, extent } from "../charts";
import { Glass, InfoTip, Segmented } from "../glass";

type View = "before" | "after";

/** One scatter that flips between the training rows before and after resampling, on a fixed shared frame. */
export function BeforeAfter({ report }: { report: PrepareReport }) {
  const reduce = useUI((s) => s.reduceMotion);
  const changed = report.added > 0 || report.removed > 0;
  const [view, setView] = useState<View>(changed ? "after" : "before");
  const [playing, setPlaying] = useState(false);

  // Reset when a new report arrives: start on "before" and flip to "after" so the change is visible.
  useEffect(() => {
    if (!changed) { setView("before"); return; }
    setView("before");
    const t = setTimeout(() => setView("after"), reduce ? 0 : 700);
    return () => clearTimeout(t);
  }, [report.prepared_id, changed, reduce]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setView((v) => (v === "before" ? "after" : "before")), 2200);
    return () => clearInterval(t);
  }, [playing]);

  const domain = useMemo(() => {
    const all = [...report.before_points, ...report.after_points];
    const pad = (e: [number, number]): [number, number] => { const d = (e[1] - e[0]) * 0.04; return [e[0] - d, e[1] + d]; };
    return { x: pad(extent(all.map((p) => p.x))), y: pad(extent(all.map((p) => p.y))) };
  }, [report]);

  const points = view === "before" ? report.before_points : report.after_points;
  const nSyn = report.after_points.filter((p) => p.synthetic).length;

  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 10, marginBottom: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>Training rows, before → after</h3>
          <InfoTip text="Your data has many columns, so we squash every row down to 2 dimensions (PCA) to draw it. Dots that are close together are similar rows. Both views share the same axes, so kept rows stay still." />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Segmented<View>
            size="sm"
            value={view}
            onChange={(v) => { setPlaying(false); setView(v); }}
            options={[{ value: "before", label: "Before" }, { value: "after", label: "After", disabled: !changed }]}
          />
          <motion.button className="btn sm" disabled={!changed} whileTap={{ scale: 0.92 }} onClick={() => setPlaying((p) => !p)} title={playing ? "Stop" : "Flip back and forth automatically"}>
            {playing ? "⏸ Pause" : "▶ Auto-play"}
          </motion.button>
        </div>
      </div>
      <p className="small muted" style={{ marginBottom: 10 }}>
        Each dot is one training row, flattened to 2-D so we can see it.
        {changed ? (
          <> {nSyn > 0 && <>Ringed dots are <b>new synthetic rows</b>. </>}{report.removed > 0 && <>Rows that were removed vanish. </>}</>
        ) : <> No balancing was applied, so before and after are identical.</>}
      </p>
      <div className="inset" style={{ padding: 10, position: "relative" }}>
        <motion.span
          key={view}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="badge accent"
          style={{ position: "absolute", top: 10, left: 10, zIndex: 1 }}
        >
          {view === "before" ? `Before · ${report.splits.train_before_resample.toLocaleString()} rows` : `After · ${report.splits.train.toLocaleString()} rows`}
        </motion.span>
        <Scatter points={points} classes={report.classes} domain={domain} height={320} radius={3} />
      </div>
      {(report.before_points.length < report.splits.train_before_resample || report.after_points.length < report.splits.train) && (
        <div className="tiny faint" style={{ marginTop: 6 }}>Showing a sample of rows to keep things smooth.</div>
      )}
    </Glass>
  );
}
