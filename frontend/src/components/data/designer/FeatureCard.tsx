import { motion } from "framer-motion";
import { spring } from "../../../design/motion";
import { colorAt } from "../../../lib/colors";
import { fmt } from "../../../lib/format";
import type { Catalog, SyntheticPreview } from "../../../lib/types";
import { Histogram } from "../../charts";
import { Select, Slider } from "../../glass";
import { Disclosure, OptionalNumber } from "../ui";
import { defaultParams, DIST_EMOJI, type DesignFeature } from "./model";
import { ParamControls } from "./ParamControls";

export type ColumnPreview = SyntheticPreview["columns"][number];

/** One synthetic feature: name, distribution, its parameters, advanced options and a live histogram. */
export function FeatureCard({ feature, index, onChange, onRemove, onDuplicate, preview, distributions, problem }: {
  feature: DesignFeature;
  index: number;
  onChange: (f: DesignFeature) => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
  preview?: ColumnPreview;
  distributions: Catalog["distributions"];
  problem?: string | null;
}) {
  const color = colorAt(index);
  const set = (patch: Partial<DesignFeature>) => onChange({ ...feature, ...patch });
  const clip = feature.clip ?? [null, null];
  const isCat = feature.dist === "categorical";
  const distOptions = Object.entries(distributions).map(([value, d]) => ({ value, label: `${DIST_EMOJI[value] ?? ""} ${d.label}` }));
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
      transition={spring.gentle}
      className="inset col"
      style={{ padding: 14, gap: 12, borderColor: problem ? "var(--danger)" : undefined, position: "relative", overflow: "hidden" }}
    >
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color, opacity: 0.8 }} />
      <div className="row" style={{ gap: 8 }}>
        <span style={{ fontSize: 18 }}>{DIST_EMOJI[feature.dist] ?? "📐"}</span>
        <input className="input grow" value={feature.name} placeholder="column name" onChange={(e) => set({ name: e.target.value })}
          style={{ fontWeight: 600, height: 30 }} aria-label="Feature name" />
        {onDuplicate && <button className="btn ghost sm icon" title="Duplicate" onClick={onDuplicate}>⧉</button>}
        {onRemove && <button className="btn ghost sm icon" title="Remove" onClick={onRemove}>✕</button>}
      </div>
      {problem && <span className="tiny" style={{ color: "var(--danger)", marginTop: -6 }}>{problem}</span>}
      <Select value={feature.dist} options={distOptions} style={{ width: "100%" }}
        onChange={(dist) => set({ dist, params: defaultParams(dist, distributions), ...(dist === "categorical" ? { clip: null, round: null } : {}) })} />

      <div style={{ minHeight: 86 }}>
        {preview?.kind === "numeric" ? (
          <>
            <Histogram data={preview.histogram} color={color} height={74} />
            <div className="row between tiny faint num" style={{ marginTop: 2 }}>
              <span>avg {fmt(preview.mean, 3)}</span>
              <span>spread {fmt(preview.std, 3)}</span>
            </div>
          </>
        ) : preview?.kind === "categorical" ? (
          <CategoryBars labels={preview.top.labels} counts={preview.top.counts} categories={(feature.params.categories as string[]) ?? []} />
        ) : (
          <div className="skeleton" style={{ height: 74 }} />
        )}
      </div>

      <ParamControls dist={feature.dist} params={feature.params} onChange={(params) => set({ params })} />

      <Disclosure title={<span className="small">Advanced</span>}>
        <div className="col" style={{ gap: 12 }}>
          <Slider label={<span className="small">Missing values</span>} help="Blank out this share of cells at random — real data is rarely complete. The target is computed before blanking."
            value={feature.missing_rate ?? 0} min={0} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ missing_rate: v })} />
          {!isCat && (
            <>
              <div className="row" style={{ gap: 8 }}>
                <span className="small" style={{ fontWeight: 560, flex: 1 }}>Limit to range</span>
                <OptionalNumber value={clip[0]} placeholder="min" width={74} onChange={(v) => set({ clip: [v, clip[1]] })} />
                <span className="faint">–</span>
                <OptionalNumber value={clip[1]} placeholder="max" width={74} onChange={(v) => set({ clip: [clip[0], v] })} />
              </div>
              <div className="row between">
                <span className="small" style={{ fontWeight: 560 }}>Round to</span>
                <Select value={feature.round === null || feature.round === undefined ? "none" : String(feature.round)}
                  options={[{ value: "none", label: "No rounding" }, { value: "0", label: "Whole numbers" }, { value: "1", label: "1 decimal" }, { value: "2", label: "2 decimals" }, { value: "3", label: "3 decimals" }]}
                  onChange={(v) => set({ round: v === "none" ? null : Number(v) })} style={{ width: 150 }} />
              </div>
            </>
          )}
        </div>
      </Disclosure>
    </motion.div>
  );
}

/** Mini vertical bars for a categorical feature's preview, coloured to match the category chips. */
function CategoryBars({ labels, counts, categories }: { labels: string[]; counts: number[]; categories: string[] }) {
  const order = categories.filter((c) => labels.includes(c));
  const shown = order.length ? order : labels;
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="row" style={{ alignItems: "flex-end", gap: 6, height: 86 }}>
      {shown.slice(0, 10).map((l) => {
        const i = labels.indexOf(l);
        const c = i >= 0 ? counts[i] : 0;
        const ci = categories.indexOf(l);
        return (
          <div key={l} className="col" style={{ flex: 1, minWidth: 0, gap: 3, alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
            <span className="tiny num faint">{Math.round((c / total) * 100)}%</span>
            <motion.div style={{ width: "100%", maxWidth: 46, borderRadius: 6, background: colorAt(ci >= 0 ? ci : i), opacity: 0.85 }}
              initial={{ height: 0 }} animate={{ height: (c / max) * 46 + 2 }} transition={spring.gentle} />
            <span className="tiny truncate muted" style={{ maxWidth: "100%" }} title={l}>{l}</span>
          </div>
        );
      })}
    </div>
  );
}
