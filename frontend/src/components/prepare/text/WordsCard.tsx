import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import type { PipelineSpec, PrepareReport } from "../../../lib/types";
import { Slider } from "../../glass";
import { ChoiceGrid, Note, StageCard, SubHead } from "../StageCard";
import { compactCount, patchText, textOf } from "./textPrepState";

/** Bag of words: single words vs words + pairs, the vocabulary cap and the rare-word cut-off. */
export function WordsCard({ spec, report, fresh, open, onToggle, flash }: {
  spec: PipelineSpec;
  report: PrepareReport | null;
  fresh: boolean;
  open: boolean;
  onToggle: () => void;
  flash: boolean;
}) {
  const t = textOf(spec);
  const capped = fresh && report && report.n_features >= t.max_features;
  return (
    <StageCard id="words" icon="🛍️" title="Words → numbers" open={open} onToggle={onToggle} flash={flash}
      summary={`${t.ngram_max === 2 ? "words + pairs" : "single words"} · ${compactCount(t.max_features)}`}
      why="Bag-of-words models count which words appear in each text. Choose what counts as a “word” and how many to keep."
      info="Each text becomes a long row of numbers — one per vocabulary entry — saying how much that word (or pair) shows up (TF-IDF: frequent in this text, rare overall = a high number). Logistic Regression, Naive Bayes, forests and the MLP all learn from these rows. Neural text models use their own vocabulary instead.">
      <div className="col" style={{ gap: 10 }}>
        <SubHead info="Pairs of neighbouring words (bigrams) keep a little bit of word order: 'not good' becomes its own entry, separate from 'good'.">What counts as a word</SubHead>
        <ChoiceGrid<"1" | "2"> value={String(t.ngram_max) as "1" | "2"} onChange={(v) => patchText(spec, { ngram_max: Number(v) as 1 | 2 })} min={220}
          options={[
            { value: "1", icon: "🔤", label: "Single words", blurb: "Fast and compact. “not good” becomes “not” + “good” — the link is lost." },
            { value: "2", icon: "🔗", label: "Words + pairs", blurb: "Also counts neighbouring pairs, so “not good” survives as a clue. Bigger vocabulary." },
          ]} />
        <NgramDemo ngram={t.ngram_max} />
      </div>

      <div className="row wrap" style={{ gap: 24, alignItems: "flex-start" }}>
        <div className="col" style={{ flex: "1 1 260px", gap: 8 }}>
          <Slider label="Vocabulary size" help="Keep only this many of the most common words (and pairs). Each one becomes a column the models learn a weight for. More = finer detail, slower and easier to overfit."
            value={t.max_features} min={500} max={10000} log integer format={(v) => v.toLocaleString()}
            onChange={(v) => patchText(spec, { max_features: Math.round(v / 100) * 100 })} />
          <Slider label="Ignore rare words" help="A word must appear in at least this many texts to be kept. Typos, names and one-off words are dropped — they can't teach anything general."
            value={t.min_df} min={1} max={10} integer format={(v) => `≥ ${v}`}
            onChange={(v) => patchText(spec, { min_df: v })} />
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <VocabCurve maxFeatures={t.max_features} minDf={t.min_df} />
        </div>
      </div>
      {fresh && report && (
        <Note icon={capped ? "✂️" : "📚"}>
          {capped
            ? <>Your texts had more distinct entries than the cap — the <b>{t.max_features.toLocaleString()}</b> most common were kept.</>
            : <>Your texts only have <b>{report.n_features.toLocaleString()}</b> distinct {t.ngram_max === 2 ? "words and pairs" : "words"} that pass the rare-word filter, so the cap of {t.max_features.toLocaleString()} isn't reached.</>}
        </Note>
      )}
    </StageCard>
  );
}

const SENTENCE = ["the", "battery", "is", "not", "good"];

/** A sentence splits into word chips — and, with pairs on, a row of pair chips where "not good" lights up. Replays every few seconds. */
export function NgramDemo({ ngram }: { ngram: 1 | 2 }) {
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCycle((c) => c + 1), 5200);
    return () => clearInterval(t);
  }, []);
  const pairs = useMemo(() => SENTENCE.slice(0, -1).map((w, i) => `${w} ${SENTENCE[i + 1]}`), []);
  return (
    <div className="inset col" style={{ padding: "14px 16px", gap: 12, overflow: "hidden" }}>
      <AnimatePresence mode="wait">
        <motion.div key={`${cycle}-${ngram}`} className="col" style={{ gap: 12 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: [0, 1, 1, 0.45], y: 0 }} transition={{ duration: 1.2, times: [0, 0.2, 0.7, 1] }}
            className="small" style={{ alignSelf: "flex-start", padding: "7px 14px", borderRadius: "16px 16px 16px 4px", background: "var(--glass-strong)", border: "1px solid var(--hairline)", fontWeight: 560 }}>
            “The battery is not good.”
          </motion.span>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tiny faint" style={{ width: 44 }}>words</span>
            {SENTENCE.map((w, i) => (
              <motion.span key={w} initial={{ opacity: 0, y: -14, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.pop, delay: 0.7 + i * 0.1 }}
                className="badge" style={{ height: 26, fontSize: 12.5, background: w === "not" || w === "good" ? "color-mix(in srgb, var(--warning) 18%, transparent)" : "var(--glass-strong)", color: "var(--text)", border: "1px solid var(--hairline)" }}>
                {w}
              </motion.span>
            ))}
          </div>
          {ngram === 2 && (
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="tiny faint" style={{ width: 44 }}>pairs</span>
              {pairs.map((p, i) => {
                const key = p === "not good";
                return (
                  <motion.span key={p} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: key ? [0.4, 1.12, 1] : 1 }} transition={{ ...spring.pop, delay: 1.4 + i * 0.14 }}
                    className="badge" style={{ height: 26, fontSize: 12.5, background: key ? "var(--accent)" : "var(--accent-soft)", color: key ? "var(--accent-contrast)" : "var(--accent)", fontWeight: 650 }}>
                    {p}
                  </motion.span>
                );
              })}
            </div>
          )}
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: ngram === 2 ? 2.2 : 1.4 }} className="tiny muted" style={{ lineHeight: 1.5 }}>
            {ngram === 2
              ? <>🔗 <b>“not good”</b> is its own clue now — a model can learn that it means the opposite of “good”.</>
              : <>🛍️ The bag only knows “not” and “good” both appeared — “good, not bad” would look almost the same.</>}
          </motion.span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Stylised word-frequency curve (a few very common words, a long tail of rare ones) with the two cut-offs. */
