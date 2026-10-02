import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring, stagger } from "../../../design/motion";
import { api } from "../../../lib/api";
import { toast } from "../../../lib/store";
import type { DatasetSummary, RatingsSetInfo } from "../../../lib/types";
import { Glass, Slider, Spinner } from "../../glass";
import { SectionTitle } from "../ui";
import { fmtInt, posterColor } from "./ratingsData";
import { SparsityGrid } from "./viz";

/** Average ratings per person in the built-in generator (15–70, uniform). */
const AVG_PER_USER = 42;

/** Gallery of built-in ratings collections, with user / item count sliders before creating one. */
export function RatingsSetsPanel({ onLoaded }: { onLoaded: (d: DatasetSummary) => void }) {
  const [sets, setSets] = useState<Record<string, RatingsSetInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.ratingsSets()
      .then((s) => {
        setSets(s);
        // only one set? open it straight away
        const names = Object.keys(s);
        if (names.length === 1) { setSel(names[0]); setParams({ ...s[names[0]].params }); }
      })
      .catch((e) => { setError(e instanceof Error ? e.message : String(e)); toast.error(e); });
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
      const d = await api.createRatingsSet(sel, params);
      toast.success(`Created “${d.name}” — ${d.n_rows.toLocaleString()} ratings.`);
      onLoaded(d);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (error && !sets) return <Glass><p className="small" style={{ color: "var(--danger)" }}>⚠️ Couldn't load the ratings sets: {error}</p></Glass>;

  const info = sel ? sets?.[sel] : null;
  const nU = params.n_users ?? 0, nI = params.n_items ?? 0;
  const perUser = Math.min(AVG_PER_USER, nI);
  const estRatings = nU * perUser;
  const estSparsity = nU && nI ? 1 - perUser / nI : 0.9;
  return (
    <div className="col" style={{ gap: 16 }}>
      <Glass>
        <SectionTitle icon="🎬" title="Ratings sets" sub="Ready-made “who rated what” collections, generated on your computer in a moment." />
        {!sets ? (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            <div className="skeleton" style={{ height: 180, borderRadius: 16 }} />
          </div>
        ) : (
          <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {Object.entries(sets).map(([name, s]) => {
              const active = sel === name;
              return (
                <motion.button key={name}
                  variants={{ hidden: { opacity: 0, y: 12, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: spring.gentle } }}
                  whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => choose(name)}
                  className="inset col"
                  style={{ padding: 14, gap: 10, textAlign: "left", cursor: "pointer", alignItems: "stretch", color: "inherit", borderColor: active ? "var(--accent)" : "var(--hairline)", boxShadow: active ? "0 0 0 3px var(--accent-soft)" : undefined, transition: "border-color .2s, box-shadow .2s" }}>
                  <PosterShelf seed={name} />
                  <div className="row between">
                    <b style={{ fontSize: 14 }}>{s.emoji} {s.label}</b>
                    <span className="badge accent">Recommend</span>
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
              <SectionTitle icon={info.emoji} title={info.label} sub="Choose how many people and items, then create the ratings." />
              <div className="row wrap" style={{ gap: "16px 28px", alignItems: "stretch" }}>
                <div className="col" style={{ gap: 16, flex: "2 1 320px" }}>
                  {"n_users" in params && (
                    <Slider label="👤 People" help="How many viewers rate films. More people = more overlap in taste to learn from, but slower training."
                      value={params.n_users} min={100} max={3000} log integer format={(v) => v.toLocaleString()}
                      onChange={(v) => setParams((p) => ({ ...p, n_users: v }))} />
                  )}
                  {"n_items" in params && (
                    <Slider label="🎬 Films" help="How many different films there are. Each person only rates 15–70 of them, so more films = an emptier grid and a longer tail."
                      value={params.n_items} min={50} max={2000} log integer format={(v) => v.toLocaleString()}
                      onChange={(v) => setParams((p) => ({ ...p, n_items: v }))} />
                  )}
                </div>
                <div className="inset col" style={{ flex: "1 1 240px", padding: 12, gap: 8 }}>
                  <span className="eyebrow">The ratings grid</span>
                  <SparsityGrid sparsity={estSparsity} cols={18} rows={6} />
                  <span className="tiny muted" style={{ lineHeight: 1.5 }}>
                    <b className="num">{fmtInt(nU)}</b> people × <b className="num">{fmtInt(nI)}</b> films = <b className="num">{fmtInt(nU * nI)}</b> cells,
                    but only about <b className="num">{fmtInt(estRatings)}</b> ratings — roughly <b className="num">{Math.round(estSparsity * 100)}%</b> of the grid stays empty.
                    Filling those blanks is the recommender's job.
                  </span>
                </div>
              </div>
              <div className="row between wrap" style={{ marginTop: 18, gap: 12 }}>
                <span className="tiny faint">Same knobs → same ratings every time, so experiments are repeatable.</span>
                <motion.button className="btn gradient lg" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} disabled={busy} onClick={create}>
                  {busy ? <Spinner size={16} /> : "✨"} Create ≈{fmtInt(estRatings)} ratings
                </motion.button>
              </div>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A little shelf of film posters with star ratings bobbing on top. */
function PosterShelf({ seed }: { seed: string }) {
  const posters = Array.from({ length: 6 }, (_, k) => ({ c: posterColor(`${seed}${k * 7}`), stars: [5, 3, 4, 2, 5, 4][k] }));
  return (
    <div className="row" style={{ gap: 6, height: 74, alignItems: "flex-end", padding: "0 2px" }}>
      {posters.map((p, k) => (
        <motion.div key={k} className="col" style={{ gap: 3, alignItems: "center", flex: 1 }}
          animate={{ y: [0, -3, 0] }} transition={{ duration: 2.6, repeat: Infinity, delay: k * 0.22 }}>
          <span style={{ fontSize: 8.5, letterSpacing: -1, color: "#FFB800", whiteSpace: "nowrap" }}>{"★".repeat(p.stars)}<span style={{ color: "var(--text-3)" }}>{"★".repeat(5 - p.stars)}</span></span>
          <div style={{ width: "100%", maxWidth: 34, height: 48, borderRadius: 6, background: `linear-gradient(160deg, ${p.c}, ${p.c}aa)`, boxShadow: "0 3px 8px rgba(0,0,0,.15)", position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", right: 6, top: 7, width: 7, height: 7, borderRadius: 4, background: "rgba(255,255,255,.85)" }} />
            <span style={{ position: "absolute", left: -4, right: -4, bottom: -8, height: 22, borderRadius: "50% 50% 0 0", background: "rgba(255,255,255,.45)" }} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
