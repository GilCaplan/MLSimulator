import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring, stagger } from "../../../design/motion";
import { classColor } from "../../../lib/colors";
import type { PrepareReport } from "../../../lib/types";
import { AnimatedNumber, Glass, InfoTip, Segmented } from "../../glass";
import { tokenize } from "../../data/text/textData";
import { ClassSplits } from "../image/ImageResults";
import { SPLIT_COLORS } from "../SplitScaleCards";
import { textOn } from "../../data/contrast";

/** What the text pipeline produced: counts, vocabulary, class mix and tokenised example sentences. */
export function TextResults({ report, maxLen, ngram, classTotals }: { report: PrepareReport; maxLen: number; ngram: 1 | 2; classTotals: Record<string, number> | null }) {
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <Counters report={report} />
      <TokenizedExamples report={report} maxLen={maxLen} />
      <Vocabulary report={report} ngram={ngram} />
      {report.class_counts_before && <ClassSplits report={report} totals={classTotals} />}
      {report.warnings.length > 0 && (
        <Glass animate_in style={{ padding: 16 }}>
          <div className="col small" style={{ gap: 6 }}>
            {report.warnings.map((w) => <span key={w} style={{ color: "var(--warning)" }}>⚠️ {w}</span>)}
          </div>
        </Glass>
      )}
    </motion.div>
  );
}

function Counters({ report }: { report: PrepareReport }) {
  const tiles = [
    { icon: "📚", label: "training texts", value: report.splits.train, color: SPLIT_COLORS.train, tip: "" },
    { icon: "🧭", label: "validation texts", value: report.splits.val, color: SPLIT_COLORS.val, tip: "" },
    { icon: "🔒", label: "test texts", value: report.splits.test, color: SPLIT_COLORS.test, tip: "" },
    { icon: "🛍️", label: "bag-of-words columns", value: report.n_features, color: "var(--accent-2)", tip: "Words (and pairs) the classic models count — one column each." },
    { icon: "🔢", label: "words networks know", value: report.vocab_size ?? 0, color: "var(--success)", tip: "Every word seen in training gets a number (plus two specials: padding and 'unknown'). Neural text models learn a vector for each." },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
      {tiles.map((t, i) => (
        <Glass key={t.label} animate_in style={{ padding: "14px 16px" }}>
          <div className="row" style={{ gap: 8 }}>
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.1 + i * 0.06 }} style={{ fontSize: 18 }}>{t.icon}</motion.span>
            <b className="num" style={{ fontSize: 24, color: t.value ? t.color : "var(--text-3)", letterSpacing: -0.5 }}>
              <AnimatedNumber value={t.value} format={(v) => Math.round(v).toLocaleString()} duration={1.1} />
            </b>
          </div>
          <div className="small muted row" style={{ marginTop: 2, gap: 4 }}>{t.label}{t.tip && <InfoTip text={t.tip} />}</div>
        </Glass>
      ))}
    </div>
  );
}

/** Training sentences split into the tokens the models see; tokens past the sequence length are greyed. */
function TokenizedExamples({ report, maxLen }: { report: PrepareReport; maxLen: number }) {
  const ex = report.examples ?? [];
  if (!ex.length) return null;
  const classes = report.classes ?? [];
  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>✂️ Texts, split into words</h3>
          <InfoTip text="Tokenising: the text is lower-cased and cut into words (punctuation dropped). Bag-of-words models count these; neural models read them in order, up to the sequence length." />
        </div>
        <span className="row small muted" style={{ gap: 12 }}>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--accent)" }} />read</span>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--fill-2)" }} />past {maxLen} words (cut)</span>
        </span>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {ex.map((e, r) => {
          const toks = tokenize(e.text);
          const c = classColor(e.label, classes);
          return (
            <div key={r} className="inset col" style={{ padding: "10px 12px", gap: 8 }}>
              <div className="row between" style={{ gap: 10 }}>
                <span className="small muted" style={{ lineHeight: 1.45, minWidth: 0 }}>“{e.text}”</span>
                <span className="badge" style={{ background: c, color: textOn(c), flexShrink: 0 }}>{e.label}</span>
              </div>
              <div className="row wrap" style={{ gap: 4 }}>
                {toks.map((w, i) => {
                  const cut = i >= maxLen;
                  return (
                    <motion.span key={i} initial={{ opacity: 0, y: -8, scale: 0.7 }} animate={{ opacity: cut ? 0.45 : 1, y: 0, scale: 1 }}
                      transition={{ ...spring.pop, delay: 0.15 + r * 0.08 + Math.min(i, 24) * 0.025 }}
                      className="badge" style={{ height: 22, fontSize: 11.5, background: cut ? "var(--fill)" : "var(--accent-soft)", color: cut ? "var(--text-3)" : "var(--accent)", textDecoration: cut ? "line-through" : "none" }}>
                      {w}
                    </motion.span>
                  );
                })}
                <span className="tiny faint num" style={{ alignSelf: "center", marginLeft: 4 }}>{toks.length} words</span>
              </div>
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

/** A sample of the bag-of-words vocabulary, with word pairs highlighted. */
function Vocabulary({ report, ngram }: { report: PrepareReport; ngram: 1 | 2 }) {
  const all = report.feature_names_out ?? [];
  const [filter, setFilter] = useState<"all" | "words" | "pairs">("all");
  const nPairs = all.filter((w) => w.includes(" ")).length;
  const shown = useMemo(() => all.filter((w) => filter === "all" || (filter === "pairs") === w.includes(" ")).slice(0, 160), [all, filter]);
  if (!all.length) return null;
  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>📖 The vocabulary</h3>
          <InfoTip text="Every entry is one column of numbers for the bag-of-words models. Shown alphabetically — a sample of the first entries." />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="small muted num">showing {shown.length} of {report.n_features.toLocaleString()}</span>
          {ngram === 2 && nPairs > 0 && (
            <Segmented<"all" | "words" | "pairs"> size="sm" value={filter} onChange={setFilter}
              options={[{ value: "all", label: "All" }, { value: "words", label: "Words" }, { value: "pairs", label: "Pairs" }]} />
          )}
        </div>
      </div>
      <div className="inset scroll" style={{ padding: 12, maxHeight: 220 }}>
        <motion.div key={filter} className="row wrap" style={{ gap: 5 }} initial="hidden" animate="show" variants={stagger(0.006)}>
          {shown.map((w) => {
            const pair = w.includes(" ");
            return (
              <motion.span key={w} variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1, transition: spring.snappy } }}
                className="badge" style={{ height: 22, fontSize: 11.5, background: pair ? "var(--accent-soft)" : "var(--glass-strong)", color: pair ? "var(--accent)" : "var(--text-2)", border: pair ? "1px solid var(--accent)" : "1px solid var(--hairline)", fontWeight: pair ? 650 : 520 }}>
                {w}
              </motion.span>
            );
          })}
        </motion.div>
      </div>
      <span className="tiny faint" style={{ display: "block", marginTop: 8 }}>
        {ngram === 2
          ? <>Highlighted entries are <b>word pairs</b> — {nPairs.toLocaleString()} of the first {all.length} entries. They let the classic models see a little word order.</>
          : <>Single words only. Switch to <b>Words + pairs</b> above to add entries like “not good”.</>}
      </span>
    </Glass>
  );
}
