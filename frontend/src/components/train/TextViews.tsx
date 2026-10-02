import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring } from "../../design/motion";
import { classColor, withAlpha } from "../../lib/colors";
import { pct } from "../../lib/format";
import type { TextResult } from "../../lib/types";
import { EmptyState, InfoTip } from "../glass";
import { ClassChip, ConfidenceRing, ExplainedSentence, InfluenceLegend } from "./textKit";

type Mistake = NonNullable<TextResult["mistakes"]>[number];
type Example = NonNullable<TextResult["examples"]>[number];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ mistakes */

/** The most confident wrong answers as message bubbles, each with a "why?" expander when word influences exist. */
export function TextMistakes({ text, classes, onExplain }: { text: TextResult; classes?: string[] | null; onExplain?: () => void }) {
  const mistakes = text.mistakes ?? [];
  const [limit, setLimit] = useState(8);
  const byText = useMemo(() => new Map((text.examples ?? []).map((e) => [norm(e.text), e])), [text.examples]);
  if (!mistakes.length) {
    return <EmptyState icon="🎉" title="No mistakes on the test texts" text="Every test message got the right answer. Check the Explanations tab to see which words it relied on." />;
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 720 }}>
        <b style={{ color: "var(--text)" }}>Read what it got wrong.</b> These are test messages it answered wrongly, the ones it was <i>surest</i> about first.
        Look for patterns: negations (“not bad”), sarcasm, mixed feelings, or words it has simply never seen.
      </p>
      <div className="col" style={{ gap: 12 }}>
        {mistakes.slice(0, limit).map((m, i) => (
          <Bubble key={`${i}-${m.text.slice(0, 20)}`} m={m} i={i} classes={classes} example={byText.get(norm(m.text))} />
        ))}
      </div>
      {mistakes.length > limit && (
        <button className="btn sm ghost" style={{ alignSelf: "center" }} onClick={() => setLimit((l) => l + 10)}>
          Show more ({mistakes.length - limit} left)
        </button>
      )}
      {byText.size > 0 && (
        <span className="tiny faint" style={{ lineHeight: 1.5 }}>
          🔍 <b>Why?</b> is worked out for the most confident mistakes.{onExplain && <> More in <button className="btn ghost sm" style={{ padding: "0 6px", height: 20 }} onClick={onExplain}>Explanations</button>.</>} Save the model to explain any sentence you type in its playground.
        </span>
      )}
    </div>
  );
}

