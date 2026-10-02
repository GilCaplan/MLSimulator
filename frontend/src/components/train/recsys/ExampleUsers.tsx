import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../../design/motion";
import type { RecsysResult } from "../../../lib/types";
import { InfoTip } from "../../glass";
import { GenreBar, Poster } from "./recKit";

/** "Recommendations" tab: a few real viewers — what they loved, and the top-10 the model wrote for them. */
export function ExampleUsers({ data, explains }: { data: RecsysResult; explains?: boolean }) {
  const ex = data.examples ?? [];
  const [i, setI] = useState(() => {
    // open on a viewer with at least one hit, so the ✓ is visible straight away
    const k = ex.findIndex((e) => e.recs.some((r) => r.hit));
    return k >= 0 ? k : 0;
  });
  if (!ex.length) return <p className="small muted">No example viewers were saved with this model.</p>;
  const u = ex[Math.min(i, ex.length - 1)];
  const hits = u.recs.filter((r) => r.hit).length;
  const hasBecause = u.recs.some((r) => r.because);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 620, margin: 0 }}>
          Real viewers from the data. First, films they rated highly while the model was learning; below, the <b>10 films it picked</b> for them.
          A <b style={{ color: "var(--success)" }}>✓</b> means the viewer really went on to like that film — it was one of their hidden, most recent ratings.
        </p>
        <div className="row wrap" style={{ gap: 6 }}>
          {ex.map((e, k) => {
            const n = e.recs.filter((r) => r.hit).length;
            const sel = k === i;
            return (
              <motion.button key={e.user} whileTap={{ scale: 0.94 }} onClick={() => setI(k)} className="btn sm"
                style={{ background: sel ? "var(--accent)" : undefined, color: sel ? "white" : undefined, borderColor: sel ? "transparent" : undefined, gap: 6 }}>
                👤 {e.user}
                {n > 0 && <span className="num" style={{ fontWeight: 800, color: sel ? "white" : "var(--success)" }}>✓{n}</span>}
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={u.user} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.gentle} className="col" style={{ gap: 16 }}>
          <div className="inset col" style={{ padding: 14, gap: 10 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <b className="row" style={{ gap: 6, fontSize: 14 }}>❤️ What {u.user} loved <InfoTip text="Their highest-rated films in the training data — the evidence the model had about their taste." /></b>
              <div style={{ width: 200 }}><GenreBar items={u.liked} label="their taste" /></div>
            </div>
            <div className="row scroll" style={{ gap: 12, overflowX: "auto", paddingBottom: 4 }}>
              {u.liked.map((it, k) => <Poster key={it.item} item={it} rating={it.rating} width={96} delay={k * 0.04} />)}
            </div>
          </div>

          <div className="row center" style={{ gap: 10, marginTop: -6, marginBottom: -6 }}>
            <motion.span animate={{ y: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ fontSize: 18 }}>⬇️</motion.span>
            <span className="small muted">the model's picks</span>
          </div>

          <div className="col" style={{ gap: 10 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <span className="row wrap" style={{ gap: 8 }}>
                <b style={{ fontSize: 14 }}>🍿 Top 10 for {u.user}</b>
                <motion.span key={hits} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop} className={`badge ${hits ? "success" : ""}`}>
                  {hits ? `✓ ${hits} hit${hits === 1 ? "" : "s"} — films they really went on to like` : "no hits for this viewer"}
                </motion.span>
              </span>
              <div style={{ width: 200 }}><GenreBar items={u.recs} label="the list's mix" /></div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(max(112px, calc((100% - 56px) / 5)), 1fr))", gap: 14, justifyItems: "center" }}>
              {u.recs.map((it, k) => <Poster key={it.item} item={it} rank={k + 1} hit={it.hit} because={it.because} width={112} delay={0.1 + k * 0.05} />)}
            </div>
            <p className="tiny faint" style={{ lineHeight: 1.5 }}>
              {hits === 0
                ? "No ✓ doesn't mean bad picks: we only hid a few ratings per viewer, so most good suggestions are films they simply haven't watched yet. That's why scores like recall@10 look low even for great recommenders."
                : "Every unticked film could still be a great suggestion — the viewer just hasn't rated it. Recall@10 only counts what we can check."}
              {hasBecause || explains ? " 🧲 chips show which film they loved pulled each pick in — the explanation item-kNN gives for free." : ""}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
