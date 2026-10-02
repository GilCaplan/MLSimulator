import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring, stagger } from "../../../design/motion";
import { api } from "../../../lib/api";
import { toast } from "../../../lib/store";
import type { DatasetSummary, TextSetInfo } from "../../../lib/types";
import { Glass, Slider, Spinner } from "../../glass";
import { SectionTitle } from "../ui";

/** Two tiny sample messages per set, with their label colour, hinting at what's inside. */
const SNIPPETS: Record<string, { t: string; c: string }[]> = {
  reviews: [{ t: "the sound is not bad", c: "#30D158" }, { t: "battery is awful", c: "#FF375F" }],
  tickets: [{ t: "charged twice, refund?", c: "#0A84FF" }, { t: "app crashes on login", c: "#BF5AF2" }],
  spam: [{ t: "WIN a free prize now", c: "#FF9F0A" }, { t: "running late, 5pm?", c: "#30D158" }],
};

/** Gallery of built-in text collections with a few knobs before creating one. */
export function TextSetsPanel({ onLoaded }: { onLoaded: (d: DatasetSummary) => void }) {
  const [sets, setSets] = useState<Record<string, TextSetInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.textSets().then(setSets).catch((e) => { setError(e instanceof Error ? e.message : String(e)); toast.error(e); });
  }, []);

  const choose = (name: string) => {
    if (sel === name) return setSel(null);
    setSel(name);
    setParams({ ...(sets?.[name].params ?? {}) });
  };
  const create = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const d = await api.createTextSet(sel, params);
      toast.success(`Created “${d.name}” — ${d.n_rows.toLocaleString()} texts.`);
      onLoaded(d);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (error && !sets) return <Glass><p className="small" style={{ color: "var(--danger)" }}>⚠️ Couldn't load the text sets: {error}</p></Glass>;

  const info = sel ? sets?.[sel] : null;
  return (
    <div className="col" style={{ gap: 16 }}>
      <Glass>
        <SectionTitle icon="💬" title="Text sets" sub="Ready-made collections of labelled messages, written on your computer in a moment." />
        {!sets ? (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 170, borderRadius: 16 }} />)}
          </div>
        ) : (
          <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {Object.entries(sets).map(([name, s]) => {
              const active = sel === name;
              return (
                <motion.button key={name}
                  variants={{ hidden: { opacity: 0, y: 12, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: spring.gentle } }}
                  whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => choose(name)}
                  className="inset col"
                  style={{ padding: 14, gap: 10, textAlign: "left", cursor: "pointer", alignItems: "stretch", color: "inherit", borderColor: active ? "var(--accent)" : "var(--hairline)", boxShadow: active ? "0 0 0 3px var(--accent-soft)" : undefined, transition: "border-color .2s, box-shadow .2s" }}>
                  <div className="col" style={{ gap: 5 }}>
                    {(SNIPPETS[name] ?? []).map((m, k) => (
                      <motion.span key={k} animate={{ y: [0, -2, 0] }} transition={{ duration: 2.8, repeat: Infinity, delay: k * 0.5 }}
                        className="row tiny" style={{ gap: 6, alignSelf: k % 2 ? "flex-end" : "flex-start", maxWidth: "92%", padding: "5px 10px", borderRadius: k % 2 ? "12px 12px 4px 12px" : "12px 12px 12px 4px", background: "var(--glass-strong)", border: "1px solid var(--hairline)", fontWeight: 560 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 4, background: m.c, flexShrink: 0 }} />
                        <span className="truncate">{m.t}</span>
                      </motion.span>
                    ))}
                  </div>
                  <div className="row between">
                    <b style={{ fontSize: 14 }}>{s.emoji} {s.label}</b>
                    <span className="badge accent">Classify</span>
                  </div>
                  <span className="small muted" style={{ lineHeight: 1.45 }}>{s.blurb}</span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </Glass>

      <AnimatePresence mode="wait">
        {sel && info && (
          <motion.div key={sel} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={spring.gentle}>
            <Glass>
              <SectionTitle icon={info.emoji} title={info.label} sub="Set the knobs, then create your texts." />
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px 28px", alignItems: "start" }}>
                {"n" in params && (
                  <Slider label="Number of texts" help="More examples = better models, but slower training. A few thousand is plenty on a laptop."
                    value={params.n} min={100} max={20000} log integer format={(v) => v.toLocaleString()}
                    onChange={(v) => setParams((p) => ({ ...p, n: v }))} />
                )}
                {"negation_rate" in params && (
                  <div className="col" style={{ gap: 8 }}>
                    <Slider label="Negation rate" help="Share of reviews that flip their adjective with 'not' — 'not good' is negative, 'not bad' is positive. Word counters find these hard; models that read in order don't."
                      value={params.negation_rate} min={0} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(v) => setParams((p) => ({ ...p, negation_rate: v }))} />
                    <NegationNote rate={params.negation_rate} />
                  </div>
                )}
              </div>
              <div className="row between wrap" style={{ marginTop: 18, gap: 12 }}>
                <span className="tiny faint">Same knobs → same texts every time, so experiments are repeatable.</span>
                <motion.button className="btn gradient lg" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} disabled={busy} onClick={create}>
                  {busy ? <Spinner size={16} /> : "✨"} Create {params.n ? `${Math.round(params.n).toLocaleString()} texts` : "the set"}
                </motion.button>
              </div>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "How often reviews say 'not …'": a live 10-review strip where negated ones are marked. */
function NegationNote({ rate }: { rate: number }) {
  const n = Math.round(rate * 10);
  return (
    <div className="inset col" style={{ padding: "10px 12px", gap: 8 }}>
      <span className="tiny muted" style={{ lineHeight: 1.5 }}>How often reviews say <b>“not …”</b> — out of every 10 reviews, <b className="num">{n}</b> {n === 1 ? "says" : "say"} things like “not good” or “not bad”.</span>
      <div className="row" style={{ gap: 4 }}>
        {Array.from({ length: 10 }, (_, k) => (
          <motion.span key={k} animate={{ background: k < n ? "rgba(255,159,10,.9)" : "var(--fill-2)", scale: k < n ? 1 : 0.9 }} transition={spring.snappy}
            style={{ flex: 1, height: 18, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white" }}>
            {k < n ? "not" : ""}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
