import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import { withAlpha } from "../../../lib/colors";
import type { RecItem } from "../../../lib/types";
import { extent, linear, useSize } from "../../charts";
import { InfoTip } from "../../glass";
import { GenreDot, genreColor, genreIcon, titleOf } from "./recKit";

type MapItem = RecItem & { x: number; y: number };

/**
 * "Taste map" for factor models: every film's learned taste vector squashed to 2-D. Dots coloured by genre (which the
 * model never saw), sized by popularity. Hover for the title; click a genre to spotlight it.
 */
export function TasteMap({ items, height = 380 }: { items: MapItem[]; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<MapItem | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const genres = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) c[it.genre ?? "Other"] = (c[it.genre ?? "Other"] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [items]);
  const maxPop = useMemo(() => Math.max(1, ...items.map((i) => i.popularity)), [items]);
  // draw least popular first so blockbusters sit on top
  const order = useMemo(() => [...items].sort((a, b) => a.popularity - b.popularity), [items]);
  const rank = useMemo(() => {
    const r = new Map<string, number>();
    [...items].sort((a, b) => b.popularity - a.popularity).forEach((it, i) => r.set(it.item, i));
    return r;
  }, [items]);
  if (!items.length) return <p className="small muted">No taste map for this model.</p>;

  const pad = 18;
  const [x0, x1] = extent(items.map((i) => i.x));
  const [y0, y1] = extent(items.map((i) => i.y));
  const sx = linear(x0, x1, pad, Math.max(pad + 1, width - pad));
  const sy = linear(y0, y1, height - pad, pad);
  const rOf = (p: number) => 3 + 7 * Math.sqrt(p / maxPop);

  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        The model gave every film a hidden <b>taste vector</b> — a list of numbers chosen so that viewers who like the same films get similar vectors.
        Squashed onto a flat map, films the same people enjoy land close together. <b>Nobody told it the genres</b>: if colours gather into islands, it discovered them from ratings alone.
        <InfoTip text="Each dot is one of the 300 most popular films. Size = how many viewers liked it. The two axes are the two strongest directions of taste (PCA of the factor vectors) — they have no fixed meaning, but often line up with things like 'mainstream vs. arthouse'." />
      </p>
      <div ref={ref} className="inset" style={{ position: "relative", padding: 0, height, overflow: "hidden", borderRadius: 16 }}>
        {width > 0 && (
          <svg width={width} height={height} style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
            <line x1={sx(0)} x2={sx(0)} y1={pad / 2} y2={height - pad / 2} stroke="var(--hairline)" strokeDasharray="2 5" />
            <line y1={sy(0)} y2={sy(0)} x1={pad / 2} x2={width - pad / 2} stroke="var(--hairline)" strokeDasharray="2 5" />
            {order.map((it) => {
              const c = genreColor(it.genre);
              const dim = focus !== null && (it.genre ?? "Other") !== focus;
              const r = rOf(it.popularity);
              const delay = Math.min(1.2, (rank.get(it.item) ?? 0) * 0.004);
              return (
                <motion.circle key={it.item} cx={sx(it.x)} cy={sy(it.y)}
                  initial={{ r: 0, opacity: 0 }} animate={{ r: hover?.item === it.item ? r + 3 : r, opacity: dim ? 0.12 : 0.85 }}
                  transition={{ r: { ...spring.pop, delay: hover ? 0 : delay }, opacity: { duration: 0.3 } }}
                  fill={c} stroke={hover?.item === it.item ? "var(--text)" : withAlpha(c.startsWith("#") ? c : "#8e8e93", 0.9)} strokeWidth={hover?.item === it.item ? 2 : 0.8}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(it)} />
              );
            })}
          </svg>
        )}
        <AnimatePresence>
          {hover && width > 0 && (
            <motion.div key={hover.item} initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
              className="glass strong" style={{
                position: "absolute", pointerEvents: "none", padding: "8px 11px", borderRadius: 12, width: 190,
                left: Math.min(width - 200, Math.max(6, sx(hover.x) + 12)), top: Math.max(6, Math.min(height - 80, sy(hover.y) - 34)),
              }}>
              <div className="row" style={{ gap: 6 }}>
                <span style={{ fontSize: 16 }}>{genreIcon(hover.genre)}</span>
                <b className="truncate" style={{ fontSize: 13 }}>{titleOf(hover)}</b>
              </div>
              <div className="tiny muted" style={{ marginTop: 2 }}>{hover.genre ?? "—"} · liked by {hover.popularity} viewers</div>
            </motion.div>
          )}
        </AnimatePresence>
        <span className="tiny" style={{ position: "absolute", right: 8, bottom: 6, color: "var(--text-3)", background: "var(--glass-strong)", padding: "2px 8px", borderRadius: 6, pointerEvents: "none" }}>
          {items.length} most popular films · bigger = more liked
        </span>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {genres.map(([g, k]) => {
          const on = focus === g;
          return (
            <motion.button key={g} whileTap={{ scale: 0.94 }} onClick={() => setFocus(on ? null : g)} className="btn sm"
              style={{ gap: 6, background: on ? withAlpha(genreColor(g).startsWith("#") ? genreColor(g) : "#8e8e93", 0.2) : undefined, borderColor: on ? genreColor(g) : undefined, opacity: focus && !on ? 0.6 : 1 }}>
              <GenreDot genre={g} size={9} />{g}<span className="faint num tiny">{k}</span>
            </motion.button>
          );
        })}
        {focus && <button className="btn sm ghost" onClick={() => setFocus(null)}>Show all</button>}
      </div>
    </div>
  );
}
