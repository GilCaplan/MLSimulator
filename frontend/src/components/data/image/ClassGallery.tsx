import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { stagger } from "../../../design/motion";
import { api } from "../../../lib/api";
import { classColor, ramp } from "../../../lib/colors";
import { fmt } from "../../../lib/format";
import type { DatasetProfile, DatasetSummary } from "../../../lib/types";
import { Glass } from "../../glass";
import { SectionTitle } from "../ui";
import { storedSize, Thumb } from "./Thumb";

const REG_ROWS: { key: string; label: string; icon: string; t: number }[] = [
  { key: "lowest", label: "Lowest", icon: "⬇️", t: 0 },
  { key: "middle", label: "Middle", icon: "↔️", t: 0.5 },
  { key: "highest", label: "Highest", icon: "⬆️", t: 1 },
];

/** A row of example pictures per class (or lowest / middle / highest values for regression). */
export function ClassGallery({ dataset, profile, target }: { dataset: DatasetSummary; profile: DatasetProfile; target: string | null }) {
  const samples = profile.samples ?? {};
  const size = storedSize(dataset.image_shape);
  const isClf = !!profile.class_balance;
  const classes = profile.class_balance?.labels ?? null;
  const counts = Object.fromEntries((profile.class_balance?.labels ?? []).map((l, i) => [l, profile.class_balance!.counts[i]]));
  const values = useSampleValues(dataset.id, isClf ? null : target, isClf ? [] : Object.values(samples).flat());
  const rows = isClf ? Object.keys(samples) : REG_ROWS.filter((r) => samples[r.key]);
  return (
    <Glass animate_in>
      <SectionTitle icon="🖼️" title={isClf ? "Examples of each class" : "From the lowest to the highest"}
        help={isClf ? "A random handful of pictures from every class. Look for what makes a class a class — and for anything odd, like mislabelled pictures." : "Pictures with the smallest, middle and largest answers. Can you see what changes?"}
        sub={isClf ? "Can you tell the classes apart? If you can, a model probably can too." : "Spot the pattern the model has to learn."} />
      <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="col" style={{ gap: 10 }}>
        {rows.map((r, ri) => {
          const key = typeof r === "string" ? r : r.key;
          const color = typeof r === "string" ? classColor(r, classes) : ramp(r.t);
          const ids = (samples[key] ?? []).slice(0, 10);
          return (
            <motion.div key={key} variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }} className="inset row" style={{ padding: "8px 10px", gap: 12, alignItems: "flex-start" }}>
              <div className="col" style={{ width: 104, flexShrink: 0, gap: 2, paddingTop: 4 }}>
                <span className="row" style={{ gap: 6, fontWeight: 650, fontSize: 13.5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0 }} />
                  <span className="truncate" title={key}>{typeof r === "string" ? r : `${r.icon} ${r.label}`}</span>
                </span>
                {isClf && counts[key] !== undefined && <span className="tiny faint num">{counts[key].toLocaleString()} pictures</span>}
              </div>
              <div className="row wrap grow" style={{ gap: 6 }}>
                {ids.map((i, k) => (
                  <div key={i} className="col" style={{ alignItems: "center", gap: 2 }}>
                    <Thumb datasetId={dataset.id} i={i} size={size} box={52} delay={ri * 0.06 + k * 0.025} />
                    {!isClf && <span className="tiny num muted" style={{ height: 14 }}>{values[i] !== undefined ? fmt(values[i], 2) : ""}</span>}
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </Glass>
  );
}

/** Answer values for a few image indices (regression), read row by row. */
function useSampleValues(datasetId: string, target: string | null, ids: number[]): Record<number, number> {
  const [vals, setVals] = useState<Record<number, number>>({});
  const key = `${datasetId}|${target}|${ids.join(",")}`;
  useEffect(() => {
    if (!target || !ids.length) return;
    let live = true;
    Promise.all(Array.from(new Set(ids)).map((i) => api.rows(datasetId, i, 1).then((r) => {
      const c = r.columns.indexOf(target);
      return [i, c >= 0 ? Number(r.rows[0]?.[c]) : NaN] as const;
    })))
      .then((pairs) => { if (live) setVals(Object.fromEntries(pairs.filter(([, v]) => Number.isFinite(v)))); })
      .catch(() => { /* values are a nice-to-have */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return vals;
}
