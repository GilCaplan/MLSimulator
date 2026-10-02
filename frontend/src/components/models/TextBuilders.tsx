import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { compact } from "../../lib/format";
import { fullPipeline, useProject } from "../../lib/store";
import type { ArchSummary, NNArch, Task } from "../../lib/types";
import { AnimatedNumber, InfoTip, Slider, Spinner } from "../glass";
import { useIoShape, type TextKind } from "./meta";

/** Text networks store plain numbers for hidden/layers (NNArch types those for the tabular builders), so they get their own shape. */
export interface TextArch { kind: TextKind; embed_dim?: number; hidden?: number; layers?: number; heads?: number; dropout?: number }
export const asTextArch = (a: NNArch) => a as unknown as TextArch;

const pctFmt = (v: number) => `${Math.round(v * 100)}%`;
const KIND_COLOR: Record<TextKind, string> = { embedding_bag: "#FF9F0A", gru: "#30D158", text_transformer: "#BF5AF2" };

const INTRO: Record<TextKind, React.ReactNode> = {
  embedding_bag: <>Every word gets a small <b>vector of meaning</b> (its embedding) that is learned while training. The network <b>averages</b> the
    vectors of a sentence and decides from that — quick, and similar words end up with similar vectors, but the order of the words is lost.</>,
  gru: <>The <b>GRU</b> reads the words one at a time, carrying a <b>memory</b> from word to word (and, here, backwards too). Because it remembers
    what came before, “not” can change what “good” means.</>,
  text_transformer: <>In a <b>Transformer</b>, every word <b>looks at every other word</b> (attention) to decide what it means in context. Several
    <b> heads</b> each look for a different kind of relationship. It's the idea behind large language models, in miniature.</>,
};

