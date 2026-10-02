import { AnimatePresence, animate, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Slider } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, clamp, gauss, pct, rng, useDone } from "./shared";

interface Email { id: string; subject: string; spam: boolean; p: number }

const SPAM_SUBJECTS = ["You WON a cruise!!", "Cheap meds, no prescription", "Your account is locked", "Hot singles nearby", "Claim your $500 gift card", "Crypto x100 guaranteed",
  "URGENT: wire transfer", "Lose 10 kg in a week", "Final notice: prize", "Re: your invoice (open now)", "Prince needs your help", "Unclaimed package fee",
  "Work from home $$$", "Verify your password", "Miracle hair growth", "You've been selected"];
const REAL_SUBJECTS = ["Invoice #4821 attached", "Lunch on Friday?", "Your flight itinerary", "Team meeting moved", "Mum: photos from the weekend", "Contract for review",
  "Password reset you asked for", "Receipt for your order", "Re: project timeline", "Interview invitation", "Dentist reminder", "Quarterly report draft",
  "Welcome to the team!", "Your bank statement", "Shipping confirmation", "Board meeting notes", "Re: quick question", "Parcel delivered",
  "Offer letter", "School newsletter", "Payment received", "Wedding RSVP", "Weekly analytics", "Support ticket update"];

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** 16 spam + 24 real emails, each with the spam filter's probability (spam skews high, real skews low, with overlap). */
function makeEmails(): Email[] {
  const r = rng(11);
  const out: Email[] = [];
  SPAM_SUBJECTS.forEach((s, i) => out.push({ id: `s${i}`, subject: s, spam: true, p: clamp(sigmoid(1.35 + 1.45 * gauss(r)), 0.03, 0.99) }));
  REAL_SUBJECTS.forEach((s, i) => out.push({ id: `r${i}`, subject: s, spam: false, p: clamp(sigmoid(-1.7 + 1.35 * gauss(r)), 0.01, 0.97) }));
  return out.map((e) => ({ ...e, p: Math.round(e.p * 100) / 100 }));
}

function confusion(emails: Email[], t: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const e of emails) {
    const flagged = e.p >= t;
    if (e.spam) flagged ? tp++ : fn++;
    else flagged ? fp++ : tn++;
  }
  return { tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : NaN, recall: tp / Math.max(1, tp + fn) };
}

const T_MIN = 0.01, T_MAX = 0.99;
const fmtT = (t: number) => t.toFixed(2);

