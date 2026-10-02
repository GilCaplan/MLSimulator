import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { RecItem, RecommendResponse, SavedModel } from "../../lib/types";
import { useSize } from "../charts";
import { Glass, InfoTip, Segmented, Select, Spinner } from "../glass";
import { FilmRow, GENRES, GenreBar, Poster, StarInput, Stars, genreColor, genreIcon, titleOf } from "../train/recsys/recKit";
import { useDebounced } from "./inputs";
import { SectionTitle, rise } from "./shared";

type Mode = "viewer" | "new";
type Rated = Record<string, { item: RecItem; stars: number }>;

/** Rate this many films before a personal model has enough to go on (matches the default cold-start threshold). */
const ENOUGH = 5;

/** Report an API error once (not on every keystroke). */
function useOnceError() {
  const last = useRef<string | null>(null);
  return {
    fail: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== last.current) toast.error(msg);
      last.current = msg;
    },
    ok: () => { last.current = null; },
  };
}

/** "Try it live" for recommenders: pick a known viewer, or become a new one and rate films to watch the list adapt. */
export function RecsysPlayground({ model }: { model: SavedModel }) {
  const [mode, setMode] = useState<Mode>("viewer");
  const [users, setUsers] = useState<string[]>([]);
  const [popular, setPopular] = useState<RecItem[]>([]);
  const [rated, setRated] = useState<Rated>({});

  useEffect(() => {
    api.libraryCatalog(model.id, "", 400)
      .then((c) => { setUsers(c.users ?? []); setPopular(c.items ?? []); })
      .catch((e) => toast.error(e));
  }, [model.id]);

  return (
    <motion.section variants={rise}>
      <SectionTitle
        id="try"
        icon="🍿"
        title="What should they watch next?"
        subtitle={mode === "viewer"
          ? "Pick a viewer the model learned from: see what they rated, and the 10 films it would put on their home screen."
          : "You're a brand-new viewer. Rate a few films you know and watch the recommendations rearrange themselves around your taste."}
        right={<Segmented<Mode> value={mode} onChange={setMode} options={[{ value: "viewer", label: "👤 Pick a viewer" }, { value: "new", label: `🆕 Be a new viewer${Object.keys(rated).length ? ` · ${Object.keys(rated).length}★` : ""}` }]} />}
      />
      <AnimatePresence mode="wait">
        <motion.div key={mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.gentle}>
          {mode === "viewer"
            ? <KnownViewer model={model} users={users} />
            : <NewViewer model={model} popular={popular} rated={rated} setRated={setRated} />}
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ pick a viewer */

function KnownViewer({ model, users }: { model: SavedModel; users: string[] }) {
  const exampleUsers = model.detail?.recsys?.examples?.map((e) => e.user) ?? [];
  const [user, setUser] = useState<string | null>(null);
  const [res, setRes] = useState<RecommendResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [dice, setDice] = useState(0);
  const [gridRef, { width }] = useSize<HTMLDivElement>();
  const wide = width > 860;
  const err = useOnceError();
  const seq = useRef(0);

  useEffect(() => {
    if (!user && users.length) setUser(exampleUsers.find((u) => users.includes(u)) ?? users[0]);
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const s = ++seq.current;
    setBusy(true);
    api.recommend(model.id, { user, k: 10 })
      .then((r) => { if (s === seq.current) { setRes(r); err.ok(); } })
      .catch(err.fail)
      .finally(() => s === seq.current && setBusy(false));
  }, [user, model.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const history = useMemo(() => [...(res?.history ?? [])].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)), [res]);
  const loved = history.filter((h) => (h.rating ?? 0) >= 4);
  const idx = user ? users.indexOf(user) : -1;
  const step = (d: number) => users.length && setUser(users[(Math.max(0, idx) + d + users.length) % users.length]);

  return (
    <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: wide ? "minmax(300px, 0.85fr) minmax(0, 1.5fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <Glass style={{ minWidth: 0 }}>
        <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
          <h3>👤 Viewer</h3>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm icon" aria-label="Previous viewer" onClick={() => step(-1)}>‹</button>
            {users.length ? <Select value={user ?? ""} onChange={setUser} options={users.map((u) => ({ value: u, label: u }))} /> : <Spinner size={14} />}
            <button className="btn sm icon" aria-label="Next viewer" onClick={() => step(1)}>›</button>
            <button className="btn sm primary" onClick={() => { if (users.length) setUser(users[Math.floor(Math.random() * users.length)]); setDice((d) => d + 1); }}>
              <motion.span key={dice} initial={{ rotate: -180, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={spring.pop} style={{ display: "inline-block" }}>🎲</motion.span>
            </button>
          </div>
        </div>
        {res && (
          <div className="col" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="badge">⭐ {res.n_rated} ratings</span>
              <span className="badge success">❤️ {loved.length} loved (4★+)</span>
            </div>
            <GenreBar items={loved.length ? loved : history} label="their taste — genres of the films they loved" />
            <span className="eyebrow" style={{ marginTop: 4 }}>What they rated</span>
            <div className="col scroll" style={{ gap: 2, maxHeight: 420, overflowY: "auto", margin: "0 -8px" }}>
              <AnimatePresence initial={false}>
                {history.map((h, i) => <FilmRow key={`${user}-${h.item}`} item={h} delay={Math.min(i, 12) * 0.02} right={<Stars value={h.rating ?? 0} size={11} />} />)}
              </AnimatePresence>
            </div>
          </div>
        )}
        {!res && <div className="col" style={{ gap: 8 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 46, borderRadius: 12 }} />)}</div>}
      </Glass>

      <Glass variant="strong" style={{ minWidth: 0, position: wide ? "sticky" : "relative", top: 58 }}>
        <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
          <h3 className="row" style={{ gap: 8 }}>🍿 Top 10 for {user ?? "…"} {busy && <Spinner size={14} color="var(--accent)" />}</h3>
          {res && <div style={{ width: 190 }}><GenreBar items={res.items} label="the list's mix" /></div>}
        </div>
        <RecGrid items={res?.items ?? []} k={user ?? ""} />
        {res && (
          <p className="tiny faint" style={{ marginTop: 12, lineHeight: 1.5 }}>
            {model.model_id === "popularity"
              ? "“Most popular” gives every viewer the same crowd favourites — only skipping films they've already rated. Try another viewer: the list barely changes."
              : res.items.some((r) => r.because)
                ? "Each pick comes with the loved film that pulled it in (🧲). Films they've already rated never appear — there's no point recommending what they've seen."
                : "Compare the list's genre mix with their taste above — a good recommender mirrors it, with a few surprises. Films they've already rated never appear."}
          </p>
        )}
      </Glass>
    </div>
  );
}

/* ------------------------------------------------------------------ be a new viewer */

function NewViewer({ model, popular, rated, setRated }: { model: SavedModel; popular: RecItem[]; rated: Rated; setRated: React.Dispatch<React.SetStateAction<Rated>> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RecItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [res, setRes] = useState<RecommendResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [gridRef, { width }] = useSize<HTMLDivElement>();
  const wide = width > 860;
  const searchErr = useOnceError();
  const recErr = useOnceError();
  const sSeq = useRef(0);
  const rSeq = useRef(0);
  const n = Object.keys(rated).length;

  const dq = useDebounced(q, 220);
  useEffect(() => {
    const s = ++sSeq.current;
    setSearching(true);
    api.libraryCatalog(model.id, dq.trim(), 40)
      .then((c) => { if (s === sSeq.current) { setResults(c.items ?? []); searchErr.ok(); } })
      .catch(searchErr.fail)
      .finally(() => s === sSeq.current && setSearching(false));
  }, [dq, model.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ratings = useMemo(() => Object.fromEntries(Object.entries(rated).map(([k, v]) => [k, v.stars])), [rated]);
  const dr = useDebounced(ratings, 200);
  useEffect(() => {
    const s = ++rSeq.current;
    setBusy(true);
    api.recommend(model.id, { ratings: dr, k: 10 })
      .then((r) => { if (s === rSeq.current) { setRes(r); recErr.ok(); } })
      .catch(recErr.fail)
      .finally(() => s === rSeq.current && setBusy(false));
  }, [dr, model.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = (item: RecItem, stars: number) => setRated((r) => {
    const next = { ...r };
    if (stars <= 0) delete next[item.item];
    else next[item.item] = { item, stars };
    return next;
  });

  /** One click: love the three most popular films of a genre. */
  const fan = (genre: string) => {
    const picks = popular.filter((p) => p.genre === genre && !rated[p.item]).slice(0, 3);
    if (!picks.length) return;
    setRated((r) => ({ ...r, ...Object.fromEntries(picks.map((p) => [p.item, { item: p, stars: 5 }])) }));
  };
  const genres = useMemo(() => Array.from(new Set(popular.map((p) => p.genre).filter((g): g is string => !!g))).sort((a, b) => (GENRES[a] ? 0 : 1) - (GENRES[b] ? 0 : 1) || a.localeCompare(b)), [popular]);
  const ratedList = Object.values(rated);

  return (
    <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: wide ? "minmax(320px, 0.9fr) minmax(0, 1.5fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <Glass style={{ minWidth: 0 }}>
        <div className="row between" style={{ marginBottom: 10, gap: 8 }}>
          <h3>⭐ Rate films you know</h3>
          {n > 0 && <button className="btn sm ghost" onClick={() => setRated({})}>↺ Start over</button>}
        </div>

        <ProgressToPersonal n={n} />

        <AnimatePresence initial={false}>
          {ratedList.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle} style={{ overflow: "hidden" }}>
              <div className="row wrap" style={{ gap: 6, padding: "10px 0 2px" }}>
                <AnimatePresence initial={false}>
                  {ratedList.map(({ item, stars }) => (
                    <motion.span key={item.item} layout initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={spring.pop}
                      className="badge" style={{ gap: 6, paddingRight: 4, background: `${genreColor(item.genre)}22`, border: `1px solid ${genreColor(item.genre)}66` }}>
                      {genreIcon(item.genre)} <span className="truncate" style={{ maxWidth: 130 }}>{titleOf(item)}</span>
                      <span style={{ color: "#FFB800", letterSpacing: -1 }}>{"★".repeat(stars)}</span>
                      <button aria-label={`Remove ${titleOf(item)}`} onClick={() => rate(item, 0)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-3)", fontSize: 13, padding: "0 2px" }}>✕</button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {n === 0 && genres.length > 0 && (
          <div className="col" style={{ gap: 6, marginTop: 12 }}>
            <span className="tiny faint">Quick start — love the 3 biggest films of a genre:</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {genres.slice(0, 8).map((g) => (
                <motion.button key={g} whileTap={{ scale: 0.92 }} whileHover={{ y: -2 }} className="btn sm" onClick={() => fan(g)} style={{ gap: 5 }}>
                  {genreIcon(g)} {g} fan
                </motion.button>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 8, margin: "14px 0 8px", position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", opacity: 0.6 }}>🔎</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search films by title or genre…" style={{ width: "100%", paddingLeft: 32 }} />
          {searching && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}><Spinner size={13} /></span>}
        </div>
        <span className="tiny faint">{q.trim() ? `${results?.length ?? 0} match${results?.length === 1 ? "" : "es"}` : "Most popular first — tap the stars to rate."}</span>
        <div className="col scroll" style={{ gap: 2, maxHeight: 460, overflowY: "auto", margin: "6px -8px 0" }}>
          {results === null && [0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 46, borderRadius: 12, margin: "0 8px 6px" }} />)}
          {results?.length === 0 && <p className="small muted" style={{ padding: "10px 8px" }}>No film matches “{q}”. Try a word like “storm” or a genre like “Comedy”.</p>}
          <AnimatePresence initial={false}>
            {results?.map((it, i) => (
              <FilmRow key={it.item} item={it} delay={Math.min(i, 10) * 0.015}
                right={<StarInput value={rated[it.item]?.stars ?? 0} onChange={(v) => rate(it, v)} size={17} />} />
            ))}
          </AnimatePresence>
        </div>
      </Glass>

      <Glass variant="strong" style={{ minWidth: 0, position: wide ? "sticky" : "relative", top: 58 }}>
        <div className="row between wrap" style={{ gap: 8, marginBottom: 10 }}>
          <h3 className="row" style={{ gap: 8 }}>🍿 Your top 10 {busy && <Spinner size={14} color="var(--accent)" />}</h3>
          <div className="row wrap" style={{ gap: 6 }}>
            <AnimatePresence>
              {res?.fallback_used && (
                <motion.span key="fb" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={spring.pop}>
                  <span className="badge warning" title="This model hands viewers with too few ratings the crowd favourites until it knows them better.">🛟 popularity fallback in use</span>
                </motion.span>
              )}
            </AnimatePresence>
            {res && res.items.length > 0 && <div style={{ width: 170 }}><GenreBar items={res.items} label="the list's mix" /></div>}
          </div>
        </div>
        <Encourage n={n} res={res} modelId={model.model_id} />
        <RecGrid items={res?.items ?? []} k="new" rated={rated} onRate={rate} />
        <p className="tiny faint" style={{ marginTop: 12, lineHeight: 1.5 }}>
          Seen one of these? Rate it right on the poster — it moves to your ratings and the list makes room for something new.
          {model.model_id === "item_knn" ? " Low stars matter too: they push similar films down. It compares each rating with your own average, so a 4★ from someone who gives everything 5★ reads as “less keen”." : ""}
          <InfoTip text="Behind the scenes, your ratings are sent to the model as a brand-new viewer. Item-kNN adds up the neighbours of the films you rated; matrix factorisation solves for your taste vector from your ratings; Most popular ignores them entirely." />
        </p>
      </Glass>
    </div>
  );
}

/** "n / 5 ratings" progress towards a personal list. */
function ProgressToPersonal({ n }: { n: number }) {
  const done = n >= ENOUGH;
  return (
    <div className="inset row" style={{ gap: 10, padding: "8px 12px" }}>
      <div className="row" style={{ gap: 4 }}>
        {Array.from({ length: ENOUGH }, (_, i) => (
          <motion.span key={i} animate={{ scale: i < n ? [1, 1.35, 1] : 1, backgroundColor: i < n ? "#FFB800" : "rgba(142,142,147,0.25)" }} transition={{ duration: 0.35 }}
            style={{ width: 14, height: 14, borderRadius: 7, display: "inline-block" }} />
        ))}
      </div>
      <span className="small" style={{ lineHeight: 1.4 }}>
        {done ? <><b style={{ color: "var(--success)" }}>Fully personal!</b> <span className="muted">Every extra rating sharpens it.</span></>
          : <><b>{n} of {ENOUGH} ratings</b> <span className="muted">— {n === 0 ? "the model knows nothing about you yet" : `${ENOUGH - n} more to really personalise`}</span></>}
      </span>
    </div>
  );
}

/** The encouraging line above the new viewer's list. */
function Encourage({ n, res, modelId }: { n: number; res: RecommendResponse | null; modelId: string }) {
  const text = modelId === "popularity"
    ? { icon: "🔥", body: <>This model gives <b>everyone</b> the same crowd favourites — your ratings only remove films you've already seen. Try a personal model to see the list follow your taste.</> }
    : n === 0
      ? { icon: "👋", body: <>You're a <b>brand-new viewer</b>, so the model has nothing to go on — here are the crowd favourites. Rate a film or two and watch the list change.</> }
      : res?.fallback_used
        ? { icon: "🛟", body: <>Still the safe crowd-pleasers: this model waits until it knows you a bit better. <b>Rate a few more to personalise</b> — the list switches over once you've rated enough.</> }
        : n < 3
          ? { icon: "🌱", body: <>Already adapting! With only {n} rating{n === 1 ? "" : "s"} it's an educated guess — <b>rate a few more to personalise</b>.</> }
          : n < ENOUGH
            ? { icon: "🎯", body: <>Getting to know you. {ENOUGH - n} more rating{ENOUGH - n === 1 ? "" : "s"} and it'll have a solid picture of your taste.</> }
            : { icon: "✨", body: <>This list is built around <b>your</b> {n} ratings. Rate something you disliked low and see what drops out.</> };
  return (
    <AnimatePresence mode="wait">
      <motion.div key={text.icon} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.2 }}
        className="inset row" style={{ gap: 10, padding: "9px 12px", marginBottom: 12, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>{text.icon}</span>
        <span className="small" style={{ lineHeight: 1.5 }}>{text.body}</span>
      </motion.div>
    </AnimatePresence>
  );
}

/** Ten posters that glide into their new places whenever the ranking changes. */
function RecGrid({ items, k, rated, onRate }: { items: RecItem[]; k: string; rated?: Rated; onRate?: (it: RecItem, v: number) => void }) {
  if (!items.length) return <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 12 }}>{Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton" style={{ height: 150, borderRadius: 12 }} />)}</div>;
  return (
    <motion.div layout className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(max(104px, calc((100% - 48px) / 5)), 1fr))", gap: 12, justifyItems: "center" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((it, i) => (
          <motion.div key={`${k}-${it.item}`} layout transition={spring.gentle} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
            <Poster item={it} rank={i + 1} because={it.because} width={104} delay={i * 0.03}
              footer={onRate ? <div className="row center"><StarInput value={rated?.[it.item]?.stars ?? 0} onChange={(v) => onRate(it, v)} size={14} /></div> : undefined} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
