import { motion } from "framer-motion";
import { useState, type CSSProperties, type ReactNode } from "react";
import { spring } from "../../design/motion";
import { classColor, withAlpha } from "../../lib/colors";
import { pct } from "../../lib/format";
import type { DiagramLayer } from "../nn/NetworkDiagram";
import type { NNArch } from "../../lib/types";

/* Shared building blocks for text models: influence-coloured word chips, legends, rings and the network mapping. */

export type Tok = { t: string; w: number };

const GREEN: [number, number, number] = [48, 209, 88];
const RED: [number, number, number] = [255, 69, 58];

/** Scale used to normalise a sentence's influences (so a calm sentence doesn't look wildly coloured). */
export const influenceScale = (toks: Tok[]) => Math.max(0.08, ...toks.map((x) => Math.abs(x.w)));

/** Background / border colours for one word: green = pushed towards the prediction, red = against, alpha = size. */
export function influenceColor(w: number, scale: number): { bg: string; border: string; strength: number } {
  const t = Math.min(1, Math.abs(w) / (scale || 1));
  const [r, g, b] = w >= 0 ? GREEN : RED;
  const strength = t < 0.1 ? 0 : t;
  // words that barely matter stay neutral grey, so the decisive ones stand out
  if (!strength) return { bg: "rgba(120, 120, 128, 0.10)", border: "rgba(120, 120, 128, 0.20)", strength };
  return {
    bg: `rgba(${r}, ${g}, ${b}, ${(0.05 + 0.5 * strength).toFixed(3)})`,
    border: `rgba(${r}, ${g}, ${b}, ${(0.12 + 0.6 * strength).toFixed(3)})`,
    strength,
  };
}

/** How much one word moved the answer, in plain words. */
export function influenceText(tok: Tok, pred: string) {
  const pts = Math.round(Math.abs(tok.w) * 100);
  if (pts === 0) return `“${tok.t}” barely matters — removing it changes nothing.`;
  return tok.w > 0
    ? `“${tok.t}” pushes towards “${pred}”: without it, the model is ${pts} points less sure.`
    : `“${tok.t}” argues against “${pred}”: without it, the model would be ${pts} points more sure.`;
}

/** A sentence rendered as word chips coloured by influence. Hovering a word explains it. Colours animate when they change. */
export function InfluenceSentence({ tokens, pred, size = 15, onHover, hovered, animateIn = true }: {
  tokens: Tok[];
  pred: string;
  size?: number;
  onHover?: (i: number | null) => void;
  hovered?: number | null;
  animateIn?: boolean;
}) {
  const scale = influenceScale(tokens);
  return (
    <div className="row wrap" style={{ gap: 5, lineHeight: 1.2 }} onMouseLeave={() => onHover?.(null)}>
      {tokens.map((tok, i) => {
        const c = influenceColor(tok.w, scale);
        return (
          <motion.span
            key={`${i}-${tok.t}`}
            initial={animateIn ? { opacity: 0, y: 6, scale: 0.85 } : false}
            animate={{ opacity: 1, y: 0, scale: hovered === i ? 1.08 : 1, backgroundColor: c.bg, borderColor: hovered === i ? "var(--accent)" : c.border }}
            transition={{ ...spring.gentle, delay: animateIn ? Math.min(i, 30) * 0.018 : 0, backgroundColor: { duration: 0.45 }, borderColor: { duration: 0.3 } }}
            onMouseEnter={() => onHover?.(i)}
            title={onHover ? undefined : influenceText(tok, pred)}
            style={{
              display: "inline-flex", alignItems: "center", padding: `${size * 0.22}px ${size * 0.5}px`, borderRadius: size * 0.55,
              border: "1px solid", fontSize: size, fontWeight: c.strength > 0.45 ? 650 : 500, color: "var(--text)", cursor: "default",
              boxShadow: c.strength > 0.6 ? `0 2px 10px ${tok.w >= 0 ? "rgba(48,209,88,.25)" : "rgba(255,69,58,.25)"}` : undefined,
            }}
          >
            {tok.t}
          </motion.span>
        );
      })}
    </div>
  );
}

