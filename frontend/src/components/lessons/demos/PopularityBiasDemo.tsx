import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import { Slider } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, gauss, pct, rng, useDone } from "./shared";

/* ================================================ a seeded mini streaming service (shared with the cold-start demo) */

export const GENRES = [
  { name: "Action", emoji: "💥", color: "#FF9F0A", mainstream: 1.0 },
  { name: "Comedy", emoji: "😂", color: "#FFD60A", mainstream: 0.85 },
  { name: "Drama", emoji: "🎭", color: "#BF5AF2", mainstream: 0.6 },
  { name: "Sci-fi", emoji: "🚀", color: "#0A84FF", mainstream: 0.5 },
  { name: "Romance", emoji: "💘", color: "#FF375F", mainstream: 0.4 },
  { name: "Docs", emoji: "🌍", color: "#40C8C0", mainstream: 0.3 },
] as const;

const TITLES = [
  ["Steel Horizon", "Red Line", "Overdrive", "Last Stand", "Thunder Run", "Blast Radius", "Hard Target", "Rogue Signal", "Night Raid", "Iron Fist Club"],
  ["Bad Hair Day", "The Wrong Wedding", "Office Llamas", "Dad Jokes", "Totally Fine", "Snack Attack", "Oops!", "Plan Z", "Awkward Silence", "Kid Detective"],
  ["Quiet Rooms", "The Long Winter", "Paper Boats", "Small Mercies", "After the Rain", "The Letter", "Glass Houses", "Still Water", "Brothers", "Ash & Ember"],
  ["Orbit", "Signal 9", "The Last Colony", "Neon Moon", "Time Loop", "Starfall", "Deep Field", "Andromeda Drift", "Synthetic", "Gravity Well"],
  ["Paris Again", "Love, Maybe", "Summer Letters", "Two Coffees", "Second Chances", "Moonlit Bay", "The Proposal Plan", "Ever After-ish", "Postcards", "Rainy Tuesday"],
  ["Deep Oceans", "Bee Kingdom", "The Volcano Year", "Inside the Atom", "Wild Africa", "Planet of Fungi", "Arctic Light", "Brains!", "City of Ants", "The Coral Clock"],
];

export const N_FILMS = 60;
const N_VIEWERS = 40, G = GENRES.length;
/** Taste communities: genre pairs that often go together (action + sci-fi, comedy + romance, …). */
const PAIRS: [number, number][] = [[0, 3], [1, 4], [2, 4], [3, 5], [0, 1], [2, 5]];

export interface Film { id: number; title: string; g: number; quality: number; likes: number; rank: number }
export interface Viewer { id: number; favs: [number, number]; liked: number[]; known: number[]; heldOut: number[] }
export interface World { films: Film[]; viewers: Viewer[]; byPop: number[]; matrix: number[][] }

const sig = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * 60 films (10 per genre) with a power-law "buzz", and 40 viewers who mostly like two genres.
 * A viewer likes a film more often when it's in their genres, good, and heavily promoted. ~35% of each viewer's likes
 * are held out ("they'll go on to like these") to score the recommenders; the rest is what the recommender sees.
 */
export function makeWorld(seed = 3): World {
  const r = rng(seed);
  const raw = TITLES.flatMap((ts, g) => ts.map((title) => ({ title, g, quality: 0.35 + 0.65 * r(), buzz: GENRES[g].mainstream * Math.exp(0.9 * gauss(r)) })));
  const exposure = new Array(N_FILMS).fill(0);
  raw.map((_, i) => i).sort((a, b) => raw[b].buzz - raw[a].buzz).forEach((i, k) => { exposure[i] = 1 / (k + 2); });
  const viewers: Viewer[] = [];
  for (let u = 0; u < N_VIEWERS; u++) {
    let f1 = Math.floor(r() * G), f2 = Math.floor(r() * G);
    if (r() < 0.7) [f1, f2] = PAIRS[Math.floor(r() * PAIRS.length)];
    if (f2 === f1) f2 = (f2 + 1 + Math.floor(r() * (G - 1))) % G;
    if (r() < 0.5) [f1, f2] = [f2, f1];
    const taste = Array.from({ length: G }, () => 0.08 + 0.12 * r());
    taste[f1] = 0.9 + 0.1 * r();
    taste[f2] = 0.55 + 0.15 * r();
    const liked: number[] = [], known: number[] = [], heldOut: number[] = [];
    raw.forEach((f, i) => {
      if (r() < sig(8 * taste[f.g] * f.quality + 1.6 * Math.log(exposure[i] * 12) - 3.9)) { liked.push(i); (r() < 0.35 ? heldOut : known).push(i); }
    });
    viewers.push({ id: u, favs: [f1, f2], liked, known, heldOut });
  }
  const likes = new Array(N_FILMS).fill(0);
  viewers.forEach((v) => v.known.forEach((i) => likes[i]++));
  const byPop = raw.map((_, i) => i).sort((a, b) => likes[b] - likes[a] || raw[b].buzz - raw[a].buzz);
  const films: Film[] = raw.map((f, i) => ({ id: i, title: f.title, g: f.g, quality: f.quality, likes: likes[i], rank: 0 }));
  byPop.forEach((i, k) => { films[i].rank = k; });
  const matrix = viewers.map((v) => { const row = new Array(N_FILMS).fill(0); v.liked.forEach((i) => { row[i] = 1; }); return row; });
  return { films, viewers, byPop, matrix };
}

