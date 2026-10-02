import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { DatasetProfile, PipelineSpec, PrepareReport } from "../../../lib/types";
import { fmtInt } from "../../data/ratings/ratingsData";
import { Slider } from "../../glass";
import { StageCard } from "../StageCard";
import { itemsBelow, patchRecsys, recsysOf, usersBelow, type RecsysSpec } from "./ratingsPrepState";

/** Minimum ratings per person / per item: drop people and items with too little history to learn from. */
export function FiltersCard({ spec, profile, report, lastRun, nRows, open, onToggle, flash }: {
  spec: PipelineSpec;
  profile: DatasetProfile | null;
  report: PrepareReport | null;
  /** the settings the shown report was made with */
  lastRun: RecsysSpec | null;
  nRows: number;
  open: boolean;
  onToggle: () => void;
  flash: boolean;
}) {
  const r = recsysOf(spec);
  const u = usersBelow(profile, r.min_user);
  const i = itemsBelow(profile, r.min_item);
  const sameAsLast = !!lastRun && lastRun.min_user === r.min_user && lastRun.min_item === r.min_item;
  const removed = report?.removed ?? null;
  return (
    <StageCard id="filters" icon="🧹" title="Filters" open={open} onToggle={onToggle} flash={flash}
      why="Leave out people and items with too few ratings — there's not enough history to learn their taste from."
      info="Filtering repeats a few times: removing rare items can push a person below the minimum, and vice versa. Very strict filters make the data cleaner but smaller — and real recommenders still have to serve those people somehow (see the cold-start fallback in model settings)."
      summary={`≥${r.min_user} · ≥${r.min_item}`}>
      <div className="row wrap" style={{ gap: "18px 28px", alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 8, flex: "1 1 260px" }}>
          <Slider label="👤 Ratings per person, at least" help="People with fewer ratings than this are left out. Five is a common choice."
            value={r.min_user} min={1} max={50} integer onChange={(v) => patchRecsys(spec, { min_user: v })} />
          <Estimate n={u} noun="person" nouns="people" />
        </div>
        <div className="col" style={{ gap: 8, flex: "1 1 260px" }}>
          <Slider label="🎬 Ratings per item, at least" help="Items rated by fewer people than this are left out. Nobody can find neighbours for an item only one person has seen."
            value={r.min_item} min={1} max={50} integer onChange={(v) => patchRecsys(spec, { min_item: v })} />
          <Estimate n={i} noun="item" nouns="items" />
        </div>
      </div>
      <AnimatePresence mode="wait">
        {removed !== null && lastRun && (
          <motion.div key={`${sameAsLast}-${removed}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.gentle}
            className="inset row wrap" style={{ padding: "10px 14px", gap: 12 }}>
            <span style={{ fontSize: 18 }}>{removed ? "✂️" : "✅"}</span>
            <span className="small" style={{ lineHeight: 1.5, flex: 1 }}>
              {sameAsLast
                ? removed
                  ? <>These filters remove <b className="num">{fmtInt(removed)}</b> rating rows{nRows ? <> (<b className="num">{((removed / nRows) * 100).toFixed(1)}%</b> of all ratings)</> : null}.</>
                  : <>These filters remove <b>nothing</b> — everybody and everything has enough ratings.</>
                : <span className="muted">The last run (≥{lastRun.min_user} per person, ≥{lastRun.min_item} per item) removed <b className="num">{fmtInt(removed)}</b> rows. Run again to see the effect of the new filters.</span>}
            </span>
            {nRows > 0 && sameAsLast && (
              <div style={{ width: 140, height: 8, borderRadius: 5, background: "var(--fill)", overflow: "hidden" }}>
                <motion.div style={{ height: "100%", background: "var(--warning)", borderRadius: 5 }} initial={{ width: 0 }} animate={{ width: `${Math.max(removed ? 2 : 0, (removed / nRows) * 100)}%` }} transition={spring.gentle} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </StageCard>
  );
}

function Estimate({ n, noun, nouns }: { n: number | null; noun: string; nouns: string }) {
  if (n === null) return <span className="tiny faint">Load the ratings on the Data step to see how many fall below.</span>;
  return (
    <span className="tiny row" style={{ gap: 6, color: n ? "var(--text-2)" : "var(--text-3)" }}>
      <motion.span key={n} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={spring.pop} className="badge num" style={{ height: 20, background: n ? "color-mix(in srgb, var(--warning) 15%, transparent)" : undefined, color: n ? "color-mix(in srgb, var(--warning) 70%, var(--text))" : undefined }}>
        {n ? `≈ ${fmtInt(n)}` : "0"}
      </motion.span>
      {n === 1 ? noun : nouns} below the line{n ? " — they'll be left out" : ""}
    </span>
  );
}