export function ThresholdsDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const emails = useMemo(makeEmails, []);
  const [t, setT] = useState(0.5);
  const [costLost, setCostLost] = useState(10);
  const [costMissed, setCostMissed] = useState(1);
  const [searched, setSearched] = useState(false);
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  useEffect(() => () => anim.current?.stop(), []);

  const m = confusion(emails, t);
  const cost = m.fp * costLost + m.fn * costMissed;

  // Cheapest threshold: try a cut between every pair of neighbouring scores; on ties pick the middle of the cheapest stretch.
  const best = useMemo(() => {
    const ps = [...new Set(emails.map((e) => e.p))].sort((a, b) => a - b);
    const cands = [T_MIN, ...ps.slice(1).map((p, i) => Math.round(((p + ps[i]) / 2) * 1000) / 1000), T_MAX];
    const costs = cands.map((c) => { const k = confusion(emails, c); return k.fp * costLost + k.fn * costMissed; });
    const minCost = Math.min(...costs);
    const idx = costs.map((c, i) => (c === minCost ? i : -1)).filter((i) => i >= 0);
    const run: number[] = [idx[0]];
    for (let i = 1; i < idx.length && idx[i] === idx[i - 1] + 1; i++) run.push(idx[i]);
    return { t: cands[run[Math.floor(run.length / 2)]], cost: minCost };
  }, [emails, costLost, costMissed]);
  const atBest = cost === best.cost;

  const stopAnim = () => { anim.current?.stop(); anim.current = null; };
  const moveT = (v: number) => { stopAnim(); setT(clamp(v, T_MIN, T_MAX)); setSearched(false); done(); };
  const findCheapest = () => {
    stopAnim();
    setSearched(true);
    done();
    anim.current = animate(t, best.t, { duration: 1.1, ease: [0.32, 0.72, 0, 1], onUpdate: (v) => setT(v) });
  };

  const caption = searched && atBest
    ? <>With a lost email costing <b>${costLost}</b> and a missed spam <b>${costMissed}</b>, the cheapest threshold is <b>{fmtT(best.t)}</b> (total <b>${best.cost}</b>). {costLost > costMissed ? "Losing real mail is pricier, so the filter only flags emails it's very sure about." : costLost < costMissed ? "Missed spam is pricier here, so the filter flags more aggressively." : "Both mistakes cost the same, so the filter just minimises the total number of mistakes."} Change a price and search again.</>
    : t >= 0.75
      ? <>A strict filter: only emails it's very sure about go to spam. <b>{Number.isNaN(m.precision) ? "Nothing" : pct(m.precision)}</b> {Number.isNaN(m.precision) ? "is flagged at all" : "of the spam folder really is spam"}, but <b>{m.fn} spam{m.fn === 1 ? "" : "s"}</b> slip into your inbox. Higher threshold: precision up, recall down.</>
      : t <= 0.3
        ? <>A trigger-happy filter: it catches <b>{pct(m.recall)}</b> of the spam, but <b>{m.fp} real email{m.fp === 1 ? " is" : "s are"}</b> buried in the spam folder. Lower threshold: recall up, precision down.</>
        : <>At {fmtT(t)}, the filter catches <b>{pct(m.recall)}</b> of the spam (recall) and <b>{Number.isNaN(m.precision) ? "—" : pct(m.precision)}</b> of what it flags really is spam (precision). Slide right to lose fewer real emails, left to catch more spam.</>;
  const captionKey = searched && atBest ? `best-${best.t}` : t >= 0.75 ? "strict" : t <= 0.3 ? "loose" : "mid";

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 18, rowGap: 10, width: "100%", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 280px", maxWidth: 480 }}>
            <Slider label="Spam threshold" help="The filter gives every email a spam probability. Anything at or above this threshold goes to the Spam folder."
              value={t} min={T_MIN} max={T_MAX} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={moveT} />
          </div>
          <span className="small muted" style={{ paddingBottom: 6 }}>score ≥ <b className="num">{Math.round(t * 100)}%</b> → 🗑️ Spam folder</span>
        </div>
      }
      stats={
        <>
          <Stat label="Precision" value={Number.isNaN(m.precision) ? 0 : m.precision} format={(v) => (Number.isNaN(m.precision) ? "—" : pct(v))} color={C.indigo} sub="of the spam folder, really spam" />
          <Stat label="Recall" value={m.recall} color={C.teal} sub="of all spam, caught" />
          <Stat label="False alarms" value={m.fp} format={(v) => String(Math.round(v))} color={m.fp ? C.pos : undefined} sub="real emails lost in spam" emphasis={m.fp > 0 && costLost > costMissed} />
          <Stat label="Missed spam" value={m.fn} format={(v) => String(Math.round(v))} color={m.fn ? C.warn : undefined} sub="spam left in the inbox" />
        </>
      }
      caption={caption}
      captionKey={captionKey}
    >
      <div className="inset col" style={{ padding: "10px 12px 8px", gap: 4 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <b>Spam scores from the filter</b>
          <Legend items={[{ color: C.pos, label: "🎣 Actually spam", shape: "square" }, { color: C.neg, label: "✉️ Real email", shape: "square" }]} />
        </div>
        <ScoreStrip emails={emails} t={t} onSet={moveT} />
      </div>
      <Folders emails={emails} t={t} />
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, alignItems: "stretch" }}>
          <div className="inset col" style={{ padding: 12, gap: 10 }}>
            <b className="small">What do mistakes cost?</b>
            <Stepper label="✉️ A real email lost in spam" value={costLost} min={1} max={50} onChange={(v) => { setCostLost(v); setSearched(false); done(); }} color={C.pos} />
            <Stepper label="🎣 A spam left in the inbox" value={costMissed} min={1} max={50} onChange={(v) => { setCostMissed(v); setSearched(false); done(); }} color={C.warn} />
            <div className="row between" style={{ gap: 8, alignItems: "flex-end" }}>
              <div className="col" style={{ gap: 0 }}>
                <span className="tiny muted" style={{ fontWeight: 560 }}>Total cost now</span>
                <span className="num" style={{ fontSize: 22, fontWeight: 700, color: atBest ? C.ok : "var(--text)", transition: "color .3s" }}>${cost}</span>
                <span className="tiny faint">{m.fp} × ${costLost} + {m.fn} × ${costMissed}</span>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {atBest ? (
                  <motion.span key="ok" className="badge success" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={spring.pop}>✓ cheapest</motion.span>
                ) : (
                  <motion.span key="best" className="tiny faint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>best possible: ${best.cost}</motion.span>
                )}
              </AnimatePresence>
            </div>
            <button className="btn sm primary" onClick={findCheapest} disabled={atBest && Math.abs(t - best.t) < 0.005}>🔍 Find the cheapest threshold</button>
          </div>
          <div className="inset col" style={{ padding: 12, gap: 4 }}>
            <div className="row between small"><b>Precision vs recall</b><span className="tiny faint">every threshold</span></div>
            <PRCurve emails={emails} t={t} />
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}