/** Theme-safe readable text in a hue (mixes it toward the text colour). */
export const ink = (color: string) => `color-mix(in srgb, ${color} 72%, var(--text))`;

/* ================================================ recommender + metrics */

const TOP = 5;
const HEAD = 12; // "the hits": the top 20% of the catalogue by popularity

/** Score = (1 − α)·popularity + α·(share of your history in the film's genre × film quality), both scaled 0…1. */
function recommend(w: World, v: Viewer, alpha: number): number[] {
  const maxLikes = Math.max(1, w.films[w.byPop[0]].likes);
  const gc = new Array(G).fill(0);
  v.known.forEach((i) => gc[w.films[i].g]++);
  const pers = w.films.map((f) => ((gc[f.g] + 0.3) / (v.known.length + 1.8)) * f.quality);
  const maxP = Math.max(...pers);
  const seen = new Set(v.known);
  return w.films
    .filter((f) => !seen.has(f.id))
    .map((f) => ({ id: f.id, s: (1 - alpha) * (f.likes / maxLikes) + alpha * (pers[f.id] / maxP) - 1e-6 * f.rank }))
    .sort((a, b) => b.s - a.s).slice(0, TOP).map((x) => x.id);
}

function evaluate(w: World, alpha: number) {
  const lists = w.viewers.map((v) => recommend(w, v, alpha));
  const shown = new Array(N_FILMS).fill(0);
  let recall = 0, hitViewers = 0, tail = 0, n = 0, withHeld = 0;
  lists.forEach((l, u) => {
    const held = new Set(w.viewers[u].heldOut);
    const h = l.filter((i) => held.has(i)).length;
    if (held.size) { recall += h / Math.min(TOP, held.size); withHeld++; }
    if (h) hitViewers++;
    l.forEach((i) => { shown[i]++; if (w.films[i].rank >= HEAD) tail++; n++; });
  });
  const covered = shown.filter((c) => c > 0).length;
  return { lists, shown, recall: recall / Math.max(1, withHeld), hitRate: hitViewers / lists.length, covered, coverage: covered / N_FILMS, tail: tail / n };
}

/** The three viewers we show (picked from the seeded world: a mainstream fan and two with tastes the hits miss). */
const EXAMPLES = [
  { u: 35, name: "Jay", avatar: "🧢" },
  { u: 6, name: "Priya", avatar: "🧕" },
  { u: 31, name: "Lena", avatar: "👩‍🎤" },
];
const PRESETS = [
  { v: 0, label: "🔥 Hits for all" },
  { v: 0.6, label: "⚖️ Blend" },
  { v: 1, label: "🧲 Fully personal" },
];

/* ================================================ the demo */

