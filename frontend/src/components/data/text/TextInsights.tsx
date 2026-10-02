import { motion } from "framer-motion";
import { Fragment, useMemo } from "react";
import { spring } from "../../../design/motion";
import { classColor, withAlpha } from "../../../lib/colors";
import type { DatasetProfile } from "../../../lib/types";
import { BarList, Histogram } from "../../charts";
import { Glass, Spinner } from "../../glass";
import { SectionTitle } from "../ui";
import { lengthStats, tokenize } from "./textData";
import { textOn } from "../contrast";

/** Class colours follow the alphabetical order the trained models use (LabelEncoder), so they match later steps. */
export const textClassColor = (label: string, labels: string[]) => classColor(label, [...labels].sort());

/** How many texts each label has, with a one-line verdict. */
export function TextBalanceCard({ profile, loading }: { profile: DatasetProfile; loading: boolean }) {
  const cb = profile.class_balance;
  if (!cb) return null;
  const total = cb.counts.reduce((a, b) => a + b, 0) + cb.other;
  const min = Math.min(...cb.counts), max = Math.max(...cb.counts);
  const rare = cb.labels[cb.counts.indexOf(min)];
  const ratio = max / Math.max(1, min);
  return (
    <Glass animate_in>
      <SectionTitle icon="⚖️" title="Texts per label" right={loading ? <Spinner size={14} color="var(--accent)" /> : null}
        help="How many texts carry each answer. If one label is rare, the model sees few examples of it and may learn to ignore it."
        sub="Even bars = every label gets a fair share of practice." />
      <BarList labels={cb.labels} values={cb.counts} colors={cb.labels.map((l) => textClassColor(l, cb.labels))}
        format={(v) => `${total ? Math.round((v / total) * 100) : 0}%`} />
      <div className="row wrap tiny faint" style={{ gap: 10, marginTop: 8 }}>
        {cb.labels.map((l, i) => <span key={l} className="num">{l}: {cb.counts[i].toLocaleString()}</span>)}
        {cb.other > 0 && <span className="num">other: {cb.other.toLocaleString()}</span>}
      </div>
      <Insight icon={ratio < 1.3 ? "✅" : ratio < 3 ? "👍" : "⚠️"}>
        {ratio < 1.3 ? <>Nicely balanced — every label has roughly the same number of texts, so each gets a fair share of practice.</>
          : ratio < 3 ? <>A little uneven — “{rare}” is the rarest with <b>{min.toLocaleString()}</b> texts. Usually fine.</>
            : <>Uneven — only <b>{Math.round((min / total) * 100)}%</b> of texts are “{rare}”. A model that always says “{cb.labels[cb.counts.indexOf(max)]}” would already be right {Math.round((max / total) * 100)}% of the time — that's the score to beat.</>}
      </Insight>
    </Glass>
  );
}

/** Words per text, as a histogram. */
export function TextLengthCard({ profile }: { profile: DatasetProfile }) {
  const st = lengthStats(profile.length_hist);
  if (!profile.length_hist || !st) return null;
  return (
    <Glass animate_in>
      <SectionTitle icon="📏" title="How long are the texts?"
        help="Number of words in each text. Neural text models read a fixed number of words — you'll choose how many in the Prepare step."
        sub="Each bar counts texts of that many words." />
      <Histogram data={profile.length_hist} color="var(--accent-2)" height={150} />
      <Insight icon="📝">
        Between <b>{Math.round(st.min)}</b> and <b>{Math.round(st.max)}</b> words, about <b>{Math.round(st.mean)}</b> on average.
        {st.mean < 6 ? " Short texts give the model few clues each — every word counts." : st.mean > 60 ? " Long texts: reading order matters less than which words show up." : ""}
      </Insight>
    </Glass>
  );
}

/** Words that show up much more often in one label's texts than in the others', as chips sized by how telling they are. */
export function TopWordsCard({ profile }: { profile: DatasetProfile }) {
  const classes = profile.class_balance?.labels ?? [];
  const groups = (profile.top_words ?? []).slice().sort((a, b) => classes.indexOf(a.class) - classes.indexOf(b.class));
  if (!groups.length) return null;
  const ws = groups.flatMap((g) => g.words.map((w) => w.w)).filter((w) => w > 0);
  const maxW = Math.max(1e-6, ...ws), minW = Math.min(maxW, ...ws);
  return (
    <Glass animate_in>
      <SectionTitle icon="🔎" title="Telling words for each label"
        help="For every word: the share of this label's texts containing it, minus the share of the other labels' texts containing it. Big chips are strong clues. Bag-of-words models learn exactly this kind of evidence."
        sub="Bigger chip = the word is a stronger clue for that label." />
      <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${groups.length > 3 ? 200 : 240}px, 1fr))`, gap: 14 }}>
        {groups.map((g, gi) => {
          const c = textClassColor(g.class, classes);
          return (
            <div key={g.class} className="inset col" style={{ padding: 12, gap: 10 }}>
              <span className="row" style={{ gap: 8 }}>
                <span className="badge" style={{ background: c, color: textOn(c) }}>{g.class}</span>
                <span className="tiny faint">{g.words.length} clues</span>
              </span>
              <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                {g.words.filter((w) => w.w > 0).map((w, k) => {
                  // spread the sizes over the range actually present, so differences are visible
                  const t = maxW - minW < 1e-6 ? 0.6 : Math.max(0, (w.w - minW) / (maxW - minW));
                  return (
                    <motion.span key={w.t} title={`${w.t}: +${Math.round(w.w * 100)} percentage points more common in “${g.class}”`}
                      initial={{ opacity: 0, scale: 0.4, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ...spring.pop, delay: 0.1 + gi * 0.08 + k * 0.035 }}
                      whileHover={{ scale: 1.08, y: -2 }}
                      style={{ fontSize: 11 + t * 9, fontWeight: 520 + Math.round(t * 2) * 100, padding: `${3 + t * 3}px ${8 + t * 4}px`, borderRadius: 999, background: withAlpha(c, 0.1 + t * 0.28), color: "var(--text)", border: `1px solid ${withAlpha(c, 0.25 + t * 0.4)}`, lineHeight: 1.2, cursor: "default" }}>
                      {w.t}
                    </motion.span>
                  );
                })}
                {!g.words.some((w) => w.w > 0) && <span className="tiny faint">No word stands out for this label.</span>}
              </div>
            </div>
          );
        })}
      </div>
      <Insight icon="💡">
        Notice what's <b>missing</b>: little words like “not” appear in every label, so they never stand out on their own — yet “not good” means the opposite of “good”.
        That's why models that read words <b>in order</b> can beat simple word counts.
      </Insight>
    </Glass>
  );
}

/** A few example texts per label, as chat bubbles; telling words are highlighted. */
export function ExamplesCard({ profile }: { profile: DatasetProfile }) {
  const classes = profile.class_balance?.labels ?? Object.keys(profile.examples ?? {});
  const clue = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const g of profile.top_words ?? []) m[g.class] = new Set(g.words.filter((w) => w.w > 0).slice(0, 8).map((w) => w.t));
    return m;
  }, [profile.top_words]);
  const entries = classes.map((c) => [c, profile.examples?.[c] ?? []] as const).filter(([, v]) => v.length);
  if (!entries.length) return null;
  return (
    <Glass animate_in>
      <SectionTitle icon="💬" title="Example texts"
        help="Real texts from your data with their labels. Read a few: if you can tell the labels apart, a model probably can too. Highlighted words are the telling words from above."
        sub="A few messages from each label — highlighted words are strong clues." />
      <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${entries.length > 3 ? 220 : 260}px, 1fr))`, gap: 14 }}>
        {entries.map(([cls, texts], ci) => {
          const c = textClassColor(cls, classes);
          return (
            <div key={cls} className="col" style={{ gap: 8 }}>
              <span className="row" style={{ gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: c }} />
                <b className="small">{cls}</b>
              </span>
              {texts.map((t, k) => (
                <motion.div key={k} initial={{ opacity: 0, y: 10, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.gentle, delay: 0.1 + ci * 0.1 + k * 0.07 }}
                  className="small" style={{ alignSelf: k % 2 ? "flex-end" : "flex-start", maxWidth: "94%", padding: "8px 12px", lineHeight: 1.5, borderRadius: k % 2 ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: withAlpha(c, 0.1), border: `1px solid ${withAlpha(c, 0.28)}`, wordBreak: "break-word" }}>
                  <Highlighted text={t} words={clue[cls]} color={c} />
                </motion.div>
              ))}
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

/** Render text with clue words emphasised (matched on the same tokens the backend uses). */
export function Highlighted({ text, words, color }: { text: string; words?: Set<string>; color: string }) {
  if (!words?.size) return <>{text}</>;
  const parts = text.split(/([A-Za-z0-9']+)/);
  return (
    <>
      {parts.map((p, i) => {
        const tok = tokenize(p)[0];
        return tok && words.has(tok)
          ? <b key={i} style={{ color: "var(--text)", background: withAlpha(color, 0.25), borderRadius: 4, padding: "0 3px" }}>{p}</b>
          : <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function Insight({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="inset row small" style={{ gap: 8, padding: "9px 12px", marginTop: 14, lineHeight: 1.5, alignItems: "flex-start" }}>
      <span>{icon}</span><span className="muted">{children}</span>
    </motion.div>
  );
}
