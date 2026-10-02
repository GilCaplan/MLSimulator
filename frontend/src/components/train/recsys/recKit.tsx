import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { spring } from "../../../design/motion";
import { classColor, withAlpha } from "../../../lib/colors";
import type { RecItem } from "../../../lib/types";

/* ------------------------------------------------------------------ genres */

/** Fixed colours + icons for the synthetic movie genres (mlp/core/recsys.py GENRES); other genres hash to the palette. */
export const GENRES: Record<string, { color: string; icon: string }> = {
  Action: { color: "#FF9F0A", icon: "💥" },
  Comedy: { color: "#FFD60A", icon: "😂" },
  Drama: { color: "#BF5AF2", icon: "🎭" },
  "Sci-Fi": { color: "#0A84FF", icon: "🚀" },
  Romance: { color: "#FF375F", icon: "💘" },
  Horror: { color: "#32D74B", icon: "👻" },
  Documentary: { color: "#AC8E68", icon: "🎥" },
  Animation: { color: "#64D2FF", icon: "🧸" },
};
export const genreColor = (g?: string | null) => (g && GENRES[g] ? GENRES[g].color : g ? classColor(g) : "#8e8e93");
export const genreIcon = (g?: string | null) => (g && GENRES[g] ? GENRES[g].icon : "🎬");
export const titleOf = (it: Pick<RecItem, "title" | "item">) => it.title || it.item;

/** Genre share of a list of items, biggest first. */
export function genreMix(items: RecItem[]): { genre: string; share: number; n: number }[] {
  const c: Record<string, number> = {};
  for (const it of items) c[it.genre ?? "Other"] = (c[it.genre ?? "Other"] ?? 0) + 1;
  const n = items.length || 1;
  return Object.entries(c).map(([genre, k]) => ({ genre, n: k, share: k / n })).sort((a, b) => b.n - a.n);
}

/* ------------------------------------------------------------------ small pieces */

/** Read-only star rating (half stars rounded). */
export function Stars({ value, size = 12, color = "#FFB800" }: { value: number; size?: number; color?: string }) {
  const v = Math.round(value);
  return (
    <span aria-label={`${value} stars`} style={{ letterSpacing: 0.5, fontSize: size, lineHeight: 1, whiteSpace: "nowrap" }}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ color: i <= v ? color : "var(--text-3)", opacity: i <= v ? 1 : 0.45 }}>★</span>)}
    </span>
  );
}

/** Clickable 1–5 stars (click the current value again to clear). */
export function StarInput({ value, onChange, size = 18 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <span className="row" style={{ gap: 1 }} onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.button key={i} type="button" aria-label={`${i} star${i > 1 ? "s" : ""}`} title={["", "Not for me", "Meh", "It's OK", "Liked it", "Loved it!"][i]}
          whileHover={{ scale: 1.25, rotate: -8 }} whileTap={{ scale: 0.8 }} transition={spring.pop}
          onClick={() => onChange(value === i ? 0 : i)}
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: "0 1px", fontSize: size, lineHeight: 1, color: i <= value ? "#FFB800" : "var(--text-3)", opacity: i <= value ? 1 : 0.5, textShadow: i <= value ? "0 1px 6px rgba(255,184,0,.45)" : "none" }}>
          ★
        </motion.button>
      ))}
    </span>
  );
}

export function GenreDot({ genre, size = 8 }: { genre?: string | null; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: size, background: genreColor(genre), flexShrink: 0, display: "inline-block" }} />;
}

/** "because you liked X" chip (item-kNN explanations). Compact = a two-line tag that fits under a poster. */
export function BecauseChip({ title, compact }: { title: string; compact?: boolean }) {
  if (compact) {
    return (
      <span title={`Recommended because you liked “${title}”`}
        style={{ display: "flex", flexDirection: "column", gap: 0, maxWidth: "100%", padding: "3px 8px", borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent)", lineHeight: 1.25 }}>
        <span style={{ fontSize: 9.5, fontWeight: 600, opacity: 0.8, whiteSpace: "nowrap" }}>🧲 you liked</span>
        <span className="truncate" style={{ fontSize: 11, fontWeight: 700 }}>{title}</span>
      </span>
    );
  }
  return (
    <span className="tiny truncate" title={`Recommended because you liked “${title}”`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", padding: "2px 8px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 }}>
      <span aria-hidden>🧲</span><span className="truncate">because you liked {title}</span>
    </span>
  );
}

