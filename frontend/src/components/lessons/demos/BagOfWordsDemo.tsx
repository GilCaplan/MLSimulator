import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Stat, clamp, rng, useDone } from "./shared";

/* ------------------------------------------------ two tiny hand-written linear "models" */

/** Word model: one weight per word. Words it never saw in training weigh 0. */
const WORD_W: Record<string, number> = {
  good: 1.0, great: 1.2, love: 1.3, excellent: 1.4, amazing: 1.3, awesome: 1.2, perfect: 1.3, best: 1.2, nice: 0.8,
  comfortable: 0.8, happy: 0.9, recommend: 1.0, fine: 0.5, works: 0.4, worth: 0.6, clear: 0.6, fast: 0.5, easy: 0.6, like: 0.5,
  bad: -1.0, terrible: -1.3, awful: -1.3, horrible: -1.3, poor: -1.0, worst: -1.4, hate: -1.3, broken: -1.1, boring: -0.9,
  slow: -0.6, cheap: -0.4, disappointed: -1.1, disappointing: -1.1, uncomfortable: -0.9, waste: -1.2, problem: -0.6,
  problems: -0.6, noisy: -0.5, not: -0.1, no: -0.2, never: -0.3,
};

/** Pairs model: the same word weights plus a weight for each two-word phrase it learned. */
const PAIR_W: Record<string, number> = {
  "not good": -2.2, "not great": -2.0, "not bad": 2.0, "not terrible": 1.9, "not awful": 1.9, "not horrible": 1.9,
  "not comfortable": -2.2, "not happy": -2.0, "not recommend": -2.2, "not worth": -1.6, "not nice": -1.6, "not fine": -1.2,
  "not perfect": -0.9, "not disappointed": 2.0, "not boring": 1.6, "not like": -1.4, "not love": -1.6, "not work": -1.2,
  "not easy": -1.4, "not very": -1.6, "not the": -0.2, "no problem": 1.4, "no problems": 1.4, "never again": -1.5,
  "never disappointed": 2.0, "not slow": 1.2, "not cheap": 0.4, "not broken": 1.6,
};

const EXAMPLES = [
  "the battery is good",
  "the battery is not good",
  "not bad at all",
  "great sound but not comfortable",
  "the battery is good, not bad",
  "i would not recommend it",
];

const MAX_WORDS = 16;
const RANGE = 4; // the score bar spans −4 … +4
const SENT_POS = C.ok, SENT_NEG = C.pos;
const WORD_ACCENT = C.teal, PAIR_ACCENT = C.purple;

/** Lowercase, expand "n't" to " not", then split on anything that isn't a letter. */
function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/\bcan['’]t\b/g, "can not").replace(/\bwon['’]t\b/g, "will not").replace(/n['’]t\b/g, " not")
    .split(/[^a-z]+/).filter(Boolean).slice(0, MAX_WORDS);
}

interface Term { key: string; w: number; count: number; pair: boolean }

/** Count each distinct item (sorted A→Z: a bag has no order). */
function bag(items: string[], weights: Record<string, number>, pair: boolean): Term[] {
  const counts = new Map<string, number>();
  items.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count, pair, w: weights[key] ?? 0 }));
}

const bigrams = (ws: string[]) => ws.slice(1).map((w, i) => `${ws[i]} ${w}`);
const scoreOf = (terms: Term[]) => terms.reduce((s, t) => s + t.w * t.count, 0);

