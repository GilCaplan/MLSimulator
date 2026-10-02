import { motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { Histogram as H, PipelineSpec } from "../../../lib/types";
import { AnimatedNumber, Slider } from "../../glass";
import { useSize } from "../../charts";
import { shareWithin, tokenize } from "../../data/text/textData";
import { Note, StageCard, SubHead } from "../StageCard";
import { patchText, textOf } from "./textPrepState";

/** Neural text models read a fixed number of words: longer texts are cut, shorter ones padded. */
export function SeqLenCard({ spec, hist, example, usesSeq, open, onToggle, flash }: {
  spec: PipelineSpec;
  hist: H | null;
  /** a sample text to show cut / padded */
  example: string | null;
  /** does the line-up include a neural text model? */
  usesSeq: boolean;
  open: boolean;
  onToggle: () => void;
  flash: boolean;
}) {
  const t = textOf(spec);
  const fits = shareWithin(hist, t.max_len);
  return (
    <StageCard id="seqlen" icon="📏" title="Sequence length" open={open} onToggle={onToggle} flash={flash} dim={!usesSeq}
      summary={`${t.max_len} words${hist ? ` · ${Math.round(fits * 100)}% fit` : ""}`}
      why="Networks that read word by word (GRU, Transformer, embeddings) need every text to be the same length."
      info="Each text becomes a list of word numbers. Texts longer than this are cut off at the end; shorter ones are padded with blanks the network learns to ignore. Longer = nothing lost, but slower training.">
      {!usesSeq && <Note icon="💤">None of your models read word sequences, so this setting won't change anything — it matters for the GRU, Transformer and word-embedding networks.</Note>}
      <Slider label="Words the network reads" help="Pick a length that fits most of your texts — check the chart: the shaded bars are texts that fit completely."
        value={t.max_len} min={10} max={200} integer onChange={(v) => patchText(spec, { max_len: v })} />
      {hist && hist.counts.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <SubHead right={<span className="small num" style={{ fontWeight: 650, color: fits > 0.95 ? "var(--success)" : fits > 0.8 ? "var(--text)" : "var(--warning)" }}>
            <AnimatedNumber value={fits * 100} format={(v) => `${Math.round(v)}%`} /> fit completely</span>}>
            Text lengths (words)
          </SubHead>
          <LengthChart hist={hist} maxLen={t.max_len} />
          {fits < 0.8 && <Note icon="✂️" tone="warn">About {Math.round((1 - fits) * 100)}% of texts will lose their ending. If the important words come late, try a longer length.</Note>}
          {fits >= 0.999 && hist.edges[hist.edges.length - 1] * 2 < t.max_len && <Note icon="🪶">Every text fits with lots of room to spare — a shorter length would train faster with nothing lost.</Note>}
        </div>
      )}
      {example && <PadStrip text={example} maxLen={t.max_len} />}
    </StageCard>
  );
}

/** Histogram of text lengths with a marker at the cut-off; bars past it fade. */
function LengthChart({ hist, maxLen }: { hist: H; maxLen: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const h = 130, pad = 18;
  const lo = hist.edges[0], hi = Math.max(hist.edges[hist.edges.length - 1], maxLen * 1.05);
  const x = (v: number) => pad + ((v - lo) / (hi - lo || 1)) * (Math.max(10, width) - pad * 2);
  const maxC = Math.max(1, ...hist.counts);
  const mx = x(Math.max(lo, Math.min(hi, maxLen)));
  return (
    <div ref={ref} className="inset" style={{ padding: "8px 0 0", minHeight: h + 8 }}>
      {width > 0 && (
        <svg width={width} height={h} style={{ display: "block", overflow: "visible" }}>
          {hist.counts.map((c, k) => {
            const x0 = x(hist.edges[k]), x1 = x(hist.edges[k + 1]);
            const bh = (c / maxC) * (h - 40);
            const inside = hist.edges[k + 1] <= maxLen;
            return (
              <motion.rect key={k} x={x0 + 0.5} width={Math.max(1, x1 - x0 - 1.5)} rx={2.5} y={h - 20 - bh} height={bh}
                style={{ fill: inside ? "var(--accent)" : hist.edges[k] < maxLen ? "color-mix(in srgb, var(--accent) 50%, transparent)" : "var(--fill-2)", transition: "fill .25s" }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }} />
            );
          })}
          <motion.g animate={{ x: mx }} initial={false} transition={spring.snappy}>
            <line y1={6} y2={h - 18} stroke="var(--warning)" strokeWidth={2} strokeDasharray="4 3" />
            <rect x={-30} y={-6} width={60} height={18} rx={9} fill="var(--warning)" />
            <text y={7} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#1d1d1f">{maxLen} words</text>
          </motion.g>
          <text x={pad} y={h - 4} fontSize={10} fill="var(--text-3)">{Math.round(lo)}</text>
          <text x={x(hi)} y={h - 4} fontSize={10} fill="var(--text-3)" textAnchor="end">{Math.round(hi)} words</text>
        </svg>
      )}
    </div>
  );
}

/** One real text as the network will receive it: words up to the limit, the rest cut, blanks for padding. */
function PadStrip({ text, maxLen }: { text: string; maxLen: number }) {
  const toks = tokenize(text);
  const SHOW = 18;
  const pad = Math.max(0, maxLen - toks.length);
  const cells = [...toks.map((w, i) => ({ w, kind: i < maxLen ? "in" : "cut" })), ...Array.from({ length: Math.min(pad, Math.max(0, SHOW - toks.length)) }, () => ({ w: "", kind: "pad" }))];
  const hidden = pad - cells.filter((c) => c.kind === "pad").length;
  return (
    <div className="col" style={{ gap: 8 }}>
      <SubHead info="This is the network's-eye view of one text. Each word becomes a number from the vocabulary; blanks are padding (number 0) and are ignored.">One text, as the network reads it</SubHead>
      <div className="row wrap" style={{ gap: 4 }}>
        {cells.map((c, i) => (
          <motion.span key={`${i}-${c.kind}`} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: c.kind === "cut" ? 0.4 : 1, scale: 1 }} transition={spring.snappy}
            className="badge" style={{
              height: 24, fontSize: 11.5, minWidth: 26, justifyContent: "center",
              background: c.kind === "in" ? "var(--accent-soft)" : c.kind === "pad" ? "transparent" : "var(--fill)",
              color: c.kind === "in" ? "var(--accent)" : "var(--text-3)",
              border: c.kind === "pad" ? "1px dashed var(--hairline)" : "1px solid transparent",
              textDecoration: c.kind === "cut" ? "line-through" : "none",
            }}>
            {c.w || "·"}
          </motion.span>
        ))}
        {hidden > 0 && <span className="tiny faint" style={{ alignSelf: "center" }}>+ {hidden} more blanks</span>}
      </div>
      <span className="tiny faint">
        {toks.length > maxLen ? `${toks.length - maxLen} word${toks.length - maxLen === 1 ? "" : "s"} cut off at the end.` : `${toks.length} words + ${pad} blank${pad === 1 ? "" : "s"} of padding = ${maxLen}.`}
      </span>
    </div>
  );
}