/** Sliders for the three neural text kinds, each with a plain explanation. */
export function TextNetBuilder({ arch, onChange }: { arch: TextArch; onChange: (a: TextArch) => void }) {
  const set = (p: Partial<TextArch>) => onChange({ ...arch, ...p });
  const kind = arch.kind;
  const heads = arch.heads ?? 4;
  const embed = arch.embed_dim ?? 64;
  const effective = kind === "text_transformer" ? Math.max(heads, Math.floor(embed / heads) * heads) : embed;
  return (
    <div className="col" style={{ gap: 16 }}>
      <p className="small muted" style={{ lineHeight: 1.55, borderLeft: `3px solid ${KIND_COLOR[kind]}`, paddingLeft: 12 }}>{INTRO[kind]}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 22px" }}>
        <Slider label="Embedding size" help="How many numbers describe each word. Bigger vectors can capture finer shades of meaning — but every word in the vocabulary gets one, so the weight count grows fast."
          value={embed} min={16} max={256} log integer onChange={(v) => set({ embed_dim: v })} />
        <Slider label={kind === "gru" ? "Memory size" : "Decision layer"}
          help={kind === "gru" ? "How many numbers the GRU's memory holds as it reads (in each direction). It's also the width of the small layer that makes the final decision." : "Width of the small layer that turns the sentence vector into a decision."}
          value={arch.hidden ?? 64} min={16} max={256} log integer onChange={(v) => set({ hidden: v })} />
        {kind !== "embedding_bag" && (
          <Slider label={kind === "gru" ? "Stacked GRU layers" : "Attention blocks"}
            help={kind === "gru" ? "Each extra GRU reads the outputs of the one below it — deeper, slower, and needs more data." : "How many rounds of 'every word looks at every word' happen. More blocks = more context, slower training."}
            value={arch.layers ?? (kind === "gru" ? 1 : 2)} min={1} max={4} integer onChange={(v) => set({ layers: v })} />
        )}
        {kind === "text_transformer" && (
          <Slider label="Attention heads" help="Several heads attend in parallel, each free to focus on a different relationship (e.g. 'not' → the adjective, or the item → its aspect)."
            value={heads} min={1} max={8} integer onChange={(v) => set({ heads: v })} />
        )}
        <Slider label="Dropout" help="Randomly switches off some signals while training so the network can't lean on a few memorised words."
          value={arch.dropout ?? 0.2} min={0} max={0.5} step={0.05} format={pctFmt} onChange={(v) => set({ dropout: v })} />
      </div>
      <AnimatePresence>
        {effective !== embed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="small faint">
            The embedding size is rounded to a multiple of the heads, so it will really be <b className="num">{effective}</b>.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Live diagram of the text network plus the server's parameter count and per-part breakdown. */
export function TextArchPreview({ arch, task }: { arch: TextArch; task: Task | null }) {
  const { nOut } = useIoShape(task);
  const report = useProject((s) => s.report);
  const maxLen = useProject((s) => (s.project ? fullPipeline(s.project)?.text?.max_len : undefined) ?? s.project?.pipeline?.text?.max_len ?? 40);
  const vocab = report?.vocab_size ?? 5000;
  const [summary, setSummary] = useState<ArchSummary | null>(null);
  const [checking, setChecking] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const reqId = useRef(0);
  const key = JSON.stringify(arch);

  useEffect(() => {
    const id = ++reqId.current;
    setChecking(true);
    const t = setTimeout(() => {
      api.validateArch({ ...arch, vocab_size: vocab, max_len: maxLen } as unknown as NNArch, maxLen, nOut)
        .then((s) => { if (id === reqId.current) { setSummary(s); setNetError(null); } })
        .catch((e) => { if (id === reqId.current) setNetError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (id === reqId.current) setChecking(false); });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, vocab, maxLen, nOut]);

  const errors = netError ? [netError] : summary && !summary.ok ? summary.errors : [];
  const embShare = summary?.ok && summary.total_params ? (summary.layers.find((l) => l.name === "embedding")?.params ?? 0) / summary.total_params : 0;

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="inset" style={{ padding: "6px 4px", overflow: "hidden" }}>
        <TextNetDiagram arch={arch} nOut={nOut} />
      </div>

      <div className="row" style={{ gap: 10, alignItems: "stretch" }}>
        <div className="inset col grow" style={{ padding: "10px 14px", gap: 2 }}>
          <span className="eyebrow row" style={{ gap: 6 }}>
            Learnable weights <InfoTip text="Every number the network tunes while learning. The word vectors usually dominate: one vector per word in the vocabulary." />
          </span>
          <span className="row" style={{ gap: 8, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {summary?.ok ? <AnimatedNumber value={summary.total_params} format={(v) => Math.round(v).toLocaleString()} /> : <span className="faint">—</span>}
            {checking && <Spinner size={14} color="var(--text-3)" />}
          </span>
        </div>
        <div className="inset col" style={{ padding: "10px 14px", gap: 2, minWidth: 128 }}>
          <span className="eyebrow">Reads</span>
          <span className="num" style={{ fontSize: 18, fontWeight: 650 }}>{maxLen} words</span>
          <span className="tiny faint num">from {vocab.toLocaleString()} known</span>
        </div>
      </div>

      {!report?.vocab_size && (
        <div className="tiny faint row" style={{ gap: 6 }}>
          <span>📐</span> Vocabulary size is estimated until you run the Prepare step; the sentence length is set there too.
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {errors.length > 0 && (
          <motion.div key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="small" style={{ padding: "10px 12px", borderRadius: 12, lineHeight: 1.5, background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
            ⚠️ {errors.join(" ")}
          </motion.div>
        )}
      </AnimatePresence>

      {summary?.ok && summary.layers.length > 0 && (
        <div className="col" style={{ gap: 0 }}>
          {summary.layers.map((l, i) => {
            const share = summary.total_params ? l.params / summary.total_params : 0;
            return (
              <div key={`${l.name}-${i}`} className="row small" style={{ gap: 10, padding: "5px 2px", borderBottom: "1px solid var(--hairline)" }}>
                <span style={{ width: 92, fontWeight: 560 }} className="truncate">{LAYER_NAMES[l.name] ?? l.name}</span>
                <span className="mono faint" style={{ width: 70 }}>[{l.out_shape.join("×")}]</span>
                <div className="grow" style={{ height: 5, borderRadius: 5, background: "var(--fill)", overflow: "hidden" }}>
                  <motion.div animate={{ width: `${Math.max(1, share * 100)}%` }} transition={spring.gentle} style={{ height: "100%", background: "var(--grad)", borderRadius: 5 }} />
                </div>
                <span className="num muted" style={{ width: 48, textAlign: "right" }}>{compact(l.params)}</span>
              </div>
            );
          })}
          {embShare > 0.5 && (
            <span className="tiny faint" style={{ marginTop: 8, lineHeight: 1.5 }}>
              💡 {Math.round(embShare * 100)}% of the weights are word vectors ({vocab.toLocaleString()} words × {summary.layers[0].out_shape[1]} numbers). A smaller vocabulary or embedding shrinks the network most.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const LAYER_NAMES: Record<string, string> = { embedding: "Word vectors", gru: "GRU memory", attention: "Attention", average: "Average", output: "Decision" };

/* ------------------------------------------------------------------ diagram */

const WORDS = ["the", "screen", "is", "not", "bright"];
const DW = 440, DH = 236;
const TX = (i: number) => 40 + i * 58;
const TOKEN_Y = 216;
const EMB_TOP = 160, EMB_BOTTOM = 198;
const ROW0 = 136;
const POOL_X = 362;
const OUT_X = 420;

/** Pseudo-random but stable cell shades for the word vectors. */
function shade(i: number, k: number) {
  const x = Math.sin((i + 1) * 12.9898 + (k + 1) * 78.233) * 43758.5453;
  return 0.25 + 0.75 * (x - Math.floor(x));
}

/** tokens → word vectors → (average | GRU arrows | attention web) → average → output. */
export function TextNetDiagram({ arch, nOut }: { arch: TextArch; nOut: number }) {
  const kind = arch.kind;
  const color = KIND_COLOR[kind];
  const cells = Math.max(3, Math.min(8, Math.round(Math.log2(arch.embed_dim ?? 64)) - 1));
  const layers = kind === "embedding_bag" ? 0 : Math.max(1, Math.min(4, arch.layers ?? 1));
  const heads = Math.max(1, Math.min(8, arch.heads ?? 4));
  const hiddenW = 14 + Math.max(0, Math.log2((arch.hidden ?? 64) / 16)) * 6;
  const gap = layers <= 1 ? 0 : Math.min(40, 92 / (layers - 1));
  const rowY = (r: number) => ROW0 - r * gap;
  const topY = layers ? rowY(layers - 1) : EMB_TOP;
  const POOL = { x: POOL_X, y: layers ? (topY + ROW0) / 2 : 104 };
  const outs = Math.max(2, Math.min(6, nOut));
  const cellH = (EMB_BOTTOM - EMB_TOP) / cells;
  const arcs = useMemo(() => {
    const out: { a: number; b: number; h: number }[] = [];
    for (let a = 0; a < WORDS.length; a++) for (let b = a + 1; b < WORDS.length; b++) out.push({ a, b, h: (a * 3 + b) % heads });
    return out;
  }, [heads]);
  // crop the empty sky above shallow networks
  const vTop = Math.max(0, Math.min(topY - (kind === "text_transformer" ? 48 : 34), POOL.y - (outs - 1) * 8 - 40));
  const headColors = ["#BF5AF2", "#0A84FF", "#FF375F", "#30D158", "#FF9F0A", "#64D2FF", "#5E5CE6", "#FFD60A"];

  return (
    <svg viewBox={`0 ${vTop} ${DW} ${DH - vTop}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* tokens */}
      {WORDS.map((w, i) => (
        <g key={w}>
          <rect x={TX(i) - 25} y={TOKEN_Y - 10} width={50} height={20} rx={10} fill="var(--glass-strong)" stroke="var(--hairline)" />
          <text x={TX(i)} y={TOKEN_Y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text)">{w}</text>
        </g>
      ))}
      <text x={TX(4) + 16} y={EMB_TOP + 16} fontSize={9.5} fill="var(--text-3)" fontWeight={600}>word</text>
      <text x={TX(4) + 16} y={EMB_TOP + 28} fontSize={9.5} fill="var(--text-3)" fontWeight={600}>vectors</text>
      {/* embeddings: a little column of cells above each word */}
      {WORDS.map((_, i) => (
        <g key={`e${i}`}>
          {Array.from({ length: cells }, (_, k) => (
            <motion.rect key={`${k}-${cells}`} x={TX(i) - 8} y={EMB_TOP + k * cellH + 0.5} width={16} height={cellH - 1} rx={2} fill="#FF9F0A"
              initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: [shade(i, k), shade(i, k + 3), shade(i, k)], scaleX: 1 }}
              transition={{ opacity: { duration: 3, repeat: Infinity, delay: (i + k) * 0.1 }, scaleX: spring.snappy }}
              style={{ originX: `${TX(i)}px` }} />
          ))}
        </g>
      ))}

      {kind === "embedding_bag" && WORDS.map((_, i) => (
        <motion.path key={`bag${i}`} d={`M ${TX(i)} ${EMB_TOP - 2} C ${TX(i)} ${POOL.y + 20}, ${POOL.x - 60} ${POOL.y}, ${POOL.x - 12} ${POOL.y}`} fill="none" stroke={color} strokeWidth={1.6}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1, opacity: [0.35, 0.9, 0.35] }} transition={{ pathLength: { duration: 0.6, delay: i * 0.06 }, opacity: { duration: 2, repeat: Infinity, delay: i * 0.2 } }} />
      ))}

      {kind === "gru" && Array.from({ length: layers }, (_, r) => (
        <g key={`row${r}`}>
          {WORDS.map((_, i) => (
            <g key={i}>
              <line x1={TX(i)} y1={(r === 0 ? EMB_TOP : rowY(r - 1) - 9) - 1} x2={TX(i)} y2={rowY(r) + 9} stroke="var(--text-3)" strokeWidth={1} />
              {i < WORDS.length - 1 && (
                <>
                  <line x1={TX(i) + hiddenW / 2 + 2} y1={rowY(r) - 2} x2={TX(i + 1) - hiddenW / 2 - 4} y2={rowY(r) - 2} stroke={color} strokeWidth={1.6} markerEnd="url(#arrG)" />
                  <line x1={TX(i + 1) - hiddenW / 2 - 2} y1={rowY(r) + 3} x2={TX(i) + hiddenW / 2 + 4} y2={rowY(r) + 3} stroke={color} strokeWidth={1} opacity={0.35} markerEnd="url(#arrG)" />
                </>
              )}
              <motion.rect x={TX(i) - hiddenW / 2} y={rowY(r) - 9} width={hiddenW} height={18} rx={5} fill={color}
                initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.pop, delay: 0.04 * i + 0.08 * r }}
                style={{ originX: `${TX(i)}px`, originY: `${rowY(r)}px` }} />
            </g>
          ))}
          {/* memory pulse travelling along the row */}
          <motion.circle r={3.4} cy={rowY(r) - 2} fill="var(--bg)" stroke={color} strokeWidth={1.5}
            animate={{ cx: WORDS.map((_, i) => TX(i)), opacity: [0, 1, 1, 1, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: r * 0.35 }} />
        </g>
      ))}

      {kind === "text_transformer" && Array.from({ length: layers }, (_, r) => (
        <g key={`att${r}`}>
          {arcs.map(({ a, b, h }, k) => {
            const y = rowY(r);
            const lift = 6 + (b - a) * Math.min(7, Math.max(3, gap / 5));
            return (
              <motion.path key={`${k}-${heads}`} d={`M ${TX(a)} ${y} Q ${(TX(a) + TX(b)) / 2} ${y - lift} ${TX(b)} ${y}`} fill="none"
                stroke={headColors[h % headColors.length]} strokeWidth={1.3}
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: [0.15, 0.85, 0.15] }}
                transition={{ pathLength: { duration: 0.5, delay: k * 0.02 }, opacity: { duration: 2.4, repeat: Infinity, delay: ((k * 7) % 10) * 0.18 + r * 0.3 } }} />
            );
          })}
          {WORDS.map((_, i) => (
            <g key={i}>
              <line x1={TX(i)} y1={(r === 0 ? EMB_TOP : rowY(r - 1)) - 1} x2={TX(i)} y2={rowY(r) + 5} stroke="var(--text-3)" strokeWidth={1} />
              <motion.circle cx={TX(i)} cy={rowY(r)} r={5.5} fill={color} stroke="var(--bg)" strokeWidth={1.2}
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.pop, delay: 0.04 * i + 0.08 * r }}
                style={{ originX: `${TX(i)}px`, originY: `${rowY(r)}px` }} />
            </g>
          ))}
        </g>
      ))}

      {/* the top row's outputs are gathered and averaged */}
      {kind !== "embedding_bag" && (
        <g>
          <rect x={TX(0) - 16} y={topY - 13} width={TX(4) - TX(0) + 32} height={26} rx={13} fill="none" stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.7} />
          <path d={`M ${TX(4) + 16} ${topY} C ${TX(4) + 40} ${topY}, ${POOL.x - 34} ${POOL.y}, ${POOL.x - 13} ${POOL.y}`} fill="none" stroke="var(--accent)" strokeWidth={1.4} opacity={0.8} />
        </g>
      )}

      {/* average + output */}
      <rect x={POOL.x - 11} y={POOL.y - 26} width={22} height={52} rx={6} fill="var(--accent)" opacity={0.9} />
      <text x={POOL.x} y={POOL.y + 40} textAnchor="middle" fontSize={9.5} fill="var(--text-3)" fontWeight={600}>average</text>
      {Array.from({ length: outs }, (_, k) => {
        const y = POOL.y + (k - (outs - 1) / 2) * 16;
        return (
          <g key={`o${k}`}>
            <line x1={POOL.x + 11} y1={POOL.y} x2={OUT_X - 6} y2={y} stroke="var(--text-3)" strokeWidth={1} opacity={0.6} />
            <motion.circle cx={OUT_X} cy={y} r={6} fill="#30D158" stroke="var(--bg)" strokeWidth={1.2}
              animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity, delay: k * 0.25 }} style={{ originX: `${OUT_X}px`, originY: `${y}px` }} />
          </g>
        );
      })}
      <text x={OUT_X} y={POOL.y - (outs - 1) * 8 - 14} textAnchor="middle" fontSize={9.5} fill="var(--text-3)" fontWeight={600}>answer</text>

      {/* captions */}
      <text x={TX(0) - 22} y={vTop + 16} fontSize={10.5} fill={color} fontWeight={700}>
        {kind === "embedding_bag" ? "averaged — word order is lost" : kind === "gru" ? `reads in order${layers > 1 ? ` · ${layers} layers` : ""} · both directions` : `attention · ${heads} head${heads === 1 ? "" : "s"} · ${layers} block${layers === 1 ? "" : "s"}`}
      </text>
      <defs>
        <marker id="arrG" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={5} markerHeight={5} orient="auto-start-reverse">
          <path d="M0 0 L6 3 L0 6 z" fill={color} />
        </marker>
      </defs>
    </svg>
  );
}
