import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../design/motion";
import { classColor, withAlpha } from "../../lib/colors";
import { fmt, pct } from "../../lib/format";
import type { Task, VisionResult } from "../../lib/types";
import { EmptyState, InfoTip, Modal, Segmented } from "../glass";
import { ConfRing, HeatLegend, Thumb } from "./visionKit";

type Item = VisionResult["mistakes"][number];

const errColor = (err: number, scale: number) => {
  const t = Math.min(1, Math.abs(err) / (scale || 1));
  return t > 0.6 ? "var(--danger)" : t > 0.25 ? "var(--warning)" : "var(--success)";
};

/** Gallery tab: the most confident mistakes and the surest correct answers, as thumbnail grids you can enlarge. */
export function VisionGallery({ vision, classes, task }: { vision: VisionResult; classes?: string[] | null; task: Task }) {
  const [open, setOpen] = useState<{ item: Item; wrong: boolean } | null>(null);
  const cls = task === "classification";
  const scale = Math.max(1e-9, ...vision.mistakes.map((m) => Math.abs(m.error ?? 0)));
  if (!vision.mistakes.length && !vision.correct.length) return <EmptyState icon="🖼️" title="No pictures to show" text="This model didn't record any test pictures." />;
  return (
    <div className="col" style={{ gap: 22 }}>
      <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 720 }}>
        <b style={{ color: "var(--text)" }}>Look at the actual pictures.</b>{" "}
        {cls
          ? "A score only says how often it's wrong — the pictures show you why. Confident mistakes often share something: a tiny shape, a low-contrast colour, a shape cut off by the edge."
          : "A score only says how far off it is on average — the pictures show you where. Do the biggest misses have dots touching each other, or very little contrast?"}
        {" "}Click any picture to enlarge it.
      </p>
      <Section
        title={cls ? "😬 Most confident mistakes" : "📏 Biggest misses"}
        help={cls ? "Test pictures it got wrong, sorted by how sure it was. The ring shows its confidence in the (wrong) answer." : "Test pictures where the prediction was furthest from the true value."}
        caption={cls ? `${vision.mistakes.length} wrong answer${vision.mistakes.length === 1 ? "" : "s"} it was surest about` : "Sorted from the worst miss down"}
        items={vision.mistakes} wrong datasetId={vision.dataset_id} classes={classes} cls={cls} scale={scale} onOpen={(item) => setOpen({ item, wrong: true })}
        empty={cls ? "No mistakes on the test pictures — impressive!" : "No misses recorded."} />
      <Section
        title={cls ? "✅ Confident and correct" : "🎯 Closest calls"}
        help={cls ? "Test pictures where it was most sure and right — what it finds easy." : "Test pictures where the prediction was closest to the truth."}
        caption={cls ? "What it finds easy" : "Almost spot on"}
        items={vision.correct} wrong={false} datasetId={vision.dataset_id} classes={classes} cls={cls} scale={scale} onOpen={(item) => setOpen({ item, wrong: false })}
        empty="Nothing here yet." />
      <Enlarged open={open} onClose={() => setOpen(null)} vision={vision} classes={classes} cls={cls} scale={scale} />
    </div>
  );
}

function Section({ title, help, caption, items, wrong, datasetId, classes, cls, scale, onOpen, empty }: {
  title: string; help: string; caption: string; items: Item[]; wrong: boolean; datasetId: string; classes?: string[] | null; cls: boolean; scale: number;
  onOpen: (it: Item) => void; empty: string;
}) {
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <h4 className="row" style={{ gap: 6 }}>{title}<InfoTip text={help} /></h4>
        <span className="tiny faint">{caption}</span>
      </div>
      {items.length === 0 ? (
        <div className="inset small muted" style={{ padding: "14px 16px" }}>{empty}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 12 }}>
          {items.map((it, k) => <Tile key={`${it.i}-${k}`} it={it} k={k} wrong={wrong} datasetId={datasetId} classes={classes} cls={cls} scale={scale} onOpen={() => onOpen(it)} />)}
        </div>
      )}
    </div>
  );
}

function Tile({ it, k, wrong, datasetId, classes, cls, scale, onOpen }: {
  it: Item; k: number; wrong: boolean; datasetId: string; classes?: string[] | null; cls: boolean; scale: number; onOpen: () => void;
}) {
  const predColor = cls ? classColor(String(it.pred), classes) : errColor(it.error ?? 0, scale);
  const ring = wrong ? "color-mix(in srgb, var(--danger) 55%, transparent)" : "color-mix(in srgb, var(--success) 50%, transparent)";
  return (
    <motion.button
      initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.gentle, delay: Math.min(k, 18) * 0.025 }}
      whileHover={{ y: -4, scale: 1.03 }} whileTap={{ scale: 0.97 }}
      onClick={onOpen}
      className="col"
      style={{ gap: 7, padding: 6, borderRadius: 18, border: "1px solid var(--hairline)", background: "var(--fill)", cursor: "zoom-in", textAlign: "left", minWidth: 0 }}
    >
      <Thumb datasetId={datasetId} i={it.i} size="100%" px={128} radius={13} style={{ boxShadow: `0 0 0 2px ${ring}, 0 4px 14px rgba(0,0,0,0.12)` }}>
        {cls && it.confidence !== undefined && (
          <div style={{ position: "absolute", top: 5, right: 5 }}><ConfRing value={it.confidence} color={predColor} size={30} /></div>
        )}
        {!cls && it.error !== undefined && (
          <span className="num" style={{ position: "absolute", top: 5, right: 5, padding: "2px 7px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", background: "rgba(20,20,30,0.6)", backdropFilter: "blur(8px)" }}>
            {it.error > 0 ? "+" : "−"}{fmt(Math.abs(it.error), 2)}
          </span>
        )}
      </Thumb>
      {cls ? (
        <div className="col" style={{ gap: 3, minWidth: 0, padding: "0 2px" }}>
          <span className="truncate" style={{ alignSelf: "flex-start", maxWidth: "100%", padding: "1px 8px", borderRadius: 999, fontSize: 11.5, fontWeight: 650, background: withAlpha(classColor(String(it.pred), classes), 0.16), color: classColor(String(it.pred), classes) }}>
            {wrong ? "said " : "✓ "}{String(it.pred)}
          </span>
          {wrong && (
            <span className="tiny truncate faint" style={{ paddingLeft: 2 }}>
              truth: <b style={{ color: classColor(String(it.true), classes) }}>{String(it.true)}</b>
            </span>
          )}
        </div>
      ) : (
        <div className="col tiny num" style={{ gap: 1, padding: "0 2px" }}>
          <span className="row between"><span className="faint">actual</span><b>{fmt(Number(it.true), 3)}</b></span>
          <span className="row between"><span className="faint">predicted</span><b style={{ color: predColor }}>{fmt(Number(it.pred), 3)}</b></span>
        </div>
      )}
    </motion.button>
  );
}