type Verdict = "positive" | "negative" | "neutral";
const verdictOf = (s: number): Verdict => (s > 0.05 ? "positive" : s < -0.05 ? "negative" : "neutral");
const sentColor = (s: number) => (s > 0.05 ? SENT_POS : s < -0.05 ? SENT_NEG : "var(--text-3)");
const signed = (v: number) => `${v > 0.049 ? "+" : v < -0.049 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
/** Theme-safe readable text in a hue: mixes it toward the text colour (darker in light mode, lighter in dark). */
const ink = (color: string) => `color-mix(in srgb, ${color} 72%, var(--text))`;

/** A shuffled order that differs from the current one — preferring one that splits every phrase the pairs model knows. */
function shuffledOrder(n: number, words: string[], current: number[], seed: number): number[] {
  const r = rng(seed * 7919 + n * 31);
  const known = (ord: number[]) => bigrams(ord.map((i) => words[i])).filter((p) => PAIR_W[p] !== undefined).length;
  let fallback: number[] | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const ord = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
    if (ord.every((v, i) => words[v] === words[current[i]])) continue; // looks identical
    if (known(ord) === 0) return ord;
    fallback ??= ord;
  }
  return fallback ?? current;
}

/* ------------------------------------------------ the demo */

export function BagOfWordsDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [text, setText] = useState(EXAMPLES[1]);
  const [order, setOrder] = useState<number[] | null>(null); // null = the order as typed
  const [seed, setSeed] = useState(1);

  const words = useMemo(() => tokenize(text), [text]);
  const n = words.length;
  const ord = order && order.length === n ? order : words.map((_, i) => i);
  const shuffled = !!order && order.length === n;
  const seq = ord.map((i) => words[i]);

  const unigrams = useMemo(() => bag(words, WORD_W, false), [words]);
  const pairs = bag(bigrams(seq), PAIR_W, true);
  const origPairs = useMemo(() => bag(bigrams(words), PAIR_W, true), [words]);
  const wordScore = scoreOf(unigrams);
  const pairScore = wordScore + scoreOf(pairs);
  const pairScoreTyped = wordScore + scoreOf(origPairs);
  const pairChanged = shuffled && Math.abs(pairScore - pairScoreTyped) > 1e-9;
  const knownPairs = new Set(pairs.filter((p) => p.w !== 0).map((p) => p.key));

  const edit = (t: string) => { setText(t); setOrder(null); done(); };
  const shuffle = () => { if (n < 2) return; setOrder(shuffledOrder(n, words, ord, seed)); setSeed((s) => s + 1); done(); };

  const wv = verdictOf(wordScore), pv = verdictOf(pairScore);
  const strongestPair = [...pairs].filter((p) => p.w !== 0).sort((a, b) => Math.abs(b.w) - Math.abs(a.w))[0];
  const topWords = unigrams.filter((t) => t.w !== 0).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 3);
  const wordSum = topWords.map((t, i) => <span key={t.key}>{i ? ", " : ""}<b>{t.key}</b> {signed(t.w)}</span>);

  let caption: ReactNode, captionKey: string;
  if (n === 0) {
    caption = <>Type a short review — or tap an example — and both models will score it.</>;
    captionKey = "empty";
  } else if (shuffled) {
    caption = pairChanged
      ? <>Same words, scrambled order. The word model's score <b>didn't move at all</b> (still <b>{signed(wordScore)}</b>): to a bag of words, both sentences are the <i>same input</i>. The pairs model went from <b>{signed(pairScoreTyped)}</b> to <b>{signed(pairScore)}</b> because the phrases it relies on were split apart — it can see a little of the order.</>
      : <>Scrambled — and neither score moved. The word model never sees order, and this sentence has no phrases the pairs model knows, so there was nothing to break. Try it on a sentence with <b>not</b>.</>;
    captionKey = `shuf-${pairChanged}`;
  } else if (wv !== pv) {
    caption = <>The word model just adds up weights{topWords.length ? <> ({wordSum})</> : null} → <b>{signed(wordScore)}, {wv}</b>. Each word counts on its own, so <i>not</i> can't flip the word after it. The pairs model has a column for the phrase <b>“{strongestPair?.key}”</b> ({signed(strongestPair?.w ?? 0)}), so it says <b>{pv}</b>. A model that reads in order, like a <b>GRU</b>, learns the same flip without hand-made pairs. Now try <b>🔀 Shuffle</b>.</>;
    captionKey = `dis-${wv}-${strongestPair?.key}`;
  } else if (strongestPair) {
    caption = <>Both say <b>{wv}</b> here, but for different reasons: the pairs model also counts the phrase <b>“{strongestPair.key}”</b> ({signed(strongestPair.w)}). Hover any chip to see its weight, or edit the sentence until they disagree.</>;
    captionKey = `agree-pair-${wv}`;
  } else {
    caption = <>No negation, so both models agree: they simply add up word weights{topWords.length ? <> ({wordSum})</> : null}. Now put <b>not</b> in front of a word like <b>good</b> and watch them split.</>;
    captionKey = `agree-${wv}`;
  }

  return (
    <DemoFrame
      controls={
        <div className="col" style={{ gap: 10, width: "100%" }}>
          <div className="row" style={{ gap: 10 }}>
            <span aria-hidden style={{ fontSize: 18 }}>✍️</span>
            <input className="input grow" value={text} maxLength={110} placeholder="Type a review… e.g. the sound is not great"
              aria-label="Review text" onChange={(e) => edit(e.target.value)} style={{ height: 40, fontSize: 15, width: "100%" }} />
            {text && <button className="btn sm ghost" onClick={() => edit("")} title="Clear">Clear</button>}
          </div>
          <div className="row wrap" style={{ gap: 6, rowGap: 6 }}>
            <span className="tiny muted" style={{ fontWeight: 560, marginRight: 2 }}>Try:</span>
            {EXAMPLES.map((ex) => {
              const on = ex === text;
              return (
                <button key={ex} onClick={() => edit(ex)} className="small"
                  style={{ padding: "3px 10px", borderRadius: 999, cursor: "pointer", fontWeight: 560, whiteSpace: "nowrap",
                    background: on ? "var(--accent-soft)" : "var(--fill)", color: "var(--text)",
                    border: `1px solid ${on ? "var(--accent)" : "transparent"}`, transition: "background .2s, border-color .2s" }}>
                  {ex}
                </button>
              );
            })}
          </div>
        </div>
      }
      stats={
        <>
          <Stat label="Words in the bag" value={n} format={(v) => String(Math.round(v))} color={WORD_ACCENT} sub={`${unigrams.length} different`} />
          <Stat label="Pairs in the bag" value={Math.max(0, n - 1)} format={(v) => String(Math.round(v))} color={PAIR_ACCENT} sub={`${knownPairs.size} the pairs model knows`} />
          <Stat key={`w-${wv !== pv}`} label="Word-model score" value={wordScore} format={signed} color={sentColor(wordScore)} emphasis={n > 0 && wv !== pv} sub={n ? `says ${wv}` : "—"} />
          <Stat key={`p-${pairChanged}`} label="Pairs-model score" value={pairScore} format={signed} color={sentColor(pairScore)} emphasis={pairChanged} sub={n ? `says ${pv}` : "—"} />
        </>
      }
      caption={caption}
      captionKey={captionKey}
    >
      <Sentence seq={seq} ids={ord.map((i) => `${i}:${words[i]}`)} knownPairs={knownPairs} shuffled={shuffled}
        onShuffle={shuffle} onRestore={() => { setOrder(null); done(); }} />
      <Models unigrams={unigrams} pairs={pairs} wordScore={wordScore} pairScore={pairScore} pairScoreTyped={pairScoreTyped}
        shuffled={shuffled} pairChanged={pairChanged} empty={n === 0} />
    </DemoFrame>
  );
}

/* ------------------------------------------------ the sentence, in order (with the order test) */

function Sentence({ seq, ids, knownPairs, shuffled, onShuffle, onRestore }: {
  seq: string[]; ids: string[]; knownPairs: Set<string>; shuffled: boolean; onShuffle: () => void; onRestore: () => void;
}) {
  return (
    <div className="inset col" style={{ padding: "12px 14px", gap: 10 }}>
      <div className="row wrap between" style={{ gap: 8, rowGap: 6 }}>
        <span className="small row" style={{ gap: 8 }}>
          <b>📝 The sentence, in order</b>
          <AnimatePresence>
            {shuffled && (
              <motion.span key="b" className="badge warning" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={spring.pop}>
                shuffled
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span className="tiny faint">Order test:</span>
          <button className="btn sm" onClick={onShuffle} disabled={seq.length < 2} title="Scramble the word order — does either score change?">🔀 Shuffle the words</button>
          {shuffled && <button className="btn sm ghost" onClick={onRestore}>↩︎ Put back</button>}
        </span>
      </div>
      <div className="row wrap" style={{ gap: 0, rowGap: 8, minHeight: 34 }}>
        {seq.length === 0 && <span className="small faint">Nothing to read yet.</span>}
        {seq.map((w, i) => {
          const linkPrev = i > 0 && knownPairs.has(`${seq[i - 1]} ${w}`);
          const linkNext = i < seq.length - 1 && knownPairs.has(`${w} ${seq[i + 1]}`);
          const wt = WORD_W[w] ?? 0;
          return (
            <motion.span key={ids[i]} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={spring.gentle}
              className="row" style={{ gap: 0, marginLeft: i === 0 ? 0 : linkPrev ? 0 : 7 }}>
              {linkPrev && <span aria-hidden style={{ width: 8, height: 3, borderRadius: 2, background: PAIR_ACCENT, alignSelf: "center" }} />}
              <span style={{ padding: "5px 11px", borderRadius: 10, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap",
                background: "var(--glass-strong)", color: wt ? ink(sentColor(wt)) : "var(--text)",
                border: `1.5px solid ${linkPrev || linkNext ? PAIR_ACCENT : "var(--hairline)"}`, boxShadow: "0 1px 4px rgba(0,0,0,.08)",
                transition: "border-color .25s" }}>
                {w}
              </span>
            </motion.span>
          );
        })}
      </div>
      <span className="tiny faint">
        Words are coloured by their weight (<span style={{ color: ink(SENT_POS), fontWeight: 650 }}>positive</span> / <span style={{ color: ink(SENT_NEG), fontWeight: 650 }}>negative</span>);
        <span style={{ color: ink(PAIR_ACCENT), fontWeight: 650 }}> linked words</span> form a phrase the pairs model knows.
      </span>
    </div>
  );
}

/* ------------------------------------------------ the two bags + models */

function Models({ unigrams, pairs, wordScore, pairScore, pairScoreTyped, shuffled, pairChanged, empty }: {
  unigrams: Term[]; pairs: Term[]; wordScore: number; pairScore: number; pairScoreTyped: number; shuffled: boolean; pairChanged: boolean; empty: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const side = width === 0 || width > 700;
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: side ? "1fr 1fr" : "1fr", gap: 12 }}>
      <ModelCard icon="🧺" title="Word model" sub="bag of single words" accent={WORD_ACCENT} score={wordScore} empty={empty}
        note={shuffled ? { text: "🔒 score didn't move", color: WORD_ACCENT } : undefined}
        terms={unigrams}>
        <BagRow label="Words" hint="order is gone · sorted A→Z" terms={unigrams} />
      </ModelCard>
      <ModelCard icon="🔗" title="Pairs model" sub="words + neighbouring pairs" accent={PAIR_ACCENT} score={pairScore} empty={empty}
        ghost={pairChanged ? pairScoreTyped : undefined}
        note={shuffled ? (pairChanged ? { text: `⚡ changed — was ${signed(pairScoreTyped)}`, color: C.warn } : { text: "no known pairs to break", color: "var(--text-3)" }) : undefined}
        terms={[...unigrams, ...pairs]}>
        <BagRow label="Words" terms={unigrams} compact />
        <BagRow label="Pairs" hint="phrases never seen in training weigh 0" terms={pairs} />
      </ModelCard>
    </div>
  );
}

function ModelCard({ icon, title, sub, accent, score, terms, ghost, note, empty, children }: {
  icon: string; title: string; sub: string; accent: string; score: number; terms: Term[]; ghost?: number;
  note?: { text: string; color: string }; empty: boolean; children: ReactNode;
}) {
  const v = verdictOf(score);
  const active = terms.filter((t) => t.w !== 0).sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const shown = active.slice(0, 5);
  return (
    <div className="inset col" style={{ padding: "12px 14px", gap: 10, minWidth: 0, boxShadow: `0 3px 0 ${accent} inset` }}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <span aria-hidden style={{ fontSize: 18 }}>{icon}</span>
          <span className="col" style={{ gap: 0, minWidth: 0 }}>
            <b className="small">{title}</b>
            <span className="tiny faint truncate">{sub}</span>
          </span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={empty ? "empty" : v} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring.pop}
            style={{ padding: "4px 11px", borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
              background: empty || v === "neutral" ? "var(--fill-2)" : `${sentColor(score)}26`, color: empty ? "var(--text-3)" : ink(sentColor(score)) }}>
            {empty ? "—" : v === "positive" ? "😊 positive" : v === "negative" ? "😞 negative" : "😐 can't tell"}
          </motion.span>
        </AnimatePresence>
      </div>
      {children}
      <div className="col" style={{ gap: 10, marginTop: "auto" }}>
      <ScoreBar score={score} ghost={ghost} />
      <div className="row between tiny" style={{ gap: 8, minHeight: 18, alignItems: "flex-start" }}>
        <span className="mono muted" style={{ lineHeight: 1.5, minWidth: 0 }}>
          {shown.length === 0 ? "no known words → 0" : shown.map((t, i) => (
            <span key={t.key} style={{ whiteSpace: "nowrap" }}>
              {i ? " " : ""}<span style={{ color: ink(sentColor(t.w)), fontWeight: 700 }}>{signed(t.w * t.count)}</span> {t.pair ? `“${t.key}”` : t.key}
            </span>
          ))}
          {active.length > shown.length && " …"}
          {shown.length > 0 && <> = <b style={{ color: ink(sentColor(score)) }}>{signed(score)}</b></>}
        </span>
        <AnimatePresence>
          {note && (
            <motion.span key={note.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.snappy}
              style={{ fontWeight: 650, color: ink(note.color), whiteSpace: "nowrap" }}>
              {note.text}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}

function BagRow({ label, hint, terms, compact }: { label: string; hint?: string; terms: Term[]; compact?: boolean }) {
  return (
    <div className="col" style={{ gap: 5 }}>
      <div className="row between tiny" style={{ gap: 8 }}>
        <span className="muted" style={{ fontWeight: 650 }}>{label} <span className="faint num">· {terms.reduce((s, t) => s + t.count, 0)}</span></span>
        {hint && <span className="faint truncate">{hint}</span>}
      </div>
      <motion.div layout className="row wrap" style={{ gap: 5, rowGap: 5, minHeight: compact ? 22 : 28, alignContent: "flex-start" }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {terms.length === 0 && <motion.span key="none" className="tiny faint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>(empty)</motion.span>}
          {terms.map((t) => <BagChip key={t.key} t={t} compact={compact} />)}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function BagChip({ t, compact }: { t: Term; compact?: boolean }) {
  const [hover, setHover] = useState(false);
  const col = sentColor(t.w);
  const known = t.w !== 0;
  const fs = compact ? 11.5 : 12.5;
  const parts = t.key.split(" ");
  return (
    <motion.span layout initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: known ? 1 : 0.62, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={spring.snappy}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, padding: compact ? "1px 7px" : "3px 9px", borderRadius: 999,
        fontSize: fs, fontWeight: 600, whiteSpace: "nowrap", cursor: "default", color: "var(--text)",
        background: t.pair ? `${PAIR_ACCENT}1c` : "var(--glass-strong)",
        border: `1.5px solid ${t.pair ? (known ? PAIR_ACCENT : `${PAIR_ACCENT}55`) : known ? `${col}99` : "var(--hairline)"}` }}>
      {t.pair
        ? <span className="row" style={{ gap: 0 }}>{parts[0]}<span aria-hidden style={{ width: 7, height: 2.5, margin: "0 3px", borderRadius: 2, background: PAIR_ACCENT }} />{parts[1]}</span>
        : t.key}
      {t.count > 1 && <span className="faint num" style={{ fontSize: fs - 1.5 }}>×{t.count}</span>}
      {known && !compact && (
        <span className="num" style={{ fontSize: fs - 1.5, fontWeight: 750, padding: "0 5px", borderRadius: 6, background: `${col}24`, color: ink(col) }}>{signed(t.w)}</span>
      )}
      <AnimatePresence>
        {hover && (
          <motion.span initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }} transition={{ duration: 0.14 }}
            className="glass strong" style={{ position: "absolute", bottom: "calc(100% + 7px)", left: "50%", translateX: "-50%", width: 190, padding: "8px 10px",
              fontSize: 11.5, lineHeight: 1.45, fontWeight: 400, whiteSpace: "normal", zIndex: 40, borderRadius: 10, pointerEvents: "none", color: "var(--text)" }}>
            <b>“{t.key}”</b>{" "}
            {known
              ? <>has weight <b style={{ color: ink(col) }}>{signed(t.w)}</b>{t.count > 1 ? <> (×{t.count})</> : null} — pushes toward <b>{t.w > 0 ? "positive" : "negative"}</b>.</>
              : <>was never seen in training → weight <b>0</b>, it's ignored.</>}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.span>
  );
}

/** Diverging bar: fills from the centre toward the score (−4 … +4), with an optional ghost marker for the old score. */
function ScoreBar({ score, ghost }: { score: number; ghost?: number }) {
  const pos = (s: number) => 50 + (clamp(s, -RANGE, RANGE) / RANGE) * 50;
  const p = pos(score);
  const col = sentColor(score);
  return (
    <div className="col" style={{ gap: 3 }}>
      <div style={{ position: "relative", height: 16, borderRadius: 8,
        background: `linear-gradient(90deg, ${SENT_NEG}2e, var(--fill) 45%, var(--fill) 55%, ${SENT_POS}2e)` }}>
        <motion.div initial={false} animate={{ left: `${Math.min(p, 50)}%`, width: `${Math.abs(p - 50)}%` }} transition={spring.gentle}
          style={{ position: "absolute", top: 2, bottom: 2, borderRadius: 6, background: col, opacity: 0.85 }} />
        <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1, background: "var(--text-2)" }} />
        <AnimatePresence>
          {ghost !== undefined && (
            <motion.div key="ghost" initial={{ opacity: 0 }} animate={{ opacity: 1, left: `${pos(ghost)}%` }} exit={{ opacity: 0 }} transition={spring.gentle}
              title={`before shuffling: ${signed(ghost)}`}
              style={{ position: "absolute", top: -4, bottom: -4, width: 12, marginLeft: -6, borderRadius: 6, border: "2px dashed var(--text-2)", boxSizing: "border-box" }} />
          )}
        </AnimatePresence>
        <motion.div initial={false} animate={{ left: `${p}%` }} transition={spring.gentle}
          style={{ position: "absolute", top: "50%", width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: 9, background: col,
            border: "2.5px solid var(--glass-strong)", boxShadow: "0 2px 8px rgba(0,0,0,.25)" }} />
      </div>
      <div className="row between tiny faint" style={{ gap: 6 }}>
        <span>← negative</span>
        <span className="num">0</span>
        <span>positive →</span>
      </div>
    </div>
  );
}