/** Sentence + a one-line read-out of the hovered word (the educational bit). */
export function ExplainedSentence({ tokens, pred, size = 15, placeholder }: { tokens: Tok[]; pred: string; size?: number; placeholder?: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = tokens.length ? tokens.reduce((a, b) => (b.w > a.w ? b : a), tokens[0]) : null;
  const tok = hover !== null ? tokens[hover] : null;
  return (
    <div className="col" style={{ gap: 8 }}>
      <InfluenceSentence tokens={tokens} pred={pred} size={size} onHover={setHover} hovered={hover} />
      <motion.span key={tok ? `h${hover}` : "top"} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
        className="tiny muted" style={{ minHeight: 16, lineHeight: 1.45 }}>
        {tok ? influenceText(tok, pred) : top && top.w > 0.01 ? <>Strongest clue: <b style={{ color: "var(--text)" }}>“{top.t}”</b> · hover any word to see its effect</> : placeholder ?? "Hover any word to see its effect."}
      </motion.span>
    </div>
  );
}

/** Legend for the influence colours. */
export function InfluenceLegend({ width = 150, style }: { width?: number; style?: CSSProperties }) {
  return (
    <div className="row tiny faint wrap" style={{ gap: 8, ...style }}>
      <span>pushed against</span>
      <span style={{ width, height: 8, borderRadius: 4, background: "linear-gradient(90deg, rgba(255,69,58,.85), rgba(255,69,58,.15) 40%, rgba(120,120,128,.18) 50%, rgba(48,209,88,.15) 60%, rgba(48,209,88,.85))" }} />
      <span>pushed towards the answer</span>
    </div>
  );
}

/** A pill with a class label in its colour. */
export function ClassChip({ label, classes, prefix, strike, size = 12 }: { label: string; classes?: string[] | null; prefix?: ReactNode; strike?: boolean; size?: number }) {
  const c = classColor(label, classes);
  return (
    <span className="row" style={{ gap: 4, padding: "2px 9px", borderRadius: 999, fontSize: size, fontWeight: 650, background: withAlpha(c, 0.15), color: c, whiteSpace: "nowrap", textDecoration: strike ? "line-through" : undefined }}>
      {prefix}{label}
    </span>
  );
}

/** Theme-aware confidence ring (0..1). */
export function ConfidenceRing({ value, color, size = 38, delay = 0.1 }: { value: number; color: string; size?: number; delay?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }} title={`${pct(value, 0)} sure`}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={3.5} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }} transition={{ ...spring.gentle, delay }} />
      </svg>
      <span className="num" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.28, fontWeight: 720 }}>
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ text networks */

export const TEXT_KINDS = ["embedding_bag", "gru", "text_transformer"] as const;
type TextArch = { kind: string; embed_dim?: number; hidden?: number | number[]; layers?: unknown; heads?: number };

export const isTextArch = (arch: NNArch | null | undefined) => !!arch && (TEXT_KINDS as readonly string[]).includes(arch.kind as string);

/**
 * Diagram columns for the text networks (mlp/core/nn/builder.py TextNet):
 * words → embedding → (average | GRU | attention) → average → dense → answer.
 */
export function textLayers(arch: NNArch, maxLen: number, nOut: number): DiagramLayer[] {
  const a = arch as unknown as TextArch;
  const d = a.embed_dim ?? 64;
  const hidden = typeof a.hidden === "number" ? a.hidden : 64;
  const nLayers = typeof a.layers === "number" ? Math.max(1, a.layers) : 1;
  const out: DiagramLayer[] = [
    { label: `Words · up to ${maxLen}`, units: maxLen, kind: "input" },
    { label: `Embedding · ${d}`, units: d, kind: "graph" },
  ];
  if (a.kind === "gru") {
    for (let i = 0; i < nLayers; i++) out.push({ label: `GRU ⇄ · ${hidden * 2}`, units: hidden * 2, kind: "conv" });
  } else if (a.kind === "text_transformer") {
    for (let i = 0; i < nLayers; i++) out.push({ label: `Attention ${i + 1} · ${a.heads ?? 4} heads`, units: d, kind: "attention" });
  }
  out.push({ label: `Average · ${a.kind === "gru" ? hidden * 2 : d}`, units: a.kind === "gru" ? hidden * 2 : d, kind: "dense" });
  out.push({ label: `Dense · ${hidden}`, units: hidden, kind: "dense" });
  out.push({ label: `Output · ${nOut}`, units: nOut, kind: "output" });
  return out;
}

/** One-line explanation of what a text network does, for captions. */
export function textNetCaption(arch: NNArch | null | undefined): string {
  switch (arch?.kind as string) {
    case "gru": return "Each word becomes a learned vector; the GRU reads them in order (both directions), so “not” can change what “good” means.";
    case "text_transformer": return "Each word becomes a learned vector; attention lets every word look at every other word before it all gets averaged.";
    default: return "Each word becomes a learned vector; the vectors are averaged — order is ignored — and a small network turns the average into an answer.";
  }
}

/**
 * Live weight snapshots cover every linear layer. For the GRU / averaged models those are just the two head layers
 * (the last two connections). The transformer's attention internals would land on the wrong columns, so skip them.
 */
export function textWeights(arch: NNArch | null | undefined, weights: number[][][] | undefined, layers: DiagramLayer[]): number[][][] | undefined {
  if (!weights?.length || (arch?.kind as string) === "text_transformer") return undefined;
  const head = weights.slice(-2);
  // zeros (not empty) for the embedding / recurrent connections, so they stay faint instead of showing made-up weights
  const zeros = () => Array.from({ length: 9 }, () => Array(9).fill(0) as number[]);
  return [...Array.from({ length: Math.max(0, layers.length - 1 - head.length) }, zeros), ...head];
}