function Enlarged({ open, onClose, vision, classes, cls, scale }: {
  open: { item: Item; wrong: boolean } | null; onClose: () => void; vision: VisionResult; classes?: string[] | null; cls: boolean; scale: number;
}) {
  const [view, setView] = useState<"photo" | "heat">("photo");
  const it = open?.item;
  const heat = it ? vision.saliency?.find((s) => s.i === it.i)?.heat ?? null : null;
  const pi = vision.pixel_importance ?? null;
  const overlay = heat ?? pi;
  return (
    <Modal open={!!open} onClose={onClose} width={560}
      title={it ? (cls ? (open!.wrong ? "A confident mistake" : "A confident correct answer") : open!.wrong ? "A big miss" : "A close call") : ""}>
      {it && (
        <div className="row wrap" style={{ gap: 20, alignItems: "flex-start" }}>
          <div className="col" style={{ gap: 10, alignItems: "center" }}>
            <motion.div initial={{ scale: 0.8, rotate: -4, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring.pop}>
              <Thumb datasetId={vision.dataset_id} i={it.i} size={240} px={256} radius={20} heat={view === "heat" ? overlay : null} strength={0.8} />
            </motion.div>
            {overlay && (
              <>
                <Segmented size="sm" value={view} onChange={setView} options={[{ value: "photo", label: "Picture" }, { value: "heat", label: heat ? "Where it looked" : "Pixels it uses" }]} />
                <AnimatePresence>{view === "heat" && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><HeatLegend width={110} /></motion.div>}</AnimatePresence>
              </>
            )}
          </div>
          <div className="col grow" style={{ gap: 12, minWidth: 200 }}>
            <span className="tiny faint">Test picture #{it.i}</span>
            {cls ? (
              <>
                <div className="col" style={{ gap: 4 }}>
                  <span className="small muted">The truth</span>
                  <b style={{ fontSize: 24, color: classColor(String(it.true), classes) }}>{String(it.true)}</b>
                </div>
                <div className="col" style={{ gap: 4 }}>
                  <span className="small muted">The model said</span>
                  <b style={{ fontSize: 24, color: classColor(String(it.pred), classes) }}>{String(it.pred)} {open!.wrong ? "✗" : "✓"}</b>
                </div>
                {it.confidence !== undefined && (
                  <div className="inset col" style={{ padding: "10px 12px", gap: 6 }}>
                    <span className="row between small"><span className="muted">Confidence</span><b className="num">{pct(it.confidence, 0)}</b></span>
                    <div style={{ height: 8, borderRadius: 4, background: "var(--fill-2)", overflow: "hidden" }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${it.confidence * 100}%` }} transition={spring.gentle}
                        style={{ height: "100%", borderRadius: 4, background: classColor(String(it.pred), classes) }} />
                    </div>
                  </div>
                )}
                <p className="small muted" style={{ lineHeight: 1.55 }}>
                  {open!.wrong
                    ? `It was ${it.confidence !== undefined ? pct(it.confidence, 0) + " " : ""}sure this was “${it.pred}” — it's actually “${it.true}”. Can you see what might have fooled it?`
                    : `It's ${it.confidence !== undefined ? pct(it.confidence, 0) + " " : ""}sure, and right. Pictures like this are what it has really learned.`}
                </p>
              </>
            ) : (
              <>
                <div className="row" style={{ gap: 18 }}>
                  <div className="col" style={{ gap: 2 }}><span className="small muted">Actual</span><b className="num" style={{ fontSize: 28 }}>{fmt(Number(it.true), 3)}</b></div>
                  <div className="col" style={{ gap: 2 }}><span className="small muted">Predicted</span><b className="num" style={{ fontSize: 28, color: errColor(it.error ?? 0, scale) }}>{fmt(Number(it.pred), 3)}</b></div>
                </div>
                <span className="badge" style={{ alignSelf: "flex-start", color: errColor(it.error ?? 0, scale) }}>off by {fmt(Math.abs(it.error ?? 0), 3)}</span>
                <p className="small muted" style={{ lineHeight: 1.55 }}>
                  {open!.wrong ? "One of its worst guesses. Look closely — is something about this picture unusual?" : "Almost exactly right."}
                </p>
              </>
            )}
            {view === "heat" && overlay && (
              <p className="tiny faint" style={{ lineHeight: 1.5 }}>
                {heat ? "Bright = the pixels that pushed its answer the most." : "Bright = pixel positions this model relies on — the same spots for every picture."}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
