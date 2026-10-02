import { motion } from "framer-motion";
import { fadeUp, spring, stagger } from "../../../design/motion";
import type { DatasetProfile } from "../../../lib/types";
import { Histogram } from "../../charts";
import { Glass } from "../../glass";
import { SectionTitle } from "../ui";
import { fmtInt, GENRE_EMOJI, headSize, posterColor } from "./ratingsData";
import { LongTailChart, meanRating, StarBars } from "./viz";

/** How generous are people? Bars per star value. */
export function RatingDistCard({ profile }: { profile: DatasetProfile }) {
  const h = profile.rating_hist;
  if (!h?.labels.length) return null;
  const mean = meanRating(h.labels, h.counts);
  const top = h.labels[h.counts.indexOf(Math.max(...h.counts))];
  return (
    <Glass animate_in>
      <SectionTitle icon="⭐" title="How people rate" help="The share of all ratings at each value. Most rating data leans positive — people mostly rate things they chose to watch or buy."
        sub={mean !== null ? <>Average rating <b className="num">{mean.toFixed(2)}</b> · most common <b>{top}{Number(top) <= 10 ? "★" : ""}</b></> : undefined} />
      <StarBars labels={h.labels.slice(0, 12)} counts={h.counts.slice(0, 12)} height={160} />
      <p className="tiny muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
        Later, in Prepare, you'll decide which ratings count as <b>“liked”</b> — those are the hits a good recommender should find.
      </p>
    </Glass>
  );
}

/** Ratings per person: most people rate only a handful of things. */
export function PerUserCard({ profile }: { profile: DatasetProfile }) {
  const counts = profile.per_user, edges = profile.per_user_edges;
  if (!counts?.length || !edges?.length) return null;
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  // median from the histogram
  let acc = 0, med = edges[0];
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i];
    if (acc >= total / 2) { med = (edges[i] + edges[i + 1]) / 2; break; }
  }
  const few = counts.reduce((a, c, i) => a + (edges[i + 1] <= 5 ? c : 0), 0);
  return (
    <Glass animate_in>
      <SectionTitle icon="👤" title="Ratings per person" help="How many items each person rated. Personal models learn a taste from these — someone with only two ratings is hard to read, so it's common to filter them out (or fall back to popular items)."
        sub={<>A typical person rated about <b className="num">{Math.round(med)}</b> items · range {Math.round(edges[0])}–{Math.round(edges[edges.length - 1])}</>} />
      <Histogram data={{ edges, counts }} color="#5E5CE6" height={150} />
      <div className="row between tiny faint" style={{ marginTop: 4 }}>
        <span>fewer ratings</span><span>more ratings →</span>
      </div>
      <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
        {few > 0
          ? <><b className="num">{fmtInt(few)}</b> people rated 5 or fewer items — too little to read their taste. The <b>Filters</b> in Prepare can leave them out.</>
          : <>Everybody rated a decent number of items — plenty to learn each person's taste from.</>}
      </p>
    </Glass>
  );
}

/** The long tail: a few blockbusters get most ratings, most items get very few. */
export function LongTailCard({ profile }: { profile: DatasetProfile }) {
  const lt = profile.long_tail;
  if (!lt?.length) return null;
  const sorted = [...lt].sort((a, b) => b - a);
  const head = headSize(sorted);
  const rare = sorted.filter((v) => v < 5).length;
  return (
    <Glass animate_in>
      <SectionTitle icon="📉" title="The long tail" help="Every item, lined up from most- to least-rated. A handful of blockbusters collect half of all ratings; the long flat tail holds the niche items. Recommending only blockbusters is easy — finding the right niche item for the right person is where recommenders earn their keep."
        sub={<>Just <b className="num">{fmtInt(head)}</b> of {fmtInt(sorted.length)} items (<b className="num">{Math.round((head / sorted.length) * 100)}%</b>) collect half of all ratings.</>} />
      <LongTailChart values={sorted} height={200} />
      <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
        <span className="badge" style={{ background: "color-mix(in srgb, var(--warning) 15%, transparent)", color: "color-mix(in srgb, var(--warning) 70%, var(--text))" }}>🍿 {fmtInt(head)} blockbusters</span>
        <span className="badge" style={{ background: "color-mix(in srgb, #5E5CE6 14%, transparent)", color: "color-mix(in srgb, #5E5CE6 72%, var(--text))" }}>🔭 {fmtInt(sorted.length - head)} niche items</span>
        {rare > 0 && <span className="badge warning">{fmtInt(rare)} items with fewer than 5 ratings</span>}
      </div>
    </Glass>
  );
}

/** The most-rated items, with titles and genres when the dataset has them. */
export function TopItemsCard({ profile }: { profile: DatasetProfile }) {
  const items = profile.top_items ?? [];
  if (!items.length) return null;
  const max = Math.max(1, ...items.map((t) => t.ratings));
  const hasTitles = items.some((t) => t.title);
  return (
    <Glass animate_in>
      <SectionTitle icon="🏆" title="Most-rated items" help="The blockbusters at the very head of the long tail. A 'most popular' recommender would suggest exactly these — to everybody."
        sub="What a popularity recommender would show every single person." />
      <motion.div variants={stagger(0.035)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
        {items.map((t, i) => {
          const c = posterColor(t.item);
          return (
            <motion.div key={t.item} variants={fadeUp} className="inset row" style={{ padding: "8px 10px", gap: 10, minWidth: 0 }}>
              <span className="num" style={{ width: 18, textAlign: "right", fontWeight: 700, color: i < 3 ? "#E0A100" : "var(--text-3)", fontSize: 13 }}>{i + 1}</span>
              <div style={{ width: 26, height: 36, borderRadius: 5, background: `linear-gradient(160deg, ${c}, ${c}99)`, flexShrink: 0, position: "relative", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: -3, right: -3, bottom: -6, height: 16, borderRadius: "50% 50% 0 0", background: "rgba(255,255,255,.45)" }} />
              </div>
              <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                <span className="small truncate" style={{ fontWeight: 650 }} title={t.title ?? t.item}>{t.title ?? t.item}</span>
                <span className="row tiny muted" style={{ gap: 6, minWidth: 0 }}>
                  {t.genre && <span>{GENRE_EMOJI[t.genre] ?? "🎞️"} {t.genre}</span>}
                  {hasTitles && <span className="faint mono truncate">{t.item}</span>}
                </span>
                <div style={{ height: 4, borderRadius: 3, background: "var(--fill)", overflow: "hidden" }}>
                  <motion.div style={{ height: "100%", background: c, borderRadius: 3 }} initial={{ width: 0 }} animate={{ width: `${(t.ratings / max) * 100}%` }} transition={{ ...spring.gentle, delay: 0.1 + i * 0.03 }} />
                </div>
              </div>
              <span className="tiny num muted" style={{ whiteSpace: "nowrap" }}>{fmtInt(t.ratings)}</span>
            </motion.div>
          );
        })}
      </motion.div>
    </Glass>
  );
}
