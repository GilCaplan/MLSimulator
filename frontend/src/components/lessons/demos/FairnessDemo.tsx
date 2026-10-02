import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Segmented, Slider } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, MeterBar, Stat, clamp, gauss, mean, rng, useDone } from "./shared";

type Mode = "all" | "gender" | "both";
interface Applicant { id: string; group: 0 | 1; repay: boolean; base: number; jitter: number }

const GROUPS = [
  { name: "Men", color: C.teal },
  { name: "Women", color: C.purple },
];
/** How far biased historical labels push women's scores down, depending on what the model may see. */
const SHIFT: Record<Mode, number> = { all: 0.12, gender: 0.085, both: 0.01 };

function makeApplicants(): Applicant[] {
  const r = rng(61);
  const out: Applicant[] = [];
  for (const g of [0, 1] as const) {
    for (let i = 0; i < 56; i++) {
      const repay = i < 34;
      const base = clamp((repay ? 0.62 : 0.38) + 0.11 * gauss(r), 0.03, 0.97);
      out.push({ id: `${g}-${i}`, group: g, repay, base, jitter: r() });
    }
  }
  return out;
}

export function FairnessDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const apps = useMemo(makeApplicants, []);
  const [mode, setMode] = useState<Mode>("all");
  const [thr, setThr] = useState(0.5);

  const score = (a: Applicant) => clamp(a.base - (a.group === 1 ? SHIFT[mode] : 0), 0.01, 0.99);
  const stats = useMemo(() => {
    const tpr = (g: number) => {
      const rep = apps.filter((a) => a.group === g && a.repay);
      return rep.filter((a) => score(a) >= thr).length / rep.length;
    };
    const acc = apps.filter((a) => (score(a) >= thr) === a.repay).length / apps.length;
    return { men: tpr(0), women: tpr(1), acc };
  }, [apps, mode, thr]);
  const gap = stats.men - stats.women;
  const pts = (v: number) => `${Math.round(v * 100)} pts`;

  const caption =
    mode === "all" ? <>The model learned from biased records, so women's scores sit lower. At this threshold, women who would repay are approved <b>{Math.round(stats.women * 100)}%</b> of the time versus <b>{Math.round(stats.men * 100)}%</b> for men.</>
      : mode === "gender" ? <>Gender is gone — but <code>shopping_profile</code> gives it away, so the scores barely move. The gap is still <b>{pts(gap)}</b>.</>
        : <>With gender <i>and</i> its proxy removed, deserving applicants in both groups are approved at nearly the same rate — a gap of just <b>{pts(Math.abs(gap))}</b>.</>;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 18, rowGap: 12, width: "100%", alignItems: "flex-end" }}>
          <Segmented value={mode} onChange={(m) => { setMode(m); done(); }} options={[
            { value: "all", label: "Use everything" },
            { value: "gender", label: "Remove gender only" },
            { value: "both", label: "Remove gender + proxy" },
          ]} />
          <div style={{ flex: "1 1 220px", maxWidth: 340 }}>
            <Slider label="Approval threshold" value={thr} min={0.2} max={0.8} step={0.01} onChange={(v) => { setThr(v); done(); }} format={(v) => v.toFixed(2)} />
          </div>
        </div>
      }
      stats={
        <>
          <Stat label="Gap between groups" value={Math.abs(gap)} format={(v) => `${Math.round(v * 100)} pts`} color={Math.abs(gap) > 0.08 ? "var(--danger)" : C.ok} emphasis sub="approval rate for people who'd repay" />
          <Stat label="Accuracy on true outcomes" value={stats.acc} sub="did we approve the people who repay?" />
        </>
      }
      caption={caption}
      captionKey={mode}
    >
      <div className="inset" style={{ padding: "12px 14px 8px" }}>
        <Lanes apps={apps} score={score} thr={thr} shift={SHIFT[mode]} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div className="inset" style={{ padding: 14 }}>
          <MeterBar label={<span>👨 Men who would repay · approved</span>} value={stats.men} color={GROUPS[0].color} />
        </div>
        <div className="inset" style={{ padding: 14 }}>
          <MeterBar label={<span>👩 Women who would repay · approved</span>} value={stats.women} color={GROUPS[1].color} />
        </div>
      </div>
    </DemoFrame>
  );
}

