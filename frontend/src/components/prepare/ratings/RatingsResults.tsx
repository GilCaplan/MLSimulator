import { motion } from "framer-motion";
import { fadeUp, stagger } from "../../../design/motion";
import type { PrepareReport } from "../../../lib/types";
import { Histogram, SplitBar } from "../../charts";
import { fmtInt, headSize } from "../../data/ratings/ratingsData";
import { LongTailChart, SparsityGrid, StarBars } from "../../data/ratings/viz";
import { AnimatedNumber, Glass, InfoTip } from "../../glass";

/** What the recommenders will learn from: the filtered grid, the train/test ratings, the long tail and the liked share. */
export function RatingsResults({ report }: { report: PrepareReport }) {
  const nU = report.n_users ?? 0, nI = report.n_items ?? 0;
  const tr = report.splits.train, te = report.splits.test;
  const sp = report.sparsity ?? 0;
  const lt = report.long_tail ?? [];
  const head = headSize(lt);
  const hist = report.rating_hist;
  const pos = report.positive ?? 4;
  const total = hist ? hist.counts.reduce((a, b) => a + b, 0) : 0;
  const liked = hist ? hist.counts.reduce((a, c, i) => a + (Number(hist.labels[i]) >= pos ? c : 0), 0) : 0;
  const perUser = report.per_user_hist ?? [];
  const testedUsers = report.test_k ? Math.round(te / report.test_k) : 0;
  const coldItems = lt.filter((v) => v === 0).length;
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <motion.div variants={fadeUp}>
        <Glass>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <Tile icon="👤" label="People" value={nU} />
            <Tile icon="🎬" label="Items" value={nI} />
            <Tile icon="📚" label="Training ratings" value={tr} />
            <Tile icon="🎯" label="Hidden test ratings" value={te} sub={testedUsers ? `${report.test_k} each for ${fmtInt(testedUsers)} people` : undefined} />
            {report.removed > 0 && <Tile icon="✂️" label="Removed by filters" value={report.removed} tone="var(--warning)" />}
          </div>
          <div className="row wrap" style={{ gap: 18, marginTop: 16, alignItems: "center" }}>
            <div className="col" style={{ gap: 6, flex: "2 1 300px" }}>
              <span className="small row" style={{ gap: 6, fontWeight: 650 }}>📚 Train vs 🎯 test ratings <InfoTip text="The test ratings are each person's hidden ratings. They never reach the models during training — afterwards we check whether the models would have recommended the ones the person liked." /></span>
              <SplitBar parts={[{ label: "Train", value: tr, color: "#0A84FF" }, { label: "Test", value: te, color: "#FF9F0A" }]} />
            </div>
            <div className="inset row" style={{ padding: "10px 12px", gap: 14, flex: "1 1 260px" }}>
              <SparsityGrid key={sp} sparsity={sp} cols={14} rows={5} size={6} gap={3} />
              <div className="col" style={{ gap: 2 }}>
                <b className="num" style={{ fontSize: 19 }}><AnimatedNumber value={sp * 100} format={(v) => `${v.toFixed(v > 99 ? 2 : 1)}%`} /></b>
                <span className="tiny muted">of the {fmtInt(nU)} × {fmtInt(nI)} grid is empty — that's what the models fill in</span>
              </div>
            </div>
          </div>
        </Glass>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Glass>
          <div className="col" style={{ gap: 2, marginBottom: 12 }}>
            <h3 className="row" style={{ gap: 8 }}>📉 The long tail <InfoTip text="Training ratings per item, most-rated first. The blockbusters on the left are easy to recommend; the niche items on the right are where personal models shine." /></h3>
            <span className="small muted">After filtering, <b className="num">{fmtInt(head)}</b> of {fmtInt(lt.length)} items collect half of the training ratings.{coldItems > 0 && <> <b className="num">{fmtInt(coldItems)}</b> items only appear in the test set.</>}</span>
          </div>
          <LongTailChart values={lt} height={190} />
        </Glass>
      </motion.div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "stretch" }}>
        {hist && hist.labels.length > 0 && (
          <motion.div variants={fadeUp}>
            <Glass style={{ height: "100%" }}>
              <div className="col" style={{ gap: 2, marginBottom: 12 }}>
                <h3>💚 What counts as liked</h3>
                <span className="small muted"><b className="num">{total ? Math.round((liked / total) * 100) : 0}%</b> of ratings are {pos}★ or more — the hits a recommender should find.</span>
              </div>
              <StarBars labels={hist.labels.slice(0, 12)} counts={hist.counts.slice(0, 12)} positive={pos} height={130} />
            </Glass>
          </motion.div>
        )}
        {perUser.length > 0 && (
          <motion.div variants={fadeUp}>
            <Glass style={{ height: "100%" }}>
              <div className="col" style={{ gap: 2, marginBottom: 12 }}>
                <h3>👤 Training ratings per person</h3>
                <span className="small muted">How much history each person leaves for the models to learn from.</span>
              </div>
              <Histogram data={{ edges: perUser.map((_, i) => i).concat(perUser.length), counts: perUser }} color="#5E5CE6" height={120} showAxis={false} />
              <div className="row between tiny faint" style={{ marginTop: 4 }}><span>fewer</span><span>more →</span></div>
            </Glass>
          </motion.div>
        )}
      </div>

      {report.warnings.length > 0 && (
        <motion.div variants={fadeUp}>
          <Glass variant="thin">
            <div className="col small" style={{ gap: 6 }}>
              {report.warnings.map((w) => <span key={w} style={{ color: "var(--warning)" }}>⚠️ {w}</span>)}
            </div>
          </Glass>
        </motion.div>
      )}
    </motion.div>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: string; label: string; value: number; sub?: string; tone?: string }) {
  return (
    <div className="inset col" style={{ padding: "10px 12px", gap: 2 }}>
      <span className="tiny muted">{icon} {label}</span>
      <b className="num" style={{ fontSize: 20, color: tone }}><AnimatedNumber value={value} format={(v) => fmtInt(v)} /></b>
      {sub && <span className="tiny faint">{sub}</span>}
    </div>
  );
}
