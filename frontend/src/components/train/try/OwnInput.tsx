import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { toast } from "../../../lib/store";
import type { InputSchemaItem, TryExample, TryResult } from "../../../lib/types";
import { useSize } from "../../charts";
import { Dropzone, Spinner } from "../../glass";
import { DrawPad, type DrawPadHandle } from "../../library/DrawPad";
import { InputControl } from "../../library/InputControl";
import { randomRow, typicalRow, useDebounced, type Row } from "../../library/inputs";
import { AnswerView } from "./AnswerView";
import { ImageView, TextView } from "./InputViews";
import type { TryContext } from "./RandomExample";
import { nounFor, readFile } from "./tryKit";

/** Ask the model about an input; keeps only the latest answer and doesn't repeat the same error toast. */
function useAsk(ctx: TryContext) {
  const [res, setRes] = useState<TryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const lastErr = useRef<string | null>(null);
  const ask = async (input: { image?: string; text?: string; row?: Record<string, unknown> }) => {
    const s = ++seq.current;
    setBusy(true);
    try {
      const r = await api.tryInput(ctx.jobId, ctx.modelKey, input);
      if (s === seq.current) { setRes(r); lastErr.current = null; }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (s === seq.current && msg !== lastErr.current) toast.error(msg);
      lastErr.current = msg;
    } finally {
      if (s === seq.current) setBusy(false);
    }
  };
  return { res, busy, ask, clear: () => { seq.current++; setRes(null); setBusy(false); } };
}

/** Mode 2: your own input — draw / upload a picture, type a message, or fill in a row. The model answers as you go. */
export function OwnInput({ ctx, schema, samples, seed, compact }: {
  ctx: TryContext;
  schema: InputSchemaItem[];
  samples: string[];
  seed?: TryExample["input"] | null;
  compact?: boolean;
}) {
  const [boxRef, { width }] = useSize<HTMLDivElement>();
  const wide = width > (compact ? 640 : 700);
  const body = ctx.modality === "image" ? <ImageInput ctx={ctx} seed={seed?.image} wide={wide} />
    : ctx.modality === "text" ? <TextInput ctx={ctx} samples={samples} seed={seed?.text} wide={wide} />
      : <RowInput ctx={ctx} schema={schema} seed={seed?.row} wide={wide} />;
  return <div ref={boxRef}>{body}</div>;
}

function Answer({ ctx, res, busy, empty }: { ctx: TryContext; res: TryResult | null; busy: boolean; empty: string }) {
  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <AnimatePresence initial={false}>
        {busy && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="row tiny muted" style={{ position: "absolute", right: 0, top: 0, gap: 6 }}>
            <Spinner size={12} /> thinking…
          </motion.span>
        )}
      </AnimatePresence>
      {res ? (
        <motion.div animate={{ opacity: busy ? 0.6 : 1 }} transition={{ duration: 0.2 }}>
          <AnswerView r={res} range={ctx.range} noun={nounFor(ctx.modality)} />
        </motion.div>
      ) : busy ? (
        <div className="col" style={{ gap: 10 }}>
          <div className="skeleton" style={{ height: 30, width: "60%" }} />
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 14 }} />)}
        </div>
      ) : (
        <div className="col center faint" style={{ padding: "28px 12px", gap: 6, textAlign: "center" }}>
          <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.6 }} style={{ fontSize: 28 }}>🤔</motion.span>
          <span className="small">{empty}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ image */

