import { useMemo } from "react";
import { colorAt, withAlpha } from "../../../../lib/colors";
import { useSize } from "../../../charts";
import { ARM_NAMES, betaPdf, type Counts } from "./sim";

/** Per-machine view: how often each machine was pulled, and what the player believes it pays vs the truth. */
export function MachineView({ counts, probs, revealed, animate }: { counts: Counts; probs: number[]; revealed: boolean; animate: boolean }) {
  const maxN = Math.max(1, ...counts.n);
  const ease = animate ? "width .25s var(--ease), left .25s var(--ease)" : "none";
  return (
    <div className="inset col" style={{ padding: 12, gap: 8, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "26px minmax(0, 1fr) minmax(0, 1.3fr)", gap: 10, alignItems: "center" }}>
        <span />
        <span className="tiny muted" style={{ fontWeight: 600 }}>Pulls</span>
        <span className="tiny muted" style={{ fontWeight: 600 }}>Estimated payout {revealed ? "vs true" : "(true hidden)"}</span>
        {counts.n.map((n, i) => {
          const color = colorAt(i);
          const est = n ? counts.s[i] / n : null;
          // 95% "how sure am I" whisker around the estimate
          const half = est === null ? 0 : Math.min(0.5, 1.96 * Math.sqrt(Math.max(est * (1 - est), 0.02) / n));
          return (
            <div key={i} style={{ display: "contents" }}>
              <span className="small" style={{ fontWeight: 700, color }}>{ARM_NAMES[i]}</span>
              <div className="row" style={{ gap: 6, minWidth: 0 }}>
                <div style={{ flex: 1, height: 14, borderRadius: 7, background: "var(--fill)", overflow: "hidden" }}>
                  <div style={{ width: `${(n / maxN) * 100}%`, height: "100%", borderRadius: 7, background: color, transition: ease }} />
                </div>
                <span className="tiny num" style={{ width: 30, textAlign: "right" }}>{n}</span>
              </div>
              <div style={{ position: "relative", height: 16 }} title={est === null ? "not pulled yet" : `estimate ${Math.round(est * 100)}%${revealed ? `, true ${Math.round(probs[i] * 100)}%` : ""}`}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 7, height: 2, borderRadius: 1, background: "var(--fill-2)" }} />
                {est !== null && (
                  <>
                    <div style={{ position: "absolute", top: 4, height: 8, borderRadius: 4, left: `${Math.max(0, est - half) * 100}%`, width: `${(Math.min(1, est + half) - Math.max(0, est - half)) * 100}%`, background: withAlpha(color, 0.25), transition: ease }} />
                    <div style={{ position: "absolute", top: 2, width: 12, height: 12, marginLeft: -6, borderRadius: 6, left: `${est * 100}%`, background: color, border: "2px solid var(--glass-strong)", transition: ease }} />
                  </>
                )}
                {revealed && (
                  <div style={{ position: "absolute", top: -1, height: 18, width: 3, marginLeft: -1.5, borderRadius: 1.5, left: `${probs[i] * 100}%`, background: "var(--text)" }} title={`true ${Math.round(probs[i] * 100)}%`} />
                )}
              </div>
            </div>
          );
        })}
        <span />
        <span />
        <div className="row between tiny faint num"><span>0%</span><span>50%</span><span>100%</span></div>
      </div>
      <div className="tiny faint">Dot = wins ÷ pulls; the shaded band shows how unsure that guess still is.{revealed ? " The tall tick = true payout." : ""}</div>
    </div>
  );
}

/** Thompson sampling's beliefs: one Beta(wins + 1, losses + 1) curve per machine. */
export function BetaCurves({ counts, probs, revealed }: { counts: Counts; probs: number[]; revealed: boolean }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 150, m = { l: 8, r: 8, t: 8, b: 20 };
  const K = 120;
  const curves = useMemo(() => counts.n.map((n, i) => {
    const a = 1 + counts.s[i], b = 1 + n - counts.s[i];
    return Array.from({ length: K + 1 }, (_, k) => betaPdf(Math.min(0.999, Math.max(0.001, k / K)), a, b));
  }), [counts.n.join(","), counts.s.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const peak = Math.max(1.2, ...curves.flat());
  const sx = (x: number) => m.l + x * (width - m.l - m.r);
  const sy = (v: number) => height - m.b - (v / peak) * (height - m.t - m.b);
  return (
    <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="tiny muted" style={{ fontWeight: 600 }}>Thompson's belief about each machine's payout</span>
        <span className="tiny faint">wide = unsure · narrow = confident</span>
      </div>
      <div ref={ref} style={{ width: "100%", height }}>
        {width > 0 && (
          <svg width={width} height={height} style={{ display: "block" }}>
            {[0, 0.25, 0.5, 0.75, 1].map((x) => (
              <g key={x}>
                <line x1={sx(x)} x2={sx(x)} y1={m.t} y2={height - m.b} stroke="var(--hairline)" strokeDasharray="2 4" />
                <text x={sx(x)} y={height - 5} textAnchor={x === 0 ? "start" : x === 1 ? "end" : "middle"} fontSize={10} fill="var(--text-3)">{Math.round(x * 100)}%</text>
              </g>
            ))}
            {curves.map((ys, i) => {
              const d = ys.map((v, k) => `${k ? "L" : "M"}${sx(k / K).toFixed(1)},${sy(v).toFixed(1)}`).join("");
              return (
                <g key={i}>
                  <path d={`${d}L${sx(1)},${sy(0)}L${sx(0)},${sy(0)}Z`} fill={colorAt(i)} fillOpacity={0.1} />
                  <path d={d} fill="none" stroke={colorAt(i)} strokeWidth={2} strokeLinejoin="round" />
                  {revealed && <line x1={sx(probs[i])} x2={sx(probs[i])} y1={m.t} y2={height - m.b} stroke={colorAt(i)} strokeWidth={1.5} strokeDasharray="4 3" />}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