function Bubble({ m, i, classes, example }: { m: Mistake; i: number; classes?: string[] | null; example?: Example }) {
  const [open, setOpen] = useState(false);
  const predColor = classColor(m.pred, classes);
  return (
    <motion.div initial={{ opacity: 0, x: -14, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ ...spring.gentle, delay: Math.min(i, 10) * 0.04 }}
      className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <span style={{ width: 34, height: 34, borderRadius: 17, background: "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, marginTop: 2 }}>💬</span>
      <div className="col grow" style={{ gap: 7, minWidth: 0 }}>
        <div style={{ position: "relative", alignSelf: "flex-start", maxWidth: "100%", padding: "11px 15px", borderRadius: "18px 18px 18px 6px", background: "var(--glass-strong)", border: "1px solid var(--glass-border)", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
          <span style={{ fontSize: 14.5, lineHeight: 1.5 }}>{m.text}</span>
        </div>
        <div className="row wrap" style={{ gap: 8, paddingLeft: 4 }}>
          <ClassChip label={m.true} classes={classes} prefix={<span style={{ opacity: 0.7, fontWeight: 500 }}>truth</span>} />
          <motion.span initial={{ x: -4, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 + Math.min(i, 10) * 0.04 }} className="faint">→</motion.span>
          <ClassChip label={m.pred} classes={classes} prefix={<span style={{ opacity: 0.7, fontWeight: 500 }}>said</span>} />
          <span className="row tiny muted" style={{ gap: 6 }}>
            <ConfidenceRing value={m.confidence} color={predColor} size={30} delay={0.15 + Math.min(i, 10) * 0.04} />
            sure
          </span>
          <span className="grow" />
          {example ? (
            <button className="btn ghost sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Hide" : "🔍 Why?"}
            </button>
          ) : null}
        </div>
        <AnimatePresence initial={false}>
          {open && example && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle} style={{ overflow: "hidden" }}>
              <div className="inset col" style={{ gap: 10, padding: "12px 14px", marginTop: 2 }}>
                <span className="small muted" style={{ lineHeight: 1.5 }}>
                  How each word pushed it towards <b style={{ color: predColor }}>“{example.pred}”</b> ({pct(example.probability, 0)} sure):
                </span>
                <ExplainedSentence tokens={example.tokens} pred={example.pred} size={14} />
                <InfluenceLegend width={110} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ words */

/** Per-class columns of the words / word pairs that pull a linear or naive Bayes model towards each answer. */
export function TextWords({ text, classes, family, label, onExplain }: { text: TextResult; classes?: string[] | null; family: "torch" | "classic"; label: string; onExplain?: () => void }) {
  const groups = text.top_words ?? [];
  if (!groups.length) {
    return (
      <div className="col center" style={{ gap: 14, padding: "26px 12px", textAlign: "center" }}>
        <motion.div initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop} style={{ fontSize: 44 }}>{family === "torch" ? "🧠" : "🌳"}</motion.div>
        <h3>{family === "torch" ? "Its knowledge isn't a word list" : "No word list for this model"}</h3>
        <p className="small muted" style={{ maxWidth: 520, lineHeight: 1.6 }}>
          {family === "torch"
            ? `This neural network (${label}) turns every word into a vector of learned numbers and combines them — what a word means can depend on the words around it. There's no single weight per word to rank.`
            : "This model combines words in ways that can't be boiled down to one weight per word."}
          {" "}Instead, test it the way scientists probe a black box: remove one word at a time and watch the answer change.
        </p>
        {onExplain && <button className="btn primary sm" onClick={onExplain}>🔍 See the Explanations</button>}
      </div>
    );
  }
  const pairs = groups.some((g) => g.words.some((w) => w.t.includes(" ")));
  return (
    <div className="col" style={{ gap: 16 }}>
      <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 720 }}>
        <b style={{ color: "var(--text)" }}>These are the words that pull the model towards each answer.</b>{" "}
        Bigger, stronger chips weigh more. The model adds up the weights of every word in a message — whichever answer collects the most wins.
        {pairs && <> <span className="row" style={{ display: "inline-flex", gap: 4 }}><PairChip t="not good" color="#8e8e93" size={11.5} strength={0.5} /></span> chips are <b style={{ color: "var(--text)" }}>word pairs</b> — that's how a word-count model can learn that “not good” isn't good.</>}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${groups.length > 3 ? 200 : 240}px, 1fr))`, gap: 12 }}>
        {groups.map((g, gi) => {
          const color = classColor(g.class, classes);
          const max = Math.max(...g.words.map((w) => w.w));
          const min = Math.min(...g.words.map((w) => w.w));
          // spread the sizes over the range shown, so the top word clearly outweighs the twelfth
          const rel = (w: number) => (max - min > 1e-9 ? 0.25 + 0.75 * (w - min) / (max - min) : 0.8);
          return (
            <motion.div key={g.class} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: gi * 0.07 }}
              className="inset col" style={{ padding: 14, gap: 12, borderTop: `3px solid ${color}` }}>
              <div className="row between">
                <span className="row" style={{ gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: color }} />
                  <b style={{ color }}>{g.class}</b>
                </span>
                <span className="tiny faint">pulls towards “{g.class}”</span>
              </div>
              <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                {g.words.map((w, wi) => {
                  const s = rel(w.w);
                  return (
                    <motion.span key={w.t} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.pop, delay: gi * 0.07 + wi * 0.03 }}
                      whileHover={{ scale: 1.08, y: -2 }} title={`weight ${w.w.toFixed(3)}`}>
                      {w.t.includes(" ") ? <PairChip t={w.t} color={color} size={11 + 6 * s} strength={s} /> : <WordChip t={w.t} color={color} size={11.5 + 7 * s} strength={s} />}
                    </motion.span>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
      <span className="tiny faint row" style={{ gap: 6 }}>
        {family === "classic" && label.toLowerCase().includes("bayes") ? "Naive Bayes: how much more often a word shows up in this class than on average." : "Weights the model learned for each word (or pair) — larger means a stronger pull."}
        <InfoTip text="Words that appear in every class (like “the”) carry no information and never make these lists. Only words seen in at least a couple of training messages get a weight." />
      </span>
    </div>
  );
}

function WordChip({ t, color, size, strength }: { t: string; color: string; size: number; strength: number }) {
  return (
    <span style={{ display: "inline-block", padding: `${size * 0.2}px ${size * 0.55}px`, borderRadius: 999, fontSize: size, fontWeight: strength > 0.5 ? 680 : 540,
      background: withAlpha(color, 0.08 + 0.32 * strength), color: strength > 0.35 ? color : "var(--text)", border: `1px solid ${withAlpha(color, 0.18 + 0.4 * strength)}` }}>
      {t}
    </span>
  );
}

/** A word pair: two words fused into one chip with a link between them. */
function PairChip({ t, color, size, strength }: { t: string; color: string; size: number; strength: number }) {
  const parts = t.split(" ");
  return (
    <span className="row" style={{ display: "inline-flex", gap: 0, padding: 2, borderRadius: 999, background: `linear-gradient(135deg, ${withAlpha(color, 0.18 + 0.35 * strength)}, ${withAlpha("#BF5AF2", 0.12 + 0.25 * strength)})`, border: `1.5px dashed ${withAlpha(color, 0.35 + 0.4 * strength)}` }}>
      {parts.map((p, i) => (
        <span key={i} className="row" style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && <span style={{ width: 6, height: 2, background: withAlpha(color, 0.7), borderRadius: 1 }} />}
          <span style={{ padding: `${size * 0.14}px ${size * 0.45}px`, borderRadius: 999, background: "var(--glass-strong)", fontSize: size, fontWeight: strength > 0.5 ? 680 : 540, color: strength > 0.35 ? color : "var(--text)" }}>{p}</span>
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ explanations */

/** Example sentences with every word coloured by how much it moved the model's answer (occlusion). */
export function TextExplain({ text, classes }: { text: TextResult; classes?: string[] | null }) {
  const examples = text.examples ?? [];
  if (!examples.length) {
    return <EmptyState icon="🔍" title="No explanations recorded" text={text.note ?? "This model didn't record word-level explanations."} />;
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row between wrap" style={{ gap: 10, alignItems: "flex-end" }}>
        <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 640 }}>
          <b style={{ color: "var(--text)" }}>We removed each word in turn and watched the answer move.</b> If the model gets less sure without a word, that word was pushing it towards its answer (green); if it gets more sure, the word was arguing against it (red).
          <InfoTip text="This trick is called occlusion. It works for any model — word-count, recurrent or transformer — because it only looks at what goes in and what comes out." />
        </p>
        <InfluenceLegend width={120} />
      </div>
      <div className="col" style={{ gap: 12 }}>
        {examples.map((e, i) => {
          const right = norm(e.pred) === norm(e.true);
          const color = classColor(e.pred, classes);
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: i * 0.06 }}
              className="inset col" style={{ padding: "14px 16px", gap: 12, borderLeft: `3px solid ${right ? "var(--success)" : "var(--danger)"}` }}>
              <div className="row between wrap" style={{ gap: 10 }}>
                <span className="row wrap" style={{ gap: 8 }}>
                  <span className={`badge ${right ? "success" : "danger"}`}>{right ? "✓ right" : "✗ wrong"}</span>
                  <span className="small muted">said</span>
                  <ClassChip label={e.pred} classes={classes} />
                  {!right && <><span className="small muted">truth</span><ClassChip label={e.true} classes={classes} /></>}
                </span>
                <span className="row" style={{ gap: 8, minWidth: 150 }}>
                  <span className="tiny faint">{pct(e.probability, 0)} sure</span>
                  <span style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--fill-2)", overflow: "hidden", minWidth: 80 }}>
                    <motion.span initial={{ width: 0 }} animate={{ width: `${e.probability * 100}%` }} transition={{ ...spring.gentle, delay: 0.1 + i * 0.06 }}
                      style={{ display: "block", height: "100%", borderRadius: 3, background: color }} />
                  </span>
                </span>
              </div>
              <ExplainedSentence tokens={e.tokens} pred={e.pred} size={15} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