function ImageInput({ ctx, seed, wide }: { ctx: TryContext; seed?: string; wide: boolean }) {
  const pad = useRef<DrawPadHandle>(null);
  const [uri, setUri] = useState<string | null>(null);
  const { res, busy, ask } = useAsk(ctx);
  const q = useDebounced(uri, 180);
  useEffect(() => { if (q) ask({ image: q }); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!seed) return;
    const t = setTimeout(() => pad.current?.load(seed).catch(toast.error), 60);
    return () => clearTimeout(t);
  }, [seed]);

  const upload = (f: File) => {
    if (!f.type.startsWith("image/")) { toast.error("That's not an image — try a PNG or JPG."); return; }
    readFile(f).then((u) => pad.current?.load(u)).catch(toast.error);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
      <div className="col" style={{ gap: 10, alignItems: wide ? "stretch" : "center" }}>
        <DrawPad ref={pad} onChange={setUri} display={wide ? 250 : 240} />
        <Dropzone onFile={upload} accept="image/*">
          <span className="small muted">📁 Drop a picture here or <b style={{ color: "var(--accent)" }}>click to upload</b></span>
        </Dropzone>
      </div>
      <div className="col" style={{ gap: 16, minWidth: 0 }}>
        {(res || busy) && <ImageView r={res} showBig={false} />}
        <Answer ctx={ctx} res={res} busy={busy} empty="Draw something on the pad, or drop in a picture — the model answers as you draw." />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ text */

function TextInput({ ctx, samples, seed, wide }: { ctx: TryContext; samples: string[]; seed?: string; wide: boolean }) {
  const [text, setText] = useState(seed ?? samples[0] ?? "");
  const [asked, setAsked] = useState("");
  const { res, busy, ask, clear } = useAsk(ctx);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (seed !== undefined) setText(seed); }, [seed]);
  const q = useDebounced(text, 350);
  useEffect(() => {
    if (!q.trim()) { clear(); return; }
    setAsked(q);
    ask({ text: q });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1.2fr) minmax(260px, 1fr)" : "minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
      <div className="col" style={{ gap: 10, minWidth: 0 }}>
        <textarea ref={area} className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message for the model to read…"
          style={{ width: "100%", resize: "vertical", fontSize: 14.5, lineHeight: 1.5, padding: "10px 12px", height: "auto" }} />
        {samples.length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            <span className="tiny faint">Or start from one of these</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {samples.slice(0, 6).map((s) => (
                <motion.button key={s} whileTap={{ scale: 0.95 }} transition={spring.pop} className="btn sm" title={s}
                  onClick={() => { setText(s); area.current?.focus(); }}
                  style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", fontWeight: 500 }}>
                  “{s}”
                </motion.button>
              ))}
            </div>
          </div>
        )}
        {res && asked && (
          <div className="inset col" style={{ padding: 12, gap: 6 }}>
            <span className="tiny faint">Which words decided it</span>
            <TextView text={asked} r={res} />
          </div>
        )}
      </div>
      <Answer ctx={ctx} res={res} busy={busy} empty="Type a sentence — the model reads it as you type." />
    </div>
  );
}

/* ------------------------------------------------------------------ table */

function RowInput({ ctx, schema, seed, wide }: { ctx: TryContext; schema: InputSchemaItem[]; seed?: Record<string, unknown>; wide: boolean }) {
  const typical = useMemo(() => typicalRow(schema), [schema]);
  const fromSeed = (s?: Record<string, unknown>): Row => {
    const row = { ...typical };
    if (s) for (const it of schema) {
      const v = s[it.name];
      if (v !== null && v !== undefined && v !== "") row[it.name] = typeof v === "number" || typeof v === "string" ? v : String(v);
    }
    return row;
  };
  const [row, setRow] = useState<Row>(() => fromSeed(seed));
  useEffect(() => { setRow(fromSeed(seed)); }, [seed, typical]); // eslint-disable-line react-hooks/exhaustive-deps
  const { res, busy, ask } = useAsk(ctx);
  const q = useDebounced(row, 280);
  useEffect(() => { if (schema.length) ask({ row: q }); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!schema.length) return <span className="small muted">This model has no inputs to fill in.</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1.3fr) minmax(260px, 1fr)" : "minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
      <div className="col" style={{ gap: 12, minWidth: 0 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => setRow(typical)} title="Middle values for numbers, the most common choice for categories">↺ Typical values</button>
          <motion.button whileTap={{ scale: 0.94, rotate: -6 }} transition={spring.pop} className="btn sm" onClick={() => setRow(randomRow(schema))}>🎲 Random values</motion.button>
        </div>
        <div className="inset" style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "14px 18px", maxHeight: 460, overflow: "auto" }}>
          {schema.map((it) => (
            <InputControl key={it.name} item={it} value={row[it.name]} onChange={(v) => setRow((r) => ({ ...r, [it.name]: v }))}
              domain={[0, 1]} color="var(--accent)" formatY={(v) => String(v)} />
          ))}
        </div>
      </div>
      <Answer ctx={ctx} res={res} busy={busy} empty="Change any value — the model answers straight away." />
    </div>
  );
}