/* ------------------------------------------------ score strip */

const BIN = 0.05, GW = 15, GH = 11;

function Glyph({ spam }: { spam: boolean }) {
  return (
    <g>
      <rect x={-GW / 2} y={-GH / 2} width={GW} height={GH} rx={2.2} fill={spam ? C.pos : C.neg} stroke="white" strokeWidth={0.8} />
      {spam
        ? <text x={0} y={3.4} textAnchor="middle" fontSize={9} fontWeight={800} fill="white">!</text>
        : <path d={`M${-GW / 2 + 1.5},${-GH / 2 + 1.5} L0,1 L${GW / 2 - 1.5},${-GH / 2 + 1.5}`} fill="none" stroke="white" strokeWidth={1.1} strokeLinejoin="round" />}
    </g>
  );
}

function ScoreStrip({ emails, t, onSet }: { emails: Email[]; t: number; onSet: (v: number) => void }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [dragging, setDragging] = useState(false);
  const height = 122, base = 96, m = { l: 12, r: 12 };
  const sx = (p: number) => m.l + p * (width - m.l - m.r);
  const fromX = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? Math.round(clamp((clientX - r.left - m.l) / (r.width - m.l - m.r), T_MIN, T_MAX) * 100) / 100 : t;
  };
  // Stack glyphs in bins of 0.05, spam on top of real mail inside each bin.
  const placed = useMemo(() => {
    const bins = new Map<number, Email[]>();
    for (const e of emails) { const b = Math.min(19, Math.floor(e.p / BIN)); bins.set(b, [...(bins.get(b) ?? []), e]); }
    const out: { e: Email; bx: number; level: number }[] = [];
    bins.forEach((es, b) => es.sort((a, c) => Number(a.spam) - Number(c.spam) || a.p - c.p).forEach((e, i) => out.push({ e, bx: (b + 0.5) * BIN, level: i })));
    return out;
  }, [emails]);
  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative", touchAction: "none", cursor: dragging ? "grabbing" : "ew-resize", userSelect: "none" }}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ } setDragging(true); onSet(fromX(e.clientX)); }}
      onPointerMove={(e) => dragging && onSet(fromX(e.clientX))}
      onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Spam scores of ${emails.length} emails; threshold at ${Math.round(t * 100)}%`}>
          <rect x={sx(0)} y={6} width={Math.max(0, sx(t) - sx(0))} height={base - 4} rx={6} fill={C.neg} fillOpacity={0.07} />
          <rect x={sx(t)} y={6} width={Math.max(0, sx(1) - sx(t))} height={base - 4} rx={6} fill={C.pos} fillOpacity={0.1} />
          <text x={sx(0) + 6} y={19} fontSize={10.5} fontWeight={650} fill={C.neg}>{sx(t) - sx(0) > 70 ? "📥 Inbox" : ""}</text>
          <text x={sx(1) - 6} y={19} textAnchor="end" fontSize={10.5} fontWeight={650} fill={C.pos}>{sx(1) - sx(t) > 90 ? "🗑️ Spam folder" : ""}</text>
          <line x1={sx(0)} x2={sx(1)} y1={base + 2} y2={base + 2} stroke="var(--hairline)" strokeWidth={1.5} />
          {[0, 0.25, 0.5, 0.75, 1].map((p) => <text key={p} x={sx(p)} y={base + 16} textAnchor={p === 0 ? "start" : p === 1 ? "end" : "middle"} fontSize={10} fill="var(--text-3)">{Math.round(p * 100)}%</text>)}
          <text x={(sx(0) + sx(1)) / 2} y={height - 2} textAnchor="middle" fontSize={10} fill="var(--text-2)">filter's spam probability</text>
          {placed.map(({ e, bx, level }) => (
            <g key={e.id} transform={`translate(${sx(bx)} ${base - 7 - level * (GH + 2)})`}>
              <title>{`${e.subject} — ${Math.round(e.p * 100)}% spam`}</title>
              <Glyph spam={e.spam} />
            </g>
          ))}
          <line x1={sx(t)} x2={sx(t)} y1={2} y2={base + 6} stroke="var(--text)" strokeWidth={2} strokeLinecap="round" />
          <circle cx={sx(t)} cy={base + 2} r={dragging ? 7 : 5.5} fill="var(--text)" stroke="var(--glass-strong)" strokeWidth={2} style={{ transition: "r .15s" }} />
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------ folders */

const CW = 46, CH = 28, GAP = 5, PAD = 10, HEAD = 30;

function Folders({ emails, t }: { emails: Email[]; t: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const colGap = 10;
  const fw = Math.max(0, (width - colGap) / 2);
  const perRow = Math.max(1, Math.floor((fw - 2 * PAD + GAP) / (CW + GAP)));
  const rows = Math.ceil(emails.length / perRow);
  const height = HEAD + PAD + Math.max(4, rows) * (CH + GAP);
  // Inbox: most suspicious first; Spam: least sure first — so a card crossing the threshold only hops between the two top-left corners.
  const inbox = emails.filter((e) => e.p < t).sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));
  const spam = emails.filter((e) => e.p >= t).sort((a, b) => a.p - b.p || a.id.localeCompare(b.id));
  const pos = new Map<string, { x: number; y: number }>();
  const lay = (list: Email[], x0: number) => list.forEach((e, i) => pos.set(e.id, { x: x0 + PAD + (i % perRow) * (CW + GAP), y: HEAD + Math.floor(i / perRow) * (CH + GAP) }));
  lay(inbox, 0);
  lay(spam, fw + colGap);
  const lost = spam.filter((e) => !e.spam).length, missed = inbox.filter((e) => e.spam).length;
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: width ? height : 200 }}>
      {width > 0 && (
        <>
          {[{ x: 0, title: "📥 Inbox", n: inbox.length, note: missed ? `⚠ ${missed} spam slipped in` : "no spam", c: C.neg, bad: missed > 0 },
            { x: fw + colGap, title: "🗑️ Spam folder", n: spam.length, note: lost ? `⚠ ${lost} real lost` : "no real mail", c: C.pos, bad: lost > 0 }].map((f) => (
            <div key={f.title} className="inset" style={{ position: "absolute", left: f.x, top: 0, width: fw, height, boxShadow: `0 0 0 1.5px ${f.c}33 inset` }}>
              <div className="row between small" style={{ padding: "7px 10px 0", gap: 6 }}>
                <b style={{ whiteSpace: "nowrap" }}>{f.title} <span className="num muted" style={{ fontWeight: 600 }}>{f.n}</span></b>
                <span className="tiny" style={{ color: f.bad ? C.warn : "var(--text-3)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.note}</span>
              </div>
            </div>
          ))}
          {emails.map((e) => {
            const p = pos.get(e.id)!;
            const inSpam = e.p >= t;
            const wrong = inSpam !== e.spam;
            const color = e.spam ? C.pos : C.neg;
            return (
              <motion.div key={e.id} initial={false} animate={{ x: p.x, y: p.y }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
                title={`${e.subject} — ${Math.round(e.p * 100)}% spam${wrong ? (e.spam ? " (missed spam)" : " (real email lost in spam!)") : ""}`}
                style={{ position: "absolute", left: 0, top: 0, width: CW, height: CH, borderRadius: 8, boxSizing: "border-box",
                  background: `${color}${wrong ? "30" : "1c"}`, border: `1.5px solid ${wrong ? color : `${color}55`}`,
                  boxShadow: wrong ? `0 0 0 2px ${color}33, 0 3px 10px ${color}44` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 2, fontSize: 10.5, fontWeight: 650, color: "var(--text)", transition: "background .3s, border-color .3s, box-shadow .3s" }}>
                <span aria-hidden style={{ fontSize: 11 }}>{e.spam ? "🎣" : "✉️"}</span>
                <span className="num">{Math.round(e.p * 100)}</span>
                {wrong && <span aria-label="mistake" style={{ position: "absolute", top: -6, right: -5, width: 14, height: 14, borderRadius: 7, background: C.warn, color: "white", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>}
              </motion.div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------ cost stepper */

function Stepper({ label, value, min, max, onChange, color }: { label: ReactNode; value: number; min: number; max: number; onChange: (v: number) => void; color: string }) {
  const btn = (d: number, text: string, aria: string) => (
    <button className="btn sm icon" aria-label={aria} disabled={d < 0 ? value <= min : value >= max} onClick={() => onChange(clamp(value + d, min, max))}
      style={{ width: 28, height: 28, padding: 0, fontSize: 15 }}>{text}</button>
  );
  return (
    <div className="row between" style={{ gap: 8 }}>
      <span className="small" style={{ fontWeight: 560, minWidth: 0 }}>{label}</span>
      <div className="row" style={{ gap: 6, flexShrink: 0 }}>
        {btn(-1, "−", `Lower: ${typeof label === "string" ? label : "cost"}`)}
        <span className="num" style={{ minWidth: 34, textAlign: "center", fontWeight: 700, color }} aria-live="polite">${value}</span>
        {btn(1, "+", `Raise: ${typeof label === "string" ? label : "cost"}`)}
      </div>
    </div>
  );
}

/* ------------------------------------------------ precision–recall curve */

function PRCurve({ emails, t }: { emails: Email[]; t: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 170, m = { l: 44, r: 10, t: 8, b: 30 };
  const pts = useMemo(() => {
    const ps = [...new Set(emails.map((e) => e.p))].sort((a, b) => b - a);
    return ps.map((p) => confusion(emails, p)).filter((k) => !Number.isNaN(k.precision));
  }, [emails]);
  const sx = (r: number) => m.l + r * (width - m.l - m.r);
  const sy = (p: number) => m.t + (1 - p) * (height - m.t - m.b);
  const d = pts.map((k, i) => `${i ? "L" : "M"}${sx(k.recall).toFixed(1)},${sy(k.precision).toFixed(1)}`).join("");
  const cur = confusion(emails, t);
  const curP = Number.isNaN(cur.precision) ? 1 : cur.precision;
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Precision–recall curve; current recall ${pct(cur.recall)}, precision ${Number.isNaN(cur.precision) ? "undefined" : pct(cur.precision)}`}>
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" />
              <text x={m.l - 5} y={sy(v) + 3} textAnchor="end" fontSize={9.5} fill="var(--text-3)">{v * 100}%</text>
              <text x={sx(v)} y={height - m.b + 13} textAnchor={v === 0 ? "start" : v === 1 ? "end" : "middle"} fontSize={9.5} fill="var(--text-3)">{v * 100}%</text>
            </g>
          ))}
          {pts.length > 0 && <path d={`${d}L${sx(pts[pts.length - 1].recall).toFixed(1)},${sy(0)}L${sx(pts[0].recall).toFixed(1)},${sy(0)}Z`} fill={C.indigo} fillOpacity={0.1} />}
          <path d={d} fill="none" stroke={C.indigo} strokeWidth={2.2} strokeLinejoin="round" />
          <text x={(m.l + width - m.r) / 2} y={height - 3} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">recall (spam caught) →</text>
          <text transform={`translate(10 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">precision ↑</text>
          <motion.circle initial={false} animate={{ cx: sx(cur.recall), cy: sy(curP) }} transition={spring.snappy} r={6.5} fill={C.indigo} stroke="white" strokeWidth={2} style={{ filter: `drop-shadow(0 2px 6px ${C.indigo}88)` }} />
        </svg>
      )}
    </div>
  );
}