function Lanes({ apps, score, thr, shift }: { apps: Applicant[]; score: (a: Applicant) => number; thr: number; shift: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const labelW = width < 640 ? 74 : 96;
  const subH = 30, laneGap = 16, axisH = 30, laneTop = 22;
  const laneH = subH * 2 + 6;
  const height = laneTop + laneH * 2 + laneGap + axisH;
  const x0 = labelW, x1 = width - 10;
  const sx = (v: number) => x0 + v * (x1 - x0);
  const laneY = (g: number) => laneTop + g * (laneH + laneGap);
  const rowY = (g: number, repay: boolean) => laneY(g) + (repay ? 0 : subH + 6);
  const fairMean = mean(apps.filter((a) => a.group === 1 && a.repay).map((a) => a.base));

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          <style>{`.mlp-app{transition:transform .9s cubic-bezier(.32,.72,0,1), opacity .3s}`}</style>
          {/* approved region */}
          <motion.rect initial={false} animate={{ x: sx(thr), width: Math.max(0, x1 - sx(thr)) }} transition={spring.snappy}
            y={laneTop - 6} height={laneH * 2 + laneGap + 12} rx={8} fill={C.ok} fillOpacity={0.1} />
          <motion.g initial={false} animate={{ x: sx(thr) }} transition={spring.snappy}>
            <line y1={laneTop - 8} y2={laneTop + laneH * 2 + laneGap + 6} stroke={C.ok} strokeWidth={2} />
            <text x={6} y={laneTop - 10} fontSize={10.5} fontWeight={700} fill={C.ok}>approved →</text>
          </motion.g>
          {GROUPS.map((g, gi) => (
            <g key={g.name}>
              <text x={0} y={laneY(gi) + 12} fontSize={12.5} fontWeight={700} fill={g.color}>{g.name}</text>
              <text x={0} y={rowY(gi, true) + subH / 2 + 12} fontSize={10} fill="var(--text-3)">would repay</text>
              <text x={0} y={rowY(gi, false) + subH / 2 + 8} fontSize={10} fill="var(--text-3)">would default</text>
              <rect x={x0} y={rowY(gi, true)} width={x1 - x0} height={subH} rx={7} fill="var(--fill)" />
              <rect x={x0} y={rowY(gi, false)} width={x1 - x0} height={subH} rx={7} fill="var(--fill)" opacity={0.6} />
            </g>
          ))}
          {/* the bias arrow on women's "would repay" row */}
          <motion.g initial={false} animate={{ opacity: shift > 0.03 ? 1 : 0 }}>
            <line x1={sx(fairMean)} x2={sx(fairMean)} y1={rowY(1, true) - 4} y2={rowY(1, true) + subH + 4} stroke="var(--text-3)" strokeDasharray="3 3" />
            <motion.line initial={false} animate={{ x2: sx(fairMean - shift) + 5 }} transition={spring.gentle}
              x1={sx(fairMean)} y1={rowY(1, true) - 3} y2={rowY(1, true) - 3} stroke="var(--danger)" strokeWidth={2} markerEnd="url(#mlp-arrow)" />
            <text x={sx(fairMean) + 6} y={rowY(1, true) - 6} fontSize={10} fontWeight={600} fill="var(--danger)">biased labels push scores down</text>
          </motion.g>
          <defs>
            <marker id="mlp-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--danger)" />
            </marker>
          </defs>
          {apps.map((a) => {
            const s = score(a);
            const approved = s >= thr;
            const col = GROUPS[a.group].color;
            const y = rowY(a.group, a.repay) + 6 + a.jitter * (subH - 12);
            return (
              <g key={a.id} className="mlp-app" style={{ transform: `translate(${sx(s)}px, ${y}px)`, opacity: approved ? 1 : 0.45 }}>
                <circle r={5} fill={a.repay ? col : "none"} stroke={col} strokeWidth={a.repay ? 1 : 1.6} strokeOpacity={a.repay ? 0.4 : 1} />
              </g>
            );
          })}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <text key={t} x={sx(t)} y={height - axisH + 16} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"} fontSize={10} fill="var(--text-3)">{t.toFixed(2)}</text>
          ))}
          <text x={(x0 + x1) / 2} y={height - 2} textAnchor="middle" fontSize={11} fill="var(--text-2)">model score (higher = looks more likely to repay)</text>
        </svg>
      )}
    </div>
  );
}
