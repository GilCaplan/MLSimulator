import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import { Toggle } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, MeterBar, gauss, rng, useDone } from "./shared";
import { CheckDot, GENRES, N_FILMS, Poster, ink, makeWorld, type World } from "./PopularityBiasDemo";

/* ------------------------------------------------ tiny linear algebra */

/** Solve A·x = b for a small dense system (Gauss–Jordan, partial pivoting). */
function solve(A: number[][], b: number[]) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let k = c + 1; k < n; k++) if (Math.abs(M[k][c]) > Math.abs(M[p][c])) p = k;
    [M[c], M[p]] = [M[p], M[c]];
    for (let k = 0; k < n; k++) {
      if (k === c || !M[c][c]) continue;
      const f = M[k][c] / M[c][c];
      for (let j = c; j <= n; j++) M[k][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => (row[i] ? row[n] / row[i] : 0));
}

/** Ridge regression: the x minimising Σ (y − f·x)² + λ|x|². */
function ridge(F: number[][], ys: number[], lam: number, k: number) {
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? lam : 0)));
  const b = new Array(k).fill(0);
  F.forEach((f, n) => { for (let i = 0; i < k; i++) { b[i] += f[i] * ys[n]; for (let j = 0; j < k; j++) A[i][j] += f[i] * f[j]; } });
  return solve(A, b);
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/* ------------------------------------------------ models trained once on the 40 regular viewers */

const K = 8; // taste dimensions
const TOP = 5, MAX_RATINGS = 5, FALLBACK_UNTIL = 3;

interface Models { V: number[][]; mu: number[]; sim: number[][]; u0: number[] }

function train(w: World): Models {
  const n = w.matrix.length;
  const mu = w.films.map((_, j) => w.matrix.reduce((s, row) => s + row[j], 0) / n);
  // Matrix factorisation by alternating least squares on the (centred) like matrix.
  const R = w.matrix.map((row) => row.map((x, j) => x - mu[j]));
  const r = rng(99);
  let U = R.map(() => Array.from({ length: K }, () => 0.1 * gauss(r)));
  let V = w.films.map(() => Array.from({ length: K }, () => 0.1 * gauss(r)));
  for (let it = 0; it < 20; it++) {
    U = R.map((row) => ridge(V, row, 0.05, K));
    V = w.films.map((_, j) => ridge(U, R.map((row) => row[j]), 0.05, K));
  }
  const norm = Math.sqrt(V.reduce((s, v) => s + dot(v, v), 0) / V.length) || 1;
  V = V.map((v) => v.map((x) => x / norm));
  // Item–item similarity: how often two films are liked by the same people (cosine on co-occurrence).
  const cnt = w.films.map((_, j) => w.matrix.reduce((s, row) => s + row[j], 0));
  const sim = w.films.map((_, i) => w.films.map((_, j) => {
    if (i === j || !cnt[i] || !cnt[j]) return 0;
    let c = 0;
    w.matrix.forEach((row) => { c += row[i] * row[j]; });
    return c / Math.sqrt(cnt[i] * cnt[j]);
  }));
  // A newcomer's taste vector starts as a random first guess, just like in a freshly initialised model.
  const pr = rng(13);
  const u0 = Array.from({ length: K }, () => 0.3 * gauss(pr));
  return { V, mu, sim, u0 };
}

const topOf = (w: World, scores: number[], rated: number[]) => {
  const ex = new Set(rated);
  return w.films.filter((f) => !ex.has(f.id)).map((f) => ({ id: f.id, s: scores[f.id] - 1e-9 * f.rank })).sort((a, b) => b.s - a.s).slice(0, TOP).map((x) => x.id);
};
/** ✓ count: recommended films she'd love (rated films are never recommended, so they can't count). */
const hitsOf = (list: number[], loves: Set<number>) => list.filter((i) => loves.has(i)).length;
const popular = (w: World, rated: number[]) => { const ex = new Set(rated); return w.byPop.filter((i) => !ex.has(i)).slice(0, TOP); };

/** Taste vector: ridge regression pulled from the first guess u0 toward explaining Mia's likes, then score every film. */
function tasteVector(w: World, m: Models, rated: number[]) {
  const d = ridge(rated.map((i) => m.V[i]), rated.map((i) => 1 - m.mu[i] - dot(m.V[i], m.u0)), 0.3, K);
  const u = m.u0.map((x, k) => x + d[k]);
  const scores = m.V.map((v) => dot(v, u));
  const byGenre = GENRES.map((_, g) => { const ids = w.films.filter((f) => f.g === g); return ids.reduce((s, f) => s + scores[f.id], 0) / ids.length; });
  return { top: topOf(w, scores, rated), byGenre };
}