function VocabCurve({ maxFeatures, minDf }: { maxFeatures: number; minDf: number }) {
  const N = 44, W = 300, H = 120, PAD = 6;
  // bar i stands for the word ranked ~ exp(i) — positions on a log scale from 1 to 20,000
  const rankAt = (i: number) => Math.exp((i / (N - 1)) * Math.log(20000));
  const freq = (r: number) => 400 / Math.pow(r, 0.85); // texts containing the word (Zipf-like)
  const cut = Math.log(maxFeatures) / Math.log(20000) * (N - 1);
  const yOf = (f: number) => H - 18 - (Math.log(1 + f) / Math.log(401)) * (H - 30);
  const dfY = yOf(minDf);
  const bw = (W - PAD * 2) / N;
  return (
    <div className="col" style={{ gap: 6 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {Array.from({ length: N }, (_, i) => {
          const f = freq(rankAt(i));
          const kept = i <= cut && f >= minDf;
          const y = yOf(f);
          return (
            <motion.rect key={i} x={PAD + i * bw + 0.5} width={bw - 1.2} rx={1.5} style={{ fill: kept ? "var(--accent)" : "var(--fill-2)", transition: "fill .25s" }}
              animate={{ y, height: H - 18 - y }} transition={spring.gentle} />
          );
        })}
        <motion.line y1={4} y2={H - 18} stroke="var(--accent-2)" strokeWidth={1.8} strokeDasharray="4 3"
          animate={{ x1: PAD + (cut + 1) * bw, x2: PAD + (cut + 1) * bw }} transition={spring.gentle} />
        <motion.text y={12} fontSize={9.5} fontWeight={650} fill="var(--text-2)" textAnchor="end"
          animate={{ x: PAD + (cut + 1) * bw - 4 }} transition={spring.gentle}>keep {compactCount(maxFeatures)}</motion.text>
        <motion.line x1={PAD} x2={W - PAD} stroke="var(--warning)" strokeWidth={1.4} animate={{ y1: dfY, y2: dfY }} transition={spring.gentle} />
        <text x={PAD} y={H - 4} fontSize={9.5} fill="var(--text-3)">common words</text>
        <text x={W - PAD} y={H - 4} fontSize={9.5} fill="var(--text-3)" textAnchor="end">rare words →</text>
      </svg>
      <span className="tiny faint" style={{ lineHeight: 1.45 }}>A few words are everywhere; most are rare. Blue bars are kept — right of the dashed line is over the cap, below the orange line is too rare.</span>
    </div>
  );
}
