import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../design/motion";
import { PALETTE } from "../../lib/colors";
import { useUI } from "../../lib/store";
import type { ColumnSummary, PipelineSpec, SplitInfo } from "../../lib/types";
import { Select, Toggle } from "../glass";
import { ChoiceGrid, Note } from "./StageCard";
import { fmtInt, patchPipeline, type PrepCtx } from "./state";

export type SplitMethod = NonNullable<PipelineSpec["split"]["method"]>;
const TRAIN = "#0A84FF", TEST = "#FF9F0A";

/* ------------------------------------------------------------------ looping "tick" shared by the illustrations */

function useLoop(active: boolean, ms = 1800) {
  const reduce = useUI((s) => s.reduceMotion);
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!active || reduce) { setOn(true); return; }
    setOn(false);
    const t = setInterval(() => setOn((v) => !v), ms);
    const first = setTimeout(() => setOn(true), 350);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [active, reduce, ms]);
  return on;
}

/* ------------------------------------------------------------------ patient dots: random vs group */

const PATIENTS = 5, VISITS = 3;
const W = 220, H = 100, MID = W / 2;
// a fixed "random" assignment that leaks: patients 0, 2 and 3 end up on both sides
const RANDOM_SIDE = [[0, 1, 0], [0, 0, 0], [1, 0, 0], [0, 1, 1], [1, 1, 1]];
const GROUP_SIDE = [0, 0, 1, 0, 1];

function pack(side: number, k: number) {
  const col = k % 4, row = Math.floor(k / 4);
  const x0 = side === 0 ? 18 : MID + 18;
  return { x: x0 + col * 21, y: 34 + row * 18 };
}