/** Similar items: add up each film's similarity to the films Mia liked. */
const similar = (w: World, m: Models, rated: number[]) =>
  rated.length ? topOf(w, w.films.map((_, j) => rated.reduce((s, i) => s + m.sim[i][j], 0)), rated) : [];

/* ------------------------------------------------ the newcomer */

const LOVED_GENRES = [3, 5]; // Mia secretly loves sci-fi and documentaries
const GRID = ["Time Loop", "Bee Kingdom", "Orbit", "Gravity Well", "The Coral Clock", "Signal 9", "The Volcano Year", "Neon Moon"];
const AUTO_ORDER = ["Time Loop", "Bee Kingdom", "The Coral Clock", "Orbit", "The Volcano Year", "Gravity Well", "Signal 9", "Neon Moon"];

const COL = { pop: "#8E8E93", taste: "#5E5CE6", knn: "#A2845E" };

/* ------------------------------------------------ the demo */

export function ColdStartDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const world = useMemo(() => makeWorld(3), []);
  const models = useMemo(() => train(world), [world]);
  const idOf = useMemo(() => new Map(world.films.map((f) => [f.title, f.id])), [world]);
  const grid = useMemo(() => GRID.map((t) => idOf.get(t)!), [idOf]);
  const auto = useMemo(() => AUTO_ORDER.map((t) => idOf.get(t)!), [idOf]);
  const loves = useMemo(() => new Set(world.films.filter((f) => LOVED_GENRES.includes(f.g)).map((f) => f.id)), [world]);

  const [rated, setRated] = useState<number[]>([]);
  const [fallback, setFallback] = useState(false);
  const n = rated.length;

  const toggle = (id: number) => {
    setRated((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length >= MAX_RATINGS ? r : [...r, id]));
    done();
  };
  const rateOne = () => {
    const next = auto.find((id) => !rated.includes(id));
    if (next !== undefined && n < MAX_RATINGS) setRated([...rated, next]);
    done();
  };

  const lists = useMemo(() => {
    const tv = tasteVector(world, models, rated);
    return { pop: popular(world, rated), taste: tv.top, byGenre: tv.byGenre, knn: similar(world, models, rated) };
  }, [world, models, rated]);
  const usingFallback = fallback && n < FALLBACK_UNTIL;
  const tasteList = usingFallback ? lists.pop : lists.taste;

  // hits@5 after 0, 1, … n ratings, for the little progress chart
  const history = useMemo(() => Array.from({ length: n + 1 }, (_, k) => {
    const r = rated.slice(0, k);
    const pop = hitsOf(popular(world, r), loves);
    return { pop, taste: fallback && k < FALLBACK_UNTIL ? pop : hitsOf(tasteVector(world, models, r).top, loves), knn: hitsOf(similar(world, models, r), loves) };
  }), [world, models, rated, fallback, loves]);
  const now = history[n];

  const lastTitle = n ? world.films[rated[n - 1]].title : "";
  let caption: ReactNode, captionKey: string;
  if (n === 0) {
    caption = <>Mia just signed up and the app knows <b>nothing</b> about her. <b>Most popular</b> is the only list that works ({now.pop}/5 ✓, by luck). The taste-vector model shows its random first guess, and similar items has nothing to start from. Tap a film Mia enjoyed, or press <b>⭐ Mia rates one more</b>.</>;
    captionKey = "zero";
  } else if (n < FALLBACK_UNTIL && usingFallback) {
    caption = <>The <b>fallback</b> hides the shaky taste vector behind popular picks until Mia has rated {FALLBACK_UNTIL} films. Similar items is already at {now.knn}/5. This is a <b>hybrid</b>: safe now, personal soon. {FALLBACK_UNTIL - n} more rating{FALLBACK_UNTIL - n === 1 ? "" : "s"} to go.</>;
    captionKey = "fallback";
  } else if (n < FALLBACK_UNTIL) {
    caption = <>With {n} rating{n === 1 ? "" : "s"}, <b>similar items</b> already finds {now.knn}/5: it simply looks up films that fans of <i>{lastTitle}</i> also liked. The <b>taste vector</b> must fill in {K} numbers from {n}, so it's {now.taste <= 1 ? "still mostly its random first guess" : "hit-and-miss"} ({now.taste}/5). That's the <b>cold-start problem</b>.{fallback ? "" : " Try the popularity fallback."}</>;
    captionKey = `cold-${now.taste <= 1}`;
  } else {
    const order = lists.byGenre.map((v, g) => ({ v, g })).sort((a, b) => b.v - a.v);
    const onTarget = order.slice(0, 2).every((x) => LOVED_GENRES.includes(x.g));
    caption = <>{n} ratings: {now.taste >= 3 ? "now the taste vector has enough evidence" : "the taste vector is getting there"} ({now.taste}/5 ✓){onTarget ? <>, and its genre bars point at {LOVED_GENRES.map((g) => GENRES[g].emoji).join(" and ")}</> : null}. Most popular is stuck at {now.pop}/5 because it never looks at her ratings. {fallback ? "The fallback has stepped aside: the hybrid now trusts the personal model." : "This is where a hybrid hands over to the personal model."} Many apps ask newcomers to pick a few favourites at sign-up for exactly this reason.</>;
    captionKey = `warm-${fallback}-${now.taste >= 3}`;
  }

  const [ref, { width }] = useSize<HTMLDivElement>();
  const cols = width === 0 || width >= 470 ? 3 : 1;
  const tight = cols === 3 && width < 700;

  return (
    <DemoFrame
      controls={
        <div className="row wrap between" style={{ gap: 14, rowGap: 10, width: "100%", alignItems: "center" }}>
          <div className="row wrap" style={{ gap: 8, rowGap: 8, alignItems: "center" }}>
            <button className="btn sm primary" onClick={rateOne} disabled={n >= MAX_RATINGS}>⭐ Mia rates one more</button>
            <button className="btn sm ghost" onClick={() => { setRated([]); done(); }} disabled={n === 0}>↺ Start over</button>
            <Pips n={n} />
          </div>
          <div style={{ minWidth: 250 }}>
            <Toggle label={`Popularity fallback until ${FALLBACK_UNTIL} ratings`} checked={fallback} onChange={(v) => { setFallback(v); done(); }}
              help="A hybrid: show the popular list to people with very few ratings, then switch to the personal model." />
          </div>
        </div>
      }
      caption={caption}
      captionKey={captionKey}
    >
      <div className="inset col" style={{ padding: "12px 14px", gap: 10 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <span className="row" style={{ gap: 8 }}>
            <span aria-hidden style={{ fontSize: 18 }}>🧑‍🚀</span>
            <span><b>Mia, new today.</b> <span className="muted">Films she enjoyed: tap to tell the app (up to {MAX_RATINGS}).</span></span>
          </span>
          <span className="tiny faint row" style={{ gap: 6 }}>
            secretly loves {LOVED_GENRES.map((g) => GENRES[g].emoji).join(" ")} · <CheckDot size={14} /> = one she'd love
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))", gap: 8 }}>
          {grid.map((id) => {
            const k = rated.indexOf(id), on = k >= 0, locked = !on && n >= MAX_RATINGS;
            return (
              <motion.button key={id} onClick={() => toggle(id)} disabled={locked} whileHover={locked ? undefined : { y: -3 }} whileTap={locked ? undefined : { scale: 0.96 }} transition={spring.snappy}
                aria-pressed={on} title={on ? "Rated: tap to undo" : locked ? `Mia has rated ${MAX_RATINGS} already` : "Tell the app Mia liked this"}
                style={{ position: "relative", padding: 0, border: "none", background: "none", cursor: locked ? "not-allowed" : "pointer", textAlign: "left", opacity: locked ? 0.45 : 1, transition: "opacity .25s", borderRadius: 12,
                  outline: on ? `2.5px solid ${COL.taste}` : "none", outlineOffset: 2 }}>
                <Poster film={world.films[id]} compact foot={on ? <span style={{ color: ink(COL.taste), fontWeight: 700 }}>👍 rated</span> : undefined} />
                <AnimatePresence>
                  {on && (
                    <motion.span key="n" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring.pop}
                      style={{ position: "absolute", top: 4, left: 4, width: 18, height: 18, borderRadius: 9, background: COL.taste, color: "white", fontSize: 10.5, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,.25)" }}>{k + 1}</motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div ref={ref} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
        <Column icon="🔥" title="Most popular" sub="same list for everyone" color={COL.pop} list={lists.pop} loves={loves} world={world} hits={now.pop} tight={tight}
          badgeKey="static" badge={<span className="badge" style={{ fontSize: 10.5 }}>ignores her ratings</span>} />
        <Column icon="🧬" title="Taste vector" sub={`matrix factorisation · ${K} numbers`} color={COL.taste} list={tasteList} loves={loves} world={world} hits={now.taste} tight={tight}
          badgeKey={usingFallback ? `fb${n}` : n === 0 ? "guess" : "none"}
          badge={usingFallback ? <span className="badge warning" style={{ fontSize: 10.5 }}>🛟 popular fallback · {n}/{FALLBACK_UNTIL}</span> : n === 0 ? <span className="badge" style={{ fontSize: 10.5 }}>random first guess</span> : null}
          extra={<TasteBars values={lists.byGenre} dim={usingFallback} />} />
        <Column icon="🧲" title="Similar items" sub="“fans of this also liked…”" color={COL.knn} list={lists.knn} loves={loves} world={world} hits={now.knn} tight={tight}
          empty="Needs one film to start from" />
      </div>

      <Progress history={history} />
    </DemoFrame>
  );
}

/* ------------------------------------------------ pieces */

function Pips({ n }: { n: number }) {
  return (
    <span className="row tiny muted" style={{ gap: 4, marginLeft: 4 }} aria-label={`${n} of ${MAX_RATINGS} ratings`}>
      {Array.from({ length: MAX_RATINGS }, (_, i) => (
        <motion.span key={i} initial={false} animate={{ scale: i < n ? 1 : 0.8, backgroundColor: i < n ? COL.taste : "rgba(120,120,128,0.28)" }} transition={spring.pop}
          style={{ width: 9, height: 9, borderRadius: 5, display: "inline-block" }} />
      ))}
      <span className="num" style={{ marginLeft: 4, fontWeight: 600 }}>{n}/{MAX_RATINGS} ratings</span>
    </span>
  );
}

function Column({ icon, title, sub, color, list, loves, world, hits, badge, badgeKey, extra, empty, tight }: {
  icon: string; title: string; sub: string; color: string; list: number[]; loves: Set<number>; world: World; hits: number; tight?: boolean;
  badge?: ReactNode; badgeKey?: string; extra?: ReactNode; empty?: string;
}) {
  return (
    <div className="inset col" style={{ padding: tight ? "10px 8px" : "12px 12px", gap: 8, minWidth: 0, boxShadow: `0 3px 0 ${color} inset` }}>
      <div className="row" style={{ gap: 8, minWidth: 0 }}>
        <span aria-hidden style={{ fontSize: 18 }}>{icon}</span>
        <span className="col" style={{ gap: 0, minWidth: 0 }}>
          <b className="small">{title}</b>
          <span className="tiny faint truncate">{sub}</span>
        </span>
      </div>
      <div style={{ minHeight: 22, display: "flex", alignItems: "center" }}>
        <AnimatePresence mode="wait" initial={false}>
          {badge && <motion.span key={badgeKey ?? "badge"} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring.pop}>{badge}</motion.span>}
        </AnimatePresence>
      </div>
      <div className="col" style={{ gap: 5 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {list.length === 0
            ? Array.from({ length: TOP }, (_, i) => (
              <motion.div key={`ph${i}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="row" style={{ gap: 8, height: 34, padding: "0 8px", borderRadius: 9, border: "1.5px dashed var(--hairline)", color: "var(--text-3)", fontSize: 12 }}>
                <span className="num" style={{ width: 12, fontWeight: 700 }}>{i + 1}</span>
                <span>{i === 2 && empty ? empty : "?"}</span>
              </motion.div>
            ))
            : list.map((id, i) => <Row key={id} rank={i + 1} world={world} id={id} love={loves.has(id)} tight={tight} />)}
        </AnimatePresence>
      </div>
      {extra}
      <div style={{ marginTop: "auto", paddingTop: 2 }}>
        <MeterBar label={<span className="tiny muted" style={{ fontWeight: 600 }}>✓ hits@5</span>} value={hits} max={TOP} color={color} height={10} format={(v) => `${Math.round(v)}/5`} />
      </div>
    </div>
  );
}

function Row({ rank, world, id, love, tight }: { rank: number; world: World; id: number; love: boolean; tight?: boolean }) {
  const f = world.films[id], g = GENRES[f.g];
  return (
    <motion.div layout initial={{ opacity: 0, x: -10, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring.gentle}
      className="row" title={`${f.title} · ${g.name} · ♥ ${f.likes}`}
      style={{ gap: tight ? 6 : 8, height: 34, padding: tight ? "0 5px" : "0 8px 0 6px", borderRadius: 9, background: "var(--glass-strong)", border: `1px solid ${love ? `${C.ok}99` : "var(--hairline)"}`, minWidth: 0 }}>
      {!tight && <span className="num tiny faint" style={{ width: 10, fontWeight: 700, textAlign: "right" }}>{rank}</span>}
      <span aria-hidden style={{ width: 22, height: 22, borderRadius: 6, background: `linear-gradient(150deg, ${g.color}, ${g.color}88)`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{g.emoji}</span>
      <span className="truncate grow" style={{ fontSize: tight ? 11.5 : 12, fontWeight: 600, minWidth: 0 }}>{f.title}</span>
      {love && <CheckDot size={16} />}
    </motion.div>
  );
}

/** What the taste vector currently believes about Mia, averaged per genre. */
function TasteBars({ values, dim }: { values: number[]; dim: boolean }) {
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  return (
    <div className="col" style={{ gap: 3, opacity: dim ? 0.35 : 1, transition: "opacity .3s" }}>
      <span className="tiny faint">what it thinks Mia likes</span>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${GENRES.length}, 1fr)`, gap: 4, alignItems: "end", height: 30 }}>
        {values.map((v, g) => (
          <div key={g} title={GENRES[g].name} style={{ height: "100%", display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", height: "100%", transformOrigin: "50% 100%", transform: `scaleY(${0.08 + 0.92 * ((v - lo) / span)})`, background: GENRES[g].color, borderRadius: 3,
              transition: "transform .6s cubic-bezier(.34,1.28,.64,1)" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${GENRES.length}, 1fr)`, gap: 4, textAlign: "center", fontSize: 11 }}>
        {GENRES.map((g) => <span key={g.name} aria-hidden>{g.emoji}</span>)}
      </div>
    </div>
  );
}

/** hits@5 for each recommender as Mia rates more films. */
function Progress({ history }: { history: { pop: number; taste: number; knn: number }[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const H = 96, m = { l: 30, r: 12, t: 10, b: 20 };
  const sx = (k: number) => m.l + (k / MAX_RATINGS) * (width - m.l - m.r);
  const sy = (v: number) => m.t + (1 - v / TOP) * (H - m.t - m.b);
  const series: { key: "pop" | "taste" | "knn"; color: string; label: string }[] = [
    { key: "pop", color: COL.pop, label: "Most popular" },
    { key: "taste", color: COL.taste, label: "Taste vector" },
    { key: "knn", color: COL.knn, label: "Similar items" },
  ];
  return (
    <div className="inset col" style={{ padding: "10px 14px", gap: 4 }}>
      <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
        <b>📈 ✓ hits@5 as Mia rates more</b>
        <span className="row wrap tiny" style={{ gap: 12 }}>
          {series.map((s) => (
            <span key={s.key} className="row" style={{ gap: 5 }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color }} />
              <span className="muted">{s.label}</span>
            </span>
          ))}
        </span>
      </div>
      <div ref={ref} style={{ width: "100%", height: H }}>
        {width > 0 && (
          <svg width={width} height={H} style={{ display: "block", overflow: "visible" }}>
            {[0, 1, 2, 3, 4, 5].map((v) => (
              <g key={v}>
                <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" />
                {v === TOP && <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{v}</text>}
              </g>
            ))}
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <text key={k} x={k === MAX_RATINGS ? sx(k) + 4 : sx(k)} y={H - 5} textAnchor={k === MAX_RATINGS ? "end" : "middle"} fontSize={10} fontWeight={k === history.length - 1 ? 700 : 400} fill={k === history.length - 1 ? "var(--text)" : "var(--text-3)"}>{k === MAX_RATINGS ? `${k} ratings` : k}</text>
            ))}
            {series.map((s, si) => {
              const off = (si - 1) * 2.2; // nudge overlapping lines apart
              const d = history.map((h, k) => `${k ? "L" : "M"}${sx(k).toFixed(1)},${(sy(h[s.key]) + off).toFixed(1)}`).join("");
              return (
                <g key={s.key}>
                  {history.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />}
                  {history.map((h, k) => (
                    <motion.circle key={k} initial={{ r: 0 }} animate={{ r: k === history.length - 1 ? 4.5 : 3 }} transition={spring.pop}
                      cx={sx(k)} cy={sy(h[s.key]) + off} fill={s.color} stroke="var(--glass-strong)" strokeWidth={1.5} />
                  ))}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <span className="tiny faint">{N_FILMS} films in the catalogue · ✓ counts films in Mia's top 5 that she'd love (and hasn't rated yet).</span>
    </div>
  );
}
