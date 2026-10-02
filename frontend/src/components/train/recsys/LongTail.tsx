import { motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import { useSize } from "../../charts";
import { AnimatedNumber, InfoTip } from "../../glass";
import { metricHelp } from "../util";

const LIKED = "#8E8E93";
const RECD = "#5E5CE6";
const HEAD = "#FF9F0A";

/**
 * "Long tail": films sorted from most to least liked. Top half — how often each was liked; bottom half (mirrored) — how
 * often the model recommended it. The shaded head is the 10% most popular films.
 */
export function LongTail({ data, coverage, novelty, height = 250 }: {
  data: { popularity: number[]; recommended: number[] };
  coverage?: number;
  novelty?: number;
  height?: number;
}) {
  const clip = useId().replace(/:/g, "");
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pop = data.popularity ?? [];
  const recd = data.recommended ?? [];
  const n = pop.length;

  const stats = useMemo(() => {
    const head = Math.max(1, Math.ceil(n * 0.1));
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const totalRec = sum(recd) || 1, totalLike = sum(pop) || 1;
    return {
      head,
      recHead: sum(recd.slice(0, head)) / totalRec,
      likeHead: sum(pop.slice(0, head)) / totalLike,
      never: recd.filter((v) => v === 0).length,
      maxPop: Math.max(1, ...pop),
      maxRec: Math.max(1, ...recd),
    };
  }, [pop, recd, n]);

  if (!n) return <p className="small muted">No long-tail data was saved with this model.</p>;

  const m = { l: 8, r: 8, t: 22, b: 22 };
  const mid = m.t + (height - m.t - m.b) / 2;
  const half = (height - m.t - m.b) / 2 - 4;
  const W = Math.max(10, width - m.l - m.r);
  const x = (i: number) => m.l + (i / Math.max(1, n - 1)) * W;
  const bw = Math.max(0.6, W / n - 0.4);
  const likePath = `M${x(0)},${mid} ` + pop.map((v, i) => `L${x(i).toFixed(1)},${(mid - 2 - (v / stats.maxPop) * half).toFixed(1)}`).join(" ") + ` L${x(n - 1)},${mid} Z`;
  const headX = x(stats.head - 0.5);
  const amplifies = stats.recHead > stats.likeHead + 0.08;
  const spreads = stats.recHead < stats.likeHead - 0.03;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        Every film, sorted from the biggest blockbuster (left) to the most obscure (right). <b style={{ color: "var(--text-2)" }}>Grey</b> shows how often viewers liked each film;
        <b style={{ color: RECD }}> purple</b> (mirrored underneath) how often this model put it in someone's top 10. A healthy recommender reaches into the long tail on the right.
      </p>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Stat i={0} label="Picks going to the top 10% of films" tip={`The 10% most popular films (${stats.head} titles) receive this share of all top-10 slots. They earn ${Math.round(stats.likeHead * 100)}% of the likes.`}
          value={stats.recHead * 100} fmt={(v) => `${v.toFixed(0)}%`} sub={`they earn ${Math.round(stats.likeHead * 100)}% of the likes`} tone={amplifies ? "bad" : spreads ? "good" : undefined} />
        {coverage !== undefined && <Stat i={1} label="Coverage" tip={metricHelp("coverage", "recommendation")} value={coverage * 100} fmt={(v) => `${v.toFixed(0)}%`} sub="of the catalogue ever recommended" tone={coverage >= 0.4 ? "good" : coverage < 0.15 ? "bad" : undefined} />}
        {novelty !== undefined && <Stat i={2} label="Novelty" tip={metricHelp("novelty", "recommendation")} value={novelty * 100} fmt={(v) => `${v.toFixed(0)}%`} sub={novelty < 0.15 ? "mostly blockbusters" : novelty > 0.6 ? "mostly niche titles" : "a mix of hits and finds"} />}
        <Stat i={3} label="Never recommended" tip="Films that didn't make a single viewer's top 10 (among the first 400 viewers)." value={stats.never} fmt={(v) => `${Math.round(v)}`} sub={`of ${n} films`} tone={stats.never / n > 0.6 ? "bad" : undefined} />
      </div>

      <div ref={ref} className="inset" style={{ position: "relative", padding: 0, height, overflow: "hidden" }}>
        {width > 0 && (
          <svg width={width} height={height} style={{ display: "block" }}>
            <defs>
              <clipPath id={`lt${clip}`}>
                <motion.rect x={0} y={0} height={height} initial={{ width: 0 }} animate={{ width }} transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }} />
              </clipPath>
              <linearGradient id={`lg${clip}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={LIKED} stopOpacity={0.55} />
                <stop offset="100%" stopColor={LIKED} stopOpacity={0.15} />
              </linearGradient>
            </defs>
            {/* the head: top 10% most popular */}
            <motion.rect x={m.l} y={m.t - 14} height={height - m.t - m.b + 20} fill={HEAD} fillOpacity={0.12} stroke={HEAD} strokeOpacity={0.35} strokeDasharray="4 4"
              initial={{ width: 0 }} animate={{ width: Math.max(0, headX - m.l) }} transition={{ ...spring.gentle, delay: 0.4 }} rx={6} />
            <text x={m.l + 6} y={m.t - 3} fontSize={10.5} fontWeight={700} fill={HEAD}>top 10%</text>
            <text x={width - m.r - 4} y={m.t - 3} fontSize={10.5} textAnchor="end" fill="var(--text-3)">the long tail →</text>
            <g clipPath={`url(#lt${clip})`}>
              <path d={likePath} fill={`url(#lg${clip})`} stroke={LIKED} strokeWidth={1.2} strokeOpacity={0.8} />
              {recd.map((v, i) => v > 0 && (
                <rect key={i} x={x(i) - bw / 2} y={mid + 2} width={bw} height={Math.max(1, (v / stats.maxRec) * half)} fill={RECD} fillOpacity={i < stats.head ? 0.95 : 0.7} rx={Math.min(1.5, bw / 2)} />
              ))}
            </g>
            <line x1={m.l} x2={width - m.r} y1={mid} y2={mid} stroke="var(--hairline)" />
            <text x={m.l + 2} y={height - 6} fontSize={10.5} fill="var(--text-3)">↑ liked · ↓ recommended</text>
            <text x={width - m.r - 2} y={height - 6} fontSize={10.5} textAnchor="end" fill="var(--text-3)">most popular → least popular</text>
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={m.t - 6} y2={height - m.b + 4} stroke="var(--text-2)" strokeDasharray="3 3" />
                <circle cx={x(hover)} cy={mid - 2 - (pop[hover] / stats.maxPop) * half} r={3.5} fill={LIKED} stroke="var(--glass-strong)" strokeWidth={1.5} />
                <circle cx={x(hover)} cy={mid + 2 + (recd[hover] / stats.maxRec) * half} r={3.5} fill={RECD} stroke="var(--glass-strong)" strokeWidth={1.5} />
              </g>
            )}
            <rect x={m.l} y={0} width={W} height={height} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
          </svg>
        )}
        {hover !== null && width > 0 && (
          <div className="glass strong tiny" style={{ position: "absolute", top: 8, left: Math.min(width - 190, Math.max(8, x(hover) + 10)), width: 180, padding: "8px 10px", borderRadius: 10, pointerEvents: "none", lineHeight: 1.5 }}>
            <b>#{hover + 1} most popular film</b><br />
            <span style={{ color: "var(--text-2)" }}>liked by {pop[hover]} viewers</span><br />
            <span style={{ color: RECD, fontWeight: 600 }}>{recd[hover] ? `in ${recd[hover]} top-10 lists` : "never recommended"}</span>
          </div>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.9 }} className="inset row"
        style={{ gap: 10, padding: "10px 12px", alignItems: "flex-start", background: amplifies ? "rgba(255,159,10,.08)" : spreads ? "rgba(48,209,88,.08)" : undefined }}>
        <span style={{ fontSize: 18 }}>{amplifies ? "📢" : spreads ? "🌱" : "⚖️"}</span>
        <span className="small" style={{ lineHeight: 1.55 }}>
          {amplifies
            ? <><b>Popularity bias.</b> <span className="muted">The top 10% of films take {Math.round(stats.recHead * 100)}% of all recommendations, though they only earn {Math.round(stats.likeHead * 100)}% of the likes — this model makes the rich richer and {stats.never} films never get shown at all.</span></>
            : spreads
              ? <><b>Spreads the attention.</b> <span className="muted">Blockbusters get a smaller share of the picks ({Math.round(stats.recHead * 100)}%) than of the likes ({Math.round(stats.likeHead * 100)}%) — niche films that suit someone's taste get their moment.</span></>
              : <><b>Roughly fair.</b> <span className="muted">Blockbusters get about the share of recommendations they earn in likes ({Math.round(stats.recHead * 100)}% vs {Math.round(stats.likeHead * 100)}%).</span></>}
        </span>
        <InfoTip text="Recommenders learn from what people already watched — and people watch what gets recommended. Left alone, that loop pushes the same hits ever harder. Coverage and novelty are the numbers that catch it." />
      </motion.div>
    </div>
  );
}

function Stat({ label, value, fmt, sub, tip, tone, i }: { label: string; value: number; fmt: (v: number) => string; sub?: string; tip?: string; tone?: "good" | "bad"; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.gentle, delay: i * 0.05 }} className="inset col" style={{ padding: 12, gap: 3 }}>
      <span className="row small muted" style={{ gap: 5 }}>{label}{tip && <InfoTip text={tip} />}</span>
      <b className="num" style={{ fontSize: 24, letterSpacing: "-0.02em", color: tone === "good" ? "var(--success)" : tone === "bad" ? "var(--danger)" : undefined }}>
        <AnimatedNumber value={value} format={fmt} />
      </b>
      {sub && <span className="tiny faint">{sub}</span>}
    </motion.div>
  );
}
