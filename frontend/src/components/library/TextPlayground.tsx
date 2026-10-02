import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { classColor } from "../../lib/colors";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { SavedModel, TextPredictResponse } from "../../lib/types";
import { Glass, InfoTip, Spinner } from "../glass";
import { useSize } from "../charts";
import { ExplainedSentence, InfluenceLegend, type Tok } from "../train/textKit";
import { useDebounced } from "./inputs";
import { PredictionPanel } from "./PredictionPanel";
import { SectionTitle, rise } from "./shared";
import { textOn, tint } from "../charts/contrast";

const SENTIMENT = /sentiment|review|positive|negative|mood|opinion/i;
const SKIP = new Set(["the", "a", "an", "is", "was", "it", "this", "that", "and", "or", "of", "to", "in", "on", "for", "my", "i", "very", "not", "no", "never"]);

/** Insert "not" in front of the word that pushed the answer the most (the classic test of whether a model reads in order). */
function addNot(text: string, tokens: Tok[]): string | null {
  const cand = tokens.filter((t) => !SKIP.has(t.t) && t.w > 0).sort((a, b) => b.w - a.w)[0];
  if (!cand) return null;
  const re = new RegExp(`\\b(${cand.t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "i");
  if (!re.test(text)) return null;
  return text.replace(re, "not $1");
}

/** "Try it live" for text models: type a sentence, the model answers as you type and colours every word by its influence. */
export function TextPlayground({ model }: { model: SavedModel }) {
  const t = model.detail?.text;
  const examples = useMemo(() => {
    const seen = new Set<string>();
    const out: { text: string; wrong: boolean }[] = [];
    for (const e of t?.examples ?? []) if (!seen.has(e.text)) { seen.add(e.text); out.push({ text: e.text, wrong: e.pred !== e.true }); }
    for (const m of t?.mistakes ?? []) if (!seen.has(m.text) && out.length < 9) { seen.add(m.text); out.push({ text: m.text, wrong: true }); }
    return out.slice(0, 9);
  }, [t]);
  const [text, setText] = useState(() => examples.find((e) => !e.wrong)?.text ?? examples[0]?.text ?? "");
  const [result, setResult] = useState<TextPredictResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [wasNot, setWasNot] = useState<{ before: string; p: number; text: string; after: string } | null>(null);
  const [gridRef, { width }] = useSize<HTMLDivElement>();
  const wide = width > 860;
  const seq = useRef(0);
  const lastError = useRef<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const sentiment = SENTIMENT.test(model.target) || (model.classes ?? []).some((c) => /pos|neg/i.test(String(c)));

  const q = useDebounced(text, 250);
  useEffect(() => {
    if (!q.trim()) { setResult(null); return; }
    const s = ++seq.current;
    setBusy(true);
    api.predictText(model.id, [q])
      .then((r) => { if (s === seq.current) { setResult(r); setResultText(q); lastError.current = null; } })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== lastError.current) toast.error(msg);
        lastError.current = msg;
      })
      .finally(() => s === seq.current && setBusy(false));
  }, [q, model.id]);

  const pred = result ? String(result.predictions[0]) : null;
  const classes = result?.classes ?? model.classes ?? [];
  const notVersion = result && sentiment ? addNot(q, result.tokens) : null;
  const empty = !text.trim();
  const probOf = (r: TextPredictResponse, label: string) => {
    const i = (r.classes ?? model.classes ?? []).map(String).indexOf(label);
    return i >= 0 ? r.probabilities?.[0]?.[i] ?? null : null;
  };
  const pairs = (model.pipeline?.text?.ngram_max ?? 1) >= 2;
  const reader = model.family === "torch";

  const pick = (s: string) => { setText(s); setWasNot(null); area.current?.focus(); };
  const tryNot = () => {
    if (!notVersion || !result || !pred) return;
    setWasNot({ before: pred, p: probOf(result, pred) ?? 0, text: q, after: notVersion });
    setText(notVersion);
  };

  return (
    <motion.section variants={rise}>
      <SectionTitle id="try" icon="⌨️" title="Try it live"
        subtitle="Type any sentence — the model answers as you type, and colours every word by how much it pushed the answer." />
      <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1.55fr) minmax(320px, 1fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <Glass style={{ minWidth: 0 }}>
          <div className="col" style={{ gap: 14 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <h3 className="row" style={{ gap: 6 }}>Your text{model.text_column ? <span className="tiny faint" style={{ fontWeight: 500 }}>· {model.text_column}</span> : null}</h3>
              <span className="row tiny faint" style={{ gap: 6 }}>
                <AnimatePresence>{busy && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Spinner size={11} /></motion.span>}</AnimatePresence>
                {text.trim() ? `${text.trim().split(/\s+/).length} words` : "answers as you type"}
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <textarea ref={area} className="input" value={text} onChange={(e) => { setText(e.target.value); setWasNot(null); }} placeholder="Type a sentence…" rows={4} spellCheck={false}
                style={{ width: "100%", minHeight: 118, resize: "vertical", padding: "14px 16px", fontSize: 17, lineHeight: 1.5, borderRadius: 16, fontFamily: "inherit" }} />
              {pred && !empty && (
                <motion.span key={pred} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}
                  style={{ position: "absolute", right: 12, bottom: 12, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: textOn(classColor(pred, classes)), background: classColor(pred, classes), boxShadow: `0 4px 14px ${tint(classColor(pred, classes), 33)}`, pointerEvents: "none" }}>
                  {pred}
                </motion.span>
              )}
            </div>

            {examples.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                <span className="tiny faint">Or try one of its test messages{examples.some((e) => e.wrong) ? " — the ones with ✗ fooled it" : ""}:</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {examples.map((e, k) => (
                    <motion.button key={e.text} onClick={() => pick(e.text)} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.pop, delay: k * 0.03 }}
                      whileHover={{ y: -2, scale: 1.03 }} whileTap={{ scale: 0.95 }} className="btn sm" title={e.text}
                      style={{ maxWidth: 280, borderColor: text === e.text ? "var(--accent)" : undefined, background: text === e.text ? "var(--accent-soft)" : undefined }}>
                      {e.wrong && <span style={{ color: "var(--danger)" }}>✗</span>}
                      <span className="truncate">{e.text}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            <div className="divider" style={{ margin: "4px 0" }} />

            <div className="col" style={{ gap: 10 }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <h4 className="row" style={{ gap: 6 }}>
                  How each word pushed
                  <InfoTip text="For every word we ask the model again without it. If its confidence in the answer drops, the word was pushing towards it (green). If it rises, the word was arguing against it (red). This is called occlusion." />
                </h4>
                <InfluenceLegend width={110} />
              </div>
              <div className="inset" style={{ padding: "14px 16px", minHeight: 64 }}>
                {empty ? (
                  <span className="small faint">Start typing and the words appear here, coloured by influence.</span>
                ) : result && pred ? (
                  <ExplainedSentence tokens={result.tokens} pred={pred} size={16}
                    placeholder={result.tokens.length ? "No single word stands out — hover to inspect." : "None of these words are in its vocabulary — it's just guessing."} />
                ) : (
                  <div className="row" style={{ gap: 6 }}>{[60, 40, 72, 50].map((w, i) => <div key={i} className="skeleton" style={{ width: w, height: 26, borderRadius: 9 }} />)}</div>
                )}
              </div>
              {result && pred && result.tokens.length > 0 && result.tokens.every((x) => Math.abs(x.w) < 0.005) && (
                <span className="tiny muted">🤷 None of these words move it — they may all be outside its vocabulary, so it falls back on its usual answer.</span>
              )}
            </div>

            <AnimatePresence>
              {sentiment && (notVersion || wasNot) && result && pred && !(wasNot && resultText !== wasNot.after) && (
                <motion.div key="nudge" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring.gentle}
                  className="inset row wrap" style={{ gap: 12, padding: "12px 14px", alignItems: "center", background: "linear-gradient(135deg, rgba(94,92,230,.10), rgba(191,90,242,.10))", borderStyle: "dashed" }}>
                  <motion.span animate={{ rotate: [0, -12, 12, 0] }} transition={{ repeat: Infinity, duration: 2.4, repeatDelay: 2 }} style={{ fontSize: 22 }}>💡</motion.span>
                  {wasNot ? (() => {
                    const now = probOf(result, wasNot.before) ?? 0;
                    const drop = wasNot.p - now;
                    const how = reader ? "This network reads the words in order, so “not” can change what the next word means." : pairs ? "It counts word pairs, so “not great” is a clue of its own." : "";
                    return (
                      <>
                        <span className="small grow" style={{ lineHeight: 1.5, minWidth: 200 }}>
                          {pred !== wasNot.before
                            ? <><b>It noticed!</b> <span className="muted">Adding “not” flipped it from “{wasNot.before}” to “{pred}”. {how}</span></>
                            : drop > 0.1
                              ? <><b>It half-noticed.</b> <span className="muted">Still “{pred}”, but its confidence fell from {Math.round(wasNot.p * 100)}% to {Math.round(now * 100)}% — the “not” is pulling the other way. {how}</span></>
                              : <><b>It didn't notice.</b> <span className="muted">Still “{pred}”{drop > 0.02 ? <> and barely less sure</> : null}. {reader || pairs ? "Maybe it never saw this phrase while training." : "A model that counts single words sees “not great” as “not” + “great” — try word pairs, a GRU or a Transformer."}</span></>}
                        </span>
                        <button className="btn sm ghost" onClick={() => { setText(wasNot.text); setWasNot(null); }}>↩ Undo</button>
                      </>
                    );
                  })() : (
                    <>
                      <span className="small grow" style={{ lineHeight: 1.5, minWidth: 200 }}>
                        <b>Try adding <i>not</i>.</b> <span className="muted">Does the model notice that “not good” isn't good? Models that only count words often don't.</span>
                      </span>
                      <button className="btn sm primary" onClick={tryNot}>Add “not” →</button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Glass>

        <Glass variant="strong" style={{ position: wide ? "sticky" : "relative", top: 58, minWidth: 0, zIndex: 2 }}>
          {empty ? (
            <div className="col center" style={{ minHeight: 280, gap: 12, textAlign: "center" }}>
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ fontSize: 40 }}>⌨️</motion.div>
              <b>Waiting for your words</b>
              <span className="small muted" style={{ maxWidth: 240 }}>Type a sentence on the left, or click one of the examples.</span>
            </div>
          ) : (
            <PredictionPanel model={model} result={result} warming={!result} busy={busy && !!result} targetRange={null} />
          )}
        </Glass>
      </div>
    </motion.section>
  );
}
