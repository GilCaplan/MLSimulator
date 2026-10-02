import { motion } from "framer-motion";
import { useMemo } from "react";
import { stagger } from "../../design/motion";
import { classColor } from "../../lib/colors";
import { fmt } from "../../lib/format";
import type { DatasetProfile, Task } from "../../lib/types";
import { BarList, Heatmap, Histogram, Scatter } from "../charts";
import { Glass, InfoTip, Spinner } from "../glass";
import { liftFlat } from "./shared";
import { Disclosure, DivergingBars, SectionTitle } from "./ui";

/** Target distribution, 2-D map, target correlations and correlation heatmap. */
export function ProfilePanel({ profile, target, task, loading }: { profile: DatasetProfile | null; target: string | null; task: Task | null; loading: boolean }) {
  const continuous = !!profile?.target_hist;
  const classes = profile?.class_balance?.labels ?? null;
  const points = useMemo(
    () => liftFlat((profile?.projection ?? []).map((p) => ({ ...p, id: String(p.i ?? "") || undefined })), continuous),
    [profile, continuous],
  );
  if (!profile) {
    return (
      <Glass animate_in>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="skeleton" style={{ height: 200 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </Glass>
    );
  }
  const total = profile.class_balance ? profile.class_balance.counts.reduce((a, b) => a + b, 0) + profile.class_balance.other : 0;
  const corr = profile.target_correlations ?? [];
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "stretch" }}>
        <Glass animate_in>
          <SectionTitle icon={profile.class_balance ? "⚖️" : "📊"} title={profile.class_balance ? "Class balance" : "Target spread"}
            help={profile.class_balance ? "How many rows belong to each answer. Very uneven classes make models lazy — they just guess the common one." : "How the values you want to predict are distributed."}
            right={loading ? <Spinner size={14} color="var(--accent)" /> : null}
            sub={target ? <>of <b>{target}</b></> : "Pick a target column above"} />
          {profile.class_balance ? (
            <BarList labels={profile.class_balance.labels} values={profile.class_balance.counts}
              colors={profile.class_balance.labels.map((l) => classColor(l, classes))}
              format={(v) => `${Math.round(v).toLocaleString()} · ${total ? Math.round((v / total) * 100) : 0}%`} />
          ) : profile.target_hist ? (
            <Histogram data={profile.target_hist} color="var(--accent-2)" height={170} />
          ) : (
            <p className="small muted">Choose what to predict to see its distribution.</p>
          )}
        </Glass>
        <Glass animate_in>
          <SectionTitle icon="🗺️" title="Bird's-eye view"
            help="PCA squashes all the numeric columns onto a flat map while keeping as much of the spread as possible. Dots that are close are similar rows."
            sub="Every row as a dot, coloured by its answer. Clear patches of colour = an easier problem." />
          <Scatter points={points} classes={classes} continuous={continuous} height={220} radius={2.6} />
        </Glass>
      </div>

      {(corr.length > 0 || profile.correlation_matrix) && (
        <Glass animate_in>
          <SectionTitle icon="🔗" title="Which features move with the target?"
            help="Correlation runs from −1 to +1. +1: when the feature goes up, the target goes up. −1: the opposite. 0: no straight-line link (there may still be a curvy one!)."
            sub="Longer bars = stronger straight-line link. Blue moves together, pink moves opposite." />
          {corr.length > 0 ? (
            <DivergingBars items={corr.slice(0, 12).map((c) => ({ label: c.feature, value: c.r }))} max={Math.max(0.3, ...corr.map((c) => Math.abs(c.r)))} />
          ) : (
            <p className="small muted">No numeric features to compare.</p>
          )}
          {corr.length > 12 && <p className="tiny faint" style={{ marginTop: 8 }}>Showing the 12 strongest of {corr.length}. Weakest: {corr[corr.length - 1].feature} ({fmt(corr[corr.length - 1].r, 2)}).</p>}
          {profile.correlation_matrix && (
            <div style={{ marginTop: 14 }}>
              <Disclosure title={<span className="row small" style={{ gap: 6 }}>Feature-to-feature correlations <InfoTip text="Features that are strongly correlated with each other carry overlapping information." /></span>}>
                <Heatmap columns={profile.correlation_matrix.columns} matrix={profile.correlation_matrix.matrix} />
              </Disclosure>
            </div>
          )}
        </Glass>
      )}
    </motion.div>
  );
}