export function PopularityBiasDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const world = useMemo(() => makeWorld(3), []);
  const [alpha, setAlpha] = useState(0);
  const ev = useMemo(() => evaluate(world, alpha), [world, alpha]);
  const base = useMemo(() => evaluate(world, 0), [world]);
  const peak = useMemo(() => {
    let best = { a: 0, recall: 0 };
    for (let a = 0; a <= 1.0001; a += 0.05) { const e = evaluate(world, a); if (e.recall > best.recall + 1e-9) best = { a, recall: e.recall }; }
    return best;
  }, [world]);

  const set = (v: number) => { setAlpha(Math.round(v * 20) / 20); done(); };

  const R = pct(ev.recall), R0 = pct(base.recall), cov = `${ev.covered} of ${N_FILMS}`;
  let caption: ReactNode, captionKey: string;
  if (alpha < 0.1) {
    caption = <>Everyone gets the same blockbusters. Only <b>{cov}</b> films are ever shown (the tall bars on the left), and the lists find <b>{R}</b> of the films viewers went on to like. Not bad for zero effort, but nothing in the long tail ever gets a chance. Slide toward <b>personal</b>.</>;
    captionKey = "hits";
  } else if (alpha < 0.45) {
    caption = <>Personal taste starts to break ties. Highlights spread out of the head into the tail, and recall climbs to <b>{R}</b> (hits only: {R0}). Keep going.</>;
    captionKey = "mix";
  } else if (alpha <= 0.85) {
    caption = <>The sweet spot. Each viewer gets the best films from <i>their</i> genres: recall <b>{R}</b> vs {R0} for hits only, <i>and</i> <b>{cov}</b> films shown instead of {base.covered}. Personalising wins on both counts. Look at Priya's and Lena's ✓s.</>;
    captionKey = "sweet";
  } else {
    caption = <>Fully personal: the widest reach (<b>{cov}</b> films, <b>{pct(ev.tail)}</b> of picks from the long tail). Recall slips a little from its peak ({pct(peak.recall)} at {Math.round(peak.a * 100)}% personal) because popularity carries some real signal. That's why real systems <b>blend</b> the two. It still beats hits only on both counts.</>;
    captionKey = "personal";
  }

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 18, rowGap: 10, width: "100%", alignItems: "flex-end" }}>
          <div className="col" style={{ flex: "1 1 260px", maxWidth: 420, gap: 2 }}>
            <Slider label="Everyone gets the hits ↔ Fully personal" value={alpha} min={0} max={1} step={0.05} onChange={set}
              format={(v) => `${Math.round(v * 100)}%`}
              help="Each film's score blends its popularity (how many people liked it) with a personal score: how much of this viewer's history is in the film's genre × how good the film is." />
            <div className="row between tiny faint" style={{ paddingRight: 64 }}><span>🔥 popularity</span><span>🧲 your taste</span></div>
          </div>
          <div className="row wrap" style={{ gap: 6, rowGap: 6 }}>
            {PRESETS.map((p) => {
              const on = Math.abs(alpha - p.v) < 0.001;
              return (
                <button key={p.v} onClick={() => set(p.v)} className="small"
                  style={{ padding: "4px 11px", borderRadius: 999, cursor: "pointer", fontWeight: 560, whiteSpace: "nowrap", color: "var(--text)",
                    background: on ? "var(--accent-soft)" : "var(--fill)", border: `1px solid ${on ? "var(--accent)" : "transparent"}`, transition: "background .2s, border-color .2s" }}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      }
      stats={
        <>
          <Stat label="Recall@5" value={ev.recall} color={C.neg} emphasis={alpha > 0 && ev.recall > base.recall + 0.05} sub={`of held-out likes found · hits only ${R0}`} />
          <Stat label="Hit rate" value={ev.hitRate} color={C.ok} sub="viewers with ≥ 1 ✓ in their top 5" />
          <Stat label="Catalogue coverage" value={ev.coverage} color={C.purple} emphasis={alpha > 0 && ev.covered > base.covered * 2} sub={`${ev.covered} of ${N_FILMS} films ever shown`} />
          <Stat label="Novelty" value={ev.tail} color={C.teal} sub={`picks from outside the top ${HEAD}`} />
        </>
      }
      caption={caption}
      captionKey={captionKey}
    >
      <LongTail world={world} shown={ev.shown} />
      <div className="inset col" style={{ padding: "12px 14px", gap: 10 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <b>🍿 Their top 5</b>
          <span className="tiny faint row" style={{ gap: 6 }}>
            <CheckDot size={14} /> = a film they went on to like (hidden from the recommender)
          </span>
        </div>
        {EXAMPLES.map((ex) => <ViewerRow key={ex.u} world={world} viewer={world.viewers[ex.u]} name={ex.name} avatar={ex.avatar} list={ev.lists[ex.u]} />)}
      </div>
    </DemoFrame>
  );
}

/* ================================================ long-tail chart: popularity up, "recommended to N viewers" down */

function LongTail({ world, shown }: { world: World; shown: number[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const maxLikes = Math.max(1, world.films[world.byPop[0]].likes);
  const UP = 92, DOWN = 52;
  const gap = width && width < 560 ? 1 : 2;
  const headPct = (HEAD / N_FILMS) * 100;
  return (
    <div className="inset col" style={{ padding: "12px 14px", gap: 6, minWidth: 0 }}>
      <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
        <b>🎞 60 films, most popular first</b>
        <Legend items={GENRES.map((g) => ({ color: g.color, label: g.name, shape: "square" as const }))} />
      </div>
      <div ref={ref} style={{ position: "relative", width: "100%" }}>
        {/* the head region */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${headPct}%`, borderRadius: 8, background: "var(--fill)", opacity: 0.7 }} />
        <div className="tiny" style={{ position: "absolute", left: 6, top: 2, fontWeight: 650, color: "var(--text-2)" }}>🔥 the hits</div>
        <div className="tiny" style={{ position: "absolute", left: `calc(${headPct}% + 8px)`, top: 2, fontWeight: 650, color: "var(--text-3)" }}>the long tail →</div>
        <div className="tiny faint" style={{ position: "absolute", right: 2, top: 2 }}>▲ likes</div>
        <div className="tiny faint" style={{ position: "absolute", right: 2, bottom: 0 }}>▼ in how many top-5s (of 40)</div>
        <div style={{ display: "flex", gap, paddingTop: 18, position: "relative" }}>
          {world.byPop.map((id, k) => {
            const f = world.films[id], g = GENRES[f.g], s = shown[id];
            const on = s > 0;
            return (
              <div key={id} title={`${f.title} · ${g.name} · ${f.likes} likes · in ${s} viewer${s === 1 ? "" : "s"}' top 5`}
                style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ height: UP, display: "flex", alignItems: "flex-end" }}>
                  <div style={{
                    width: "100%", height: "100%", transformOrigin: "50% 100%", transform: `scaleY(${Math.max(0.02, f.likes / maxLikes)})`,
                    background: on ? g.color : "var(--fill-2)", opacity: on ? 1 : 0.9, borderRadius: "3px 3px 1px 1px",
                    transition: `background .45s ease ${k * 6}ms, opacity .45s`,
                  }} />
                </div>
                <div style={{ height: 2, background: "var(--text-3)", opacity: 0.5 }} />
                <div style={{ height: DOWN, paddingTop: 2 }}>
                  <div style={{
                    width: "100%", height: "100%", transformOrigin: "50% 0%", transform: `scaleY(${s / N_VIEWERS})`,
                    background: `linear-gradient(180deg, ${g.color}, ${g.color}aa)`, borderRadius: "1px 1px 3px 3px",
                    transition: `transform .7s cubic-bezier(.34,1.28,.64,1) ${k * 8}ms`,
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================ example viewers */

function ViewerRow({ world, viewer, name, avatar, list }: { world: World; viewer: Viewer; name: string; avatar: string; list: number[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const stacked = width > 0 && width < 560;
  const held = new Set(viewer.heldOut);
  const hits = list.filter((i) => held.has(i)).length;
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: stacked ? "1fr" : "128px 1fr", gap: stacked ? 6 : 12, alignItems: "center" }}>
      <div className={stacked ? "row" : "col"} style={{ gap: stacked ? 10 : 3, minWidth: 0 }}>
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <span aria-hidden style={{ width: 30, height: 30, borderRadius: 15, background: "var(--fill)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{avatar}</span>
          <span className="col" style={{ gap: 0, minWidth: 0 }}>
            <b className="small">{name}</b>
            <span className="tiny muted truncate">into {viewer.favs.map((g) => GENRES[g].emoji).join(" ")}</span>
          </span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={hits} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={spring.pop}
            className="tiny" style={{ fontWeight: 650, color: hits ? ink(C.ok) : "var(--text-3)" }}>
            ✓ {hits} of {Math.min(TOP, held.size)} found
          </motion.span>
        </AnimatePresence>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${TOP}, minmax(0, 1fr))`, gap: 7 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((id) => (
            <motion.div key={id} layout initial={{ opacity: 0, scale: 0.7, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.7 }} transition={spring.gentle} style={{ minWidth: 0 }}>
              <Poster film={world.films[id]} check={held.has(id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ================================================ poster card (shared) */

export function CheckDot({ size = 18 }: { size?: number }) {
  return (
    <span aria-label="liked" style={{ width: size, height: size, borderRadius: size / 2, background: C.ok, color: "white", fontSize: size * 0.62, fontWeight: 800,
      display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: `0 2px 6px ${C.ok}77`, flexShrink: 0 }}>✓</span>
  );
}

/** A small genre-coloured "poster": emoji band, title, like count, and an optional ✓. */
export function Poster({ film, check, compact, foot }: { film: Film; check?: boolean; compact?: boolean; foot?: ReactNode }) {
  const g = GENRES[film.g];
  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "var(--glass-strong)", border: "1px solid var(--hairline)",
      boxShadow: check ? `0 0 0 2px ${C.ok}, 0 4px 12px ${C.ok}33` : "0 1px 4px rgba(0,0,0,.08)", transition: "box-shadow .3s" }}>
      <div style={{ height: compact ? 30 : 38, background: `linear-gradient(150deg, ${g.color}, ${g.color}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: compact ? 16 : 19 }}>
        <span aria-hidden>{g.emoji}</span>
      </div>
      <div style={{ padding: compact ? "4px 6px 5px" : "5px 7px 6px" }}>
        <div title={film.title} style={{ fontSize: compact ? 10.5 : 11, fontWeight: 650, lineHeight: 1.25, height: compact ? 26 : 28, overflow: "hidden", color: "var(--text)",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>{film.title}</div>
        <div className="tiny faint num" style={{ fontSize: 10, marginTop: 1, whiteSpace: "nowrap" }}>{foot ?? <>♥ {film.likes}</>}</div>
      </div>
      <AnimatePresence>
        {check && (
          <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring.pop} style={{ position: "absolute", top: 4, right: 4, display: "flex" }}>
            <CheckDot size={compact ? 16 : 18} />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
