import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { classColor } from "../../../lib/colors";
import { toast } from "../../../lib/store";
import type { TryExample } from "../../../lib/types";
import { useSize } from "../../charts";
import { tint } from "../../charts/contrast";
import { Spinner } from "../../glass";
import { AnswerView } from "./AnswerView";
import { ImageView, RowCard, TextView } from "./InputViews";
import { fmtValue, nounFor, pluralClass, useKey } from "./tryKit";

export interface TryContext {
  jobId: string;
  modelKey: string;
  modality: string;
  task: string;
  classes: string[] | null;
  /** regression: the range of the target seen in testing (for the number line) */
  range: [number, number] | null;
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Mode 1: a random example from the hidden test set (optionally of one class), with the model's answer next to the truth. */
export function RandomExample({ ctx, onEdit, compact, active = true }: { ctx: TryContext; onEdit?: (input: TryExample["input"]) => void; compact?: boolean; active?: boolean }) {
  const cls = ctx.task === "classification" && !!ctx.classes?.length;
  const [label, setLabel] = useState<string | null>(null);
  const [ex, setEx] = useState<TryExample | null>(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState<{ ok: boolean; err?: number; label: string }[]>([]);
  const seq = useRef(0);
  const [boxRef, { width }] = useSize<HTMLDivElement>();
  const wide = width > (ctx.modality === "image" ? 700 : 620);

  const go = async (lbl: string | null = label) => {
    const s = ++seq.current;
    setLoading(true);
    try {
      let e = await api.tryExample(ctx.jobId, ctx.modelKey, { label: lbl, seed: newSeed() });
      // don't show the very same example twice in a row when there's a choice
      if (ex && e.index === ex.index && e.n_pool > 1) e = await api.tryExample(ctx.jobId, ctx.modelKey, { label: lbl, seed: newSeed() });
      if (s !== seq.current) return;
      setEx(e);
      setCount((c) => c + 1);
      setHistory((h) => [...h, { ok: ctx.task === "regression" ? false : !!e.correct, err: e.error, label: String(e.truth ?? "") }].slice(-200));
    } catch (err) {
      if (s === seq.current) toast.error(err);
    } finally {
      if (s === seq.current) setLoading(false);
    }
  };

  // show one straight away so there's something to look at
  useEffect(() => { go(null); }, [ctx.jobId, ctx.modelKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useKey("n", () => { if (!loading) go(); }, active);

  const pick = (l: string | null) => {
    setLabel(l);
    go(l);
  };

  const n = history.length;
  const nOk = history.filter((h) => h.ok).length;
  const meanErr = n ? history.reduce((a, h) => a + Math.abs(h.err ?? 0), 0) / n : 0;
  const noun = nounFor(ctx.modality);
  const pool = ex ? `1 of ${ex.n_pool.toLocaleString()} test ${label ? pluralClass(label) : nounFor(ctx.modality, true)}` : null;

  // the big picture shares its well with "what the model sees" (150px + gap): keep both on one line when possible
  const well = (wide ? (width - 16) * (1.25 / 2.25) : width) - 28;
  const bigImage = Math.round(Math.max(compact ? 140 : 160, Math.min(240, well - 200)));
  const input = ex && (
    ctx.modality === "image" ? <ImageView src={ex.input.image} r={ex} big={bigImage} />
      : ctx.modality === "text" ? <TextView text={ex.input.text ?? ""} r={ex} />
        : <RowCard row={ex.input.row ?? {}} />
  );

  return (
    <div ref={boxRef} className="col" style={{ gap: 14 }}>
      {cls && (
        <div className="col" style={{ gap: 6 }}>
          <span className="tiny faint">Pick a class to test — or let chance decide</span>
          <div className="row wrap" style={{ gap: 6 }}>
            <Chip on={label === null} color="var(--accent)" onClick={() => pick(null)}>🎲 Any class</Chip>
            {ctx.classes!.map((c) => (
              <Chip key={c} on={label === c} color={classColor(c, ctx.classes)} onClick={() => pick(c)}>{c}</Chip>
            ))}
          </div>
        </div>
      )}

      <div className="row between wrap" style={{ gap: 10 }}>
        <span className="row wrap" style={{ gap: 10 }}>
          <motion.button whileTap={{ scale: 0.94, rotate: -4 }} transition={spring.pop} className="btn primary" onClick={() => go()} disabled={loading}
            title="Shortcut: N">
            {loading ? <Spinner size={14} /> : "🎲"} {count ? "Next example" : "Random example"}
            <kbd className="tiny" style={{ marginLeft: 4, padding: "0 5px", borderRadius: 5, border: "1px solid currentColor", opacity: 0.6, fontFamily: "inherit" }}>N</kbd>
          </motion.button>
          {pool && <span className="small muted">{pool}</span>}
        </span>
        {n > 0 && (
          <motion.span key={n} initial={{ scale: 0.9, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop} className="small muted">
            You checked <b className="num" style={{ color: "var(--text)" }}>{n}</b>
            {ctx.task === "regression"
              ? <> · typical miss <b className="num" style={{ color: "var(--text)" }}>{fmtValue(meanErr)}</b></>
              : <> · <b className="num" style={{ color: nOk === n ? "var(--success)" : "var(--text)" }}>{nOk}</b> correct</>}
          </motion.span>
        )}
      </div>

      <div style={{ position: "relative", minHeight: 180 }}>
        {!ex ? (
          <Skeleton wide={wide} modality={ctx.modality} />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={count} initial={{ opacity: 0, x: 18 }} animate={{ opacity: loading ? 0.55 : 1, x: 0 }} exit={{ opacity: 0, x: -18, transition: { duration: 0.14 } }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
              style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1.25fr) minmax(260px, 1fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
              <div className="inset col" style={{ padding: 14, gap: 10, minWidth: 0 }}>
                <div className="row between" style={{ gap: 8 }}>
                  <span className="eyebrow">Test {noun} #{ex.index + 1}</span>
                  {onEdit && <button className="btn ghost sm" onClick={() => onEdit(ex.input)} title="Open this example in “Your own input” and change it">✍️ Tweak it</button>}
                </div>
                {input}
              </div>
              <div style={{ minWidth: 0 }}>
                <AnswerView r={ex} range={ctx.range} noun={noun} />
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {n > 1 && (
        <div className="row wrap" style={{ gap: 4 }} aria-label="your checks so far">
          {history.slice(-40).map((h, i) => (
            <motion.span key={history.length - Math.min(40, history.length) + i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.pop}
              title={ctx.task === "regression" ? `missed by ${fmtValue(Math.abs(h.err ?? 0))}` : `${h.label}: ${h.ok ? "correct" : "wrong"}`}
              style={{ width: 9, height: 9, borderRadius: 5, background: ctx.task === "regression" ? "var(--accent)" : h.ok ? "var(--success)" : "var(--danger)", opacity: ctx.task === "regression" ? 0.5 : 0.85 }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ on, color, onClick, children }: { on: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.94 }} transition={spring.pop} onClick={onClick} aria-pressed={on}
      style={{ height: 28, padding: "0 12px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 650, fontFamily: "inherit",
        color: on ? "var(--text)" : "var(--text-2)", background: on ? tint(color, 26) : tint(color, 9),
        border: `1.5px solid ${on ? color : tint(color, 30)}`, display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
      {children}
    </motion.button>
  );
}

function Skeleton({ wide, modality }: { wide: boolean; modality: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1.25fr) minmax(260px, 1fr)" : "minmax(0, 1fr)", gap: 16 }}>
      <div className="inset col" style={{ padding: 14, gap: 10 }}>
        <div className="skeleton" style={{ width: 120, height: 12 }} />
        {modality === "image" ? (
          <div className="row" style={{ gap: 18 }}>
            <div className="skeleton" style={{ width: 190, height: 190, borderRadius: 18 }} />
            <div className="skeleton" style={{ width: 132, height: 132, borderRadius: 14 }} />
          </div>
        ) : modality === "text" ? (
          <><div className="skeleton" style={{ height: 16 }} /><div className="skeleton" style={{ height: 16, width: "70%" }} /></>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}
          </div>
        )}
      </div>
      <div className="col" style={{ gap: 10 }}>
        <div className="skeleton" style={{ height: 54, borderRadius: 14 }} />
        <div className="skeleton" style={{ height: 30, width: "60%" }} />
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 14 }} />)}
      </div>
    </div>
  );
}