/** A thin stacked bar of genre shares with a legend on hover. */
export function GenreBar({ items, height = 10, label }: { items: RecItem[]; height?: number; label?: ReactNode }) {
  const mix = genreMix(items);
  return (
    <div className="col" style={{ gap: 4, minWidth: 0 }}>
      {label && <span className="tiny faint">{label}</span>}
      <div className="row" style={{ height, borderRadius: height, overflow: "hidden", gap: 0, background: "var(--fill)" }}>
        {mix.map((m, i) => (
          <motion.span key={m.genre} title={`${genreIcon(m.genre)} ${m.genre}: ${m.n} of ${items.length}`} initial={{ width: 0 }} animate={{ width: `${m.share * 100}%` }} transition={{ ...spring.gentle, delay: 0.05 * i }}
            style={{ display: "block", height, background: genreColor(m.genre), minWidth: 2, cursor: "help" }} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ poster */

/**
 * A poster-like film card: genre-coloured artwork with its icon, the title on a frosted strip, plus optional stars,
 * rank number, hit tick and "because" chip. Popularity shows as a tiny flame count.
 */
export function Poster({ item, rank, rating, hit, because, width = 116, delay = 0, onClick, selected, footer, style }: {
  item: RecItem;
  rank?: number;
  rating?: number;
  hit?: boolean;
  because?: string | null;
  width?: number;
  delay?: number;
  onClick?: () => void;
  selected?: boolean;
  footer?: ReactNode;
  style?: CSSProperties;
}) {
  const c = genreColor(item.genre);
  const h = Math.round(width * 1.42);
  const seed = Array.from(item.item).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const angle = 100 + (seed % 70);
  return (
    <motion.div
      initial={{ opacity: 0, rotateY: -70, y: 10 }} animate={{ opacity: 1, rotateY: 0, y: 0 }} exit={{ opacity: 0, scale: 0.85 }}
      transition={{ ...spring.gentle, delay }} whileHover={{ y: -4, scale: 1.03 }}
      onClick={onClick}
      className="col" style={{ width, gap: 6, flexShrink: 0, cursor: onClick ? "pointer" : "default", transformPerspective: 700, ...style }}>
      <div style={{
        position: "relative", width, height: h, borderRadius: 12, overflow: "hidden",
        background: `linear-gradient(${angle}deg, ${withAlpha(c, 0.95)}, ${withAlpha(c, 0.45)} 60%, ${withAlpha(c, 0.25)})`,
        boxShadow: selected ? `0 0 0 3px var(--accent), 0 8px 24px ${withAlpha(c, 0.45)}` : hit ? `0 0 0 2.5px var(--success), 0 8px 22px ${withAlpha(c, 0.35)}` : `0 6px 18px ${withAlpha(c, 0.28)}, 0 0 0 1px var(--glass-border)`,
      }}>
        {/* subtle film-grain stripes */}
        <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.18, background: `repeating-linear-gradient(${angle + 60}deg, rgba(255,255,255,.6) 0 2px, transparent 2px ${8 + (seed % 9)}px)` }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,.45), transparent 55%)" }} />
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: h * 0.2, textAlign: "center", fontSize: width * 0.36, filter: "drop-shadow(0 4px 8px rgba(0,0,0,.25))" }}>{genreIcon(item.genre)}</span>
        {rank !== undefined && (
          <span className="num" style={{ position: "absolute", left: 6, top: 5, fontSize: 12, fontWeight: 800, padding: "1px 7px", borderRadius: 8, background: "rgba(0,0,0,.42)", color: "white" }}>#{rank}</span>
        )}
        {hit && (
          <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: delay + 0.35 }}
            title="A hit: this viewer really went on to like it (it was hidden from the model)"
            style={{ position: "absolute", right: 6, top: 5, width: 24, height: 24, borderRadius: 12, background: "var(--success)", color: "white", fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(48,209,88,.6)" }}>
            ✓
          </motion.span>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "6px 8px 7px", background: "var(--glass-strong)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderTop: "1px solid var(--glass-border)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{titleOf(item)}</div>
          <div className="row between" style={{ marginTop: 2, gap: 4 }}>
            <span className="tiny truncate" style={{ color: "var(--text-2)", fontSize: 10, minWidth: 0 }}>{item.genre ?? "—"}</span>
            <span className="tiny num" title={`${item.popularity} people liked it`} style={{ color: "var(--text-3)", fontSize: 10, flexShrink: 0, whiteSpace: "nowrap" }}>🔥{item.popularity}</span>
          </div>
        </div>
      </div>
      {rating !== undefined && rating > 0 && <Stars value={rating} />}
      {because && <BecauseChip title={because} compact />}
      {footer}
    </motion.div>
  );
}

/** One compact row for a list of films (sidebars, histories). */
export function FilmRow({ item, right, rank, hit, because, delay = 0 }: { item: RecItem; right?: ReactNode; rank?: number; hit?: boolean; because?: string | null; delay?: number }) {
  const c = genreColor(item.genre);
  return (
    <motion.div layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ ...spring.gentle, delay }}
      className="row" style={{ gap: 10, padding: "6px 8px", borderRadius: 12, background: hit ? "rgba(48,209,88,.08)" : "transparent" }}>
      {rank !== undefined && <span className="num tiny faint" style={{ width: 18, textAlign: "right", fontWeight: 700 }}>{rank}</span>}
      <span style={{ width: 30, height: 42, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: `linear-gradient(160deg, ${withAlpha(c, 0.95)}, ${withAlpha(c, 0.35)})`, boxShadow: `0 2px 8px ${withAlpha(c, 0.3)}` }}>
        {genreIcon(item.genre)}
      </span>
      <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
        <b className="truncate" style={{ fontSize: 13 }}>{titleOf(item)}</b>
        <span className="row tiny faint" style={{ gap: 6, minWidth: 0 }}>
          <span className="row" style={{ gap: 4 }}><GenreDot genre={item.genre} size={6} />{item.genre ?? "—"}</span>
          <span>· 🔥 {item.popularity}</span>
          {hit && <span style={{ color: "var(--success)", fontWeight: 700 }}>· ✓ they liked it</span>}
        </span>
        {because && <span style={{ maxWidth: "100%" }}><BecauseChip title={because} /></span>}
      </span>
      {right}
    </motion.div>
  );
}