/** Coloured dots = visits; one colour per patient. Random split scatters a patient's visits on both sides; group split moves whole colours. */
function PatientDots({ method, active }: { method: "random" | "group"; active: boolean }) {
  const split = useLoop(active);
  const counters = [0, 0];
  const dots: { key: string; color: string; x: number; y: number; leak: boolean }[] = [];
  for (let p = 0; p < PATIENTS; p++) {
    const sides = method === "random" ? RANDOM_SIDE[p] : Array(VISITS).fill(GROUP_SIDE[p]);
    const leak = method === "random" && new Set(sides).size > 1;
    for (let v = 0; v < VISITS; v++) {
      const side = sides[v];
      const pos = split ? pack(side, counters[side]++) : { x: MID - 42 + v * 16 + (p % 2) * 6, y: 22 + p * 14 };
      dots.push({ key: `${p}-${v}`, color: PALETTE[p], x: pos.x, y: pos.y, leak });
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxHeight: 100 }}>
      <motion.g initial={false} animate={{ opacity: split ? 1 : 0.25 }}>
        <rect x={6} y={18} width={MID - 12} height={H - 34} rx={10} fill={TRAIN} fillOpacity={0.09} stroke={TRAIN} strokeOpacity={0.35} />
        <rect x={MID + 6} y={18} width={MID - 12} height={H - 34} rx={10} fill={TEST} fillOpacity={0.09} stroke={TEST} strokeOpacity={0.35} />
        <text x={14} y={13} fontSize={10} fontWeight={700} fill={TRAIN}>train</text>
        <text x={MID + 14} y={13} fontSize={10} fontWeight={700} fill={TEST}>test</text>
      </motion.g>
      {dots.map((d) => (
        <motion.circle key={d.key} r={6} fill={d.color} stroke="var(--bg)" strokeWidth={1.2}
          initial={false} animate={{ cx: d.x, cy: d.y }} transition={spring.gentle} />
      ))}
      {method === "random" && (
        <motion.text x={MID} y={H - 2} fontSize={9.5} textAnchor="middle" fill="var(--danger)" fontWeight={650}
          initial={false} animate={{ opacity: split ? 1 : 0 }}>same patients on both sides!</motion.text>
      )}
      {method === "group" && (
        <motion.text x={MID} y={H - 2} fontSize={9.5} textAnchor="middle" fill="var(--success)" fontWeight={650}
          initial={false} animate={{ opacity: split ? 1 : 0 }}>every colour on one side ✓</motion.text>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ timeline with a cut */

function TimelineCut({ active }: { active: boolean }) {
  const split = useLoop(active, 2000);
  const N = 14, L = 12, R = W - 12, cut = L + (R - L) * 0.72;
  const xs = Array.from({ length: N }, (_, i) => L + 6 + (i / (N - 1)) * (R - L - 12));
  const ys = xs.map((_, i) => 46 - Math.sin(i * 0.9) * 10 - i * 0.8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxHeight: 100 }}>
      <line x1={L} x2={R} y1={70} y2={70} stroke="var(--hairline)" strokeWidth={2} strokeLinecap="round" />
      <text x={L} y={86} fontSize={9.5} fill="var(--text-3)">past</text>
      <text x={R} y={86} fontSize={9.5} fill="var(--text-3)" textAnchor="end">future →</text>
      {xs.map((x, i) => {
        const future = x > cut;
        return (
          <motion.circle key={i} cx={x} r={5} stroke="var(--bg)" strokeWidth={1}
            initial={false}
            animate={{ cy: ys[i], fill: split ? (future ? TEST : TRAIN) : "var(--text-3)", x: split && future ? 6 : 0 }}
            transition={{ ...spring.gentle, delay: split ? i * 0.03 : 0 }} />
        );
      })}
      <motion.line x1={cut + 3} x2={cut + 3} y1={14} y2={76} stroke="var(--danger)" strokeWidth={2} strokeDasharray="4 3"
        initial={false} animate={{ pathLength: split ? 1 : 0, opacity: split ? 1 : 0 }} transition={{ duration: 0.4 }} />
      <motion.text x={cut - 4} y={12} fontSize={10} fontWeight={700} fill={TRAIN} textAnchor="end" initial={false} animate={{ opacity: split ? 1 : 0 }}>train</motion.text>
      <motion.text x={cut + 12} y={12} fontSize={10} fontWeight={700} fill={TEST} initial={false} animate={{ opacity: split ? 1 : 0 }}>test</motion.text>
    </svg>
  );
}

/* ------------------------------------------------------------------ the picker */

/** Candidates for the "who is who" column: repeating ID-like columns first, then categorical, then IDs. */
export function groupCandidates(cols: ColumnSummary[]) {
  const score = (c: ColumnSummary) => (c.repeats && c.repeats > 1 ? 0 : c.role === "categorical" ? 1 : c.role === "id" ? 2 : c.role === "numeric" && c.is_integer ? 3 : 9);
  return cols.filter((c) => score(c) < 9 && c.unique >= 2).sort((a, b) => score(a) - score(b) || (b.repeats ?? 0) - (a.repeats ?? 0));
}
export function timeCandidates(cols: ColumnSummary[]) {
  return cols.filter((c) => c.role === "datetime" || c.role === "numeric").sort((a, b) => Number(b.role === "datetime") - Number(a.role === "datetime"));
}

export function SplitMethodPicker({ ctx }: { ctx: PrepCtx }) {
  const sp = ctx.spec.split;
  const method: SplitMethod = sp.method ?? "random";
  const groups = groupCandidates(ctx.columns);
  const times = timeCandidates(ctx.columns);
  const choose = (m: SplitMethod) => {
    const patch: Partial<PipelineSpec["split"]> = { method: m };
    if (m === "group" && !sp.group_column && groups[0]) patch.group_column = groups[0].name;
    if (m === "time" && !sp.time_column && times[0]) patch.time_column = times[0].name;
    patchPipeline("split", patch);
  };
  return (
    <ChoiceGrid<SplitMethod>
      value={method}
      min={210}
      onChange={choose}
      options={[
        {
          value: "random", icon: "🎲", label: "Random rows", tag: "default",
          blurb: <span style={{ display: "flex", flexDirection: "column", gap: 6 }}><PatientDots method="random" active={method === "random"} />Shuffle the rows and deal them out. Perfect when every row is a separate thing.</span>,
        },
        {
          value: "group", icon: "👥", label: "Keep groups together",
          blurb: <span style={{ display: "flex", flexDirection: "column", gap: 6 }}><PatientDots method="group" active={method === "group"} />Every visit of a patient stays on one side — otherwise the test is full of patients the model already met.</span>,
        },
        {
          value: "time", icon: "🕒", label: "Train on the past, test on the future",
          blurb: <span style={{ display: "flex", flexDirection: "column", gap: 6 }}><TimelineCut active={method === "time"} />The honest way for anything that changes over time — prices, demand, behaviour.</span>,
        },
      ]}
    />
  );
}

/** Method-specific settings: which column identifies a group / holds the time, plus a leak check for random splits. */
export function SplitMethodSettings({ ctx }: { ctx: PrepCtx }) {
  const sp = ctx.spec.split;
  const method: SplitMethod = sp.method ?? "random";
  const groups = groupCandidates(ctx.columns);
  const times = timeCandidates(ctx.columns);
  const repeating = groups.find((c) => c.repeats && c.repeats > 1.2);
  const opt = (c: ColumnSummary, kind: "group" | "time") => ({
    value: c.name,
    label: kind === "group"
      ? `${c.name} · ${fmtInt(c.unique)} groups${c.repeats ? ` · ~${c.repeats.toFixed(1)} rows each` : ""}`
      : `${c.role === "datetime" ? "📅" : "🔢"} ${c.name}`,
  });
  const gcol = ctx.columns.find((c) => c.name === sp.group_column);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={method} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="col" style={{ gap: 10 }}>
        {method === "group" && (groups.length ? (
          <>
            <div className="row wrap" style={{ gap: 10 }}>
              <span className="small" style={{ fontWeight: 560 }}>Which column says who's who?</span>
              <Select value={sp.group_column ?? ""} onChange={(v) => patchPipeline("split", { group_column: v })} style={{ minWidth: 260 }}
                options={[...(sp.group_column ? [] : [{ value: "", label: "Choose…" }]), ...groups.map((c) => opt(c, "group"))]} />
            </div>
            {gcol && (
              <span className="small muted">
                {fmtInt(gcol.unique)} groups{gcol.repeats ? <>, about <b className="num" style={{ color: "var(--text)" }}>{gcol.repeats.toFixed(1)}</b> rows each</> : null}.
                {" "}This column is used only for splitting — the models never see it.
                {gcol.unique < 10 && <span style={{ color: "var(--warning)" }}> Very few groups: the splits may be lopsided.</span>}
              </span>
            )}
          </>
        ) : (
          <Note icon="🤷" tone="warn">No column looks like a group identifier (something like a patient or customer ID that repeats).</Note>
        ))}

        {method === "time" && (times.length ? (
          <>
            <div className="row wrap" style={{ gap: 10 }}>
              <span className="small" style={{ fontWeight: 560 }}>Which column holds the time?</span>
              <Select value={sp.time_column ?? ""} onChange={(v) => patchPipeline("split", { time_column: v })} style={{ minWidth: 220 }}
                options={[...(sp.time_column ? [] : [{ value: "", label: "Choose…" }]), ...times.map((c) => opt(c, "time"))]} />
            </div>
            <span className="small muted">Oldest rows train the model, the next slice validates it and the most recent rows are the test — just like using it next month.</span>
          </>
        ) : (
          <Note icon="🤷" tone="warn">There's no date or number column to order the rows by.</Note>
        ))}

        {method === "random" && repeating && (
          <div className="col" style={{ gap: 8, padding: "10px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--warning) 10%, transparent)" }}>
            <span className="small" style={{ lineHeight: 1.5 }}>
              🔁 <b>“{repeating.name}”</b> repeats (~{repeating.repeats!.toFixed(1)} rows per value). If those rows are the same person or thing, a random split
              lets the model peek at the test set.
            </span>
            <div className="row wrap" style={{ gap: 10 }}>
              <Toggle
                label={<span className="small">Check “{repeating.name}” for leaks on the next run</span>}
                checked={sp.group_column === repeating.name}
                onChange={(v) => patchPipeline("split", { group_column: v ? repeating.name : null })}
              />
              <button className="btn sm" onClick={() => patchPipeline("split", { method: "group", group_column: repeating.name })}>👥 Keep groups together</button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ after a run */

const shortTime = (s: string) => s.replace(/ 00:00:00$/, "").replace(/:00$/, "").replace(/\.0+$/, "");

/** What the last run did: groups per split, time windows, and a red flag when a random split leaked groups. */
export function SplitInfoView({ info, compact }: { info: SplitInfo; compact?: boolean }) {
  const leak = info.method === "random" && (info.shared_groups ?? 0) > 0;
  const parts: [string, string, keyof NonNullable<SplitInfo["groups"]>][] = [["Train", TRAIN, "train"], ["Validation", "#BF5AF2", "val"], ["Test", TEST, "test"]];
  return (
    <div className="col" style={{ gap: 10 }}>
      {info.groups && (
        <div className="row wrap" style={{ gap: 8 }}>
          {parts.map(([label, color, k]) => (
            <motion.span key={k} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring.pop} className="inset row" style={{ padding: "6px 10px", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
              <b className="num">{fmtInt(info.groups![k])}</b>
              <span className="tiny muted">{label.toLowerCase()} groups</span>
            </motion.span>
          ))}
          {info.method === "group" && <span className="badge success" style={{ alignSelf: "center" }}>✓ no {info.group_column ?? "group"} on two sides</span>}
        </div>
      )}
      {info.method === "time" && (info.train_range || info.test_range) && (
        <div className="col" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 3, height: compact ? 8 : 10 }}>
            {[TRAIN, "#BF5AF2", TEST].map((c, i) => {
              const r = [info.train_range, info.val_range, info.test_range][i];
              if (!r) return null;
              return <motion.span key={i} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...spring.gentle, delay: i * 0.12 }}
                style={{ flex: i === 0 ? 7 : i === 1 ? 1 : 2, height: "100%", borderRadius: 5, background: c, transformOrigin: "left" }} />;
            })}
          </div>
          <div className="row wrap" style={{ gap: 14 }}>
            {(["Train", "Validation", "Test"] as const).map((label, i) => {
              const r = [info.train_range, info.val_range, info.test_range][i];
              return r ? (
                <span key={label} className="tiny muted num">
                  <b style={{ color: [TRAIN, "#BF5AF2", TEST][i] }}>{label}</b> {shortTime(r[0])} → {shortTime(r[1])}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}
      {leak && (
        <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -4, 4, 0] }} transition={{ duration: 0.4 }}
          className="row small" style={{ gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--danger) 12%, transparent)", lineHeight: 1.5 }}>
          <span>🚨</span>
          <span className="grow">
            <b style={{ color: "var(--danger)" }}>{fmtInt(info.shared_groups!)} {info.group_column ?? "group"} value{info.shared_groups === 1 ? "" : "s"} appear in both train and test.</b>{" "}
            <span className="muted">The test score will look better than reality, because the model has already met these groups.</span>
          </span>
          {!compact && <button className="btn sm" onClick={() => patchPipeline("split", { method: "group", group_column: info.group_column ?? null })}>Fix: keep groups together</button>}
        </motion.div>
      )}
      {info.method === "random" && info.group_column && !leak && (
        <span className="small" style={{ color: "var(--success)" }}>✓ No “{info.group_column}” value appears in both train and test.</span>
      )}
    </div>
  );
}
