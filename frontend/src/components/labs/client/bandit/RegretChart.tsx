import { Caption, LinePlot, SectionTitle } from "../ui";
import { RUN_PULLS, STRATEGIES, STRATEGY_LABEL, type SimResult, type Strategy } from "./sim";

/** Fixed hue per strategy (independent of the machine colours). */
export const STRATEGY_COLOR: Record<Strategy, string> = { egreedy: "#FF9F0A", ucb: "#0A84FF", thompson: "#BF5AF2", random: "#8E8E93" };

/** Cumulative regret of every strategy on the current casino, averaged over many simulated runs. */
export function RegretChart({ sim, selected, onSelect, eps, c }: { sim: SimResult; selected: Strategy; onSelect: (s: Strategy) => void; eps: number; c: number }) {
  const finals = STRATEGIES.map((s) => sim.regret[s][RUN_PULLS - 1]);
  const winner = STRATEGIES[finals.indexOf(Math.min(...finals))];
  const label = (s: Strategy) => s === "egreedy" ? `ε-greedy (ε ${eps.toFixed(2)})` : s === "ucb" ? `UCB (c ${c.toFixed(2)})` : STRATEGY_LABEL[s];
  return (
    <>
      <SectionTitle right={<span className="small muted">average of 40 games × {RUN_PULLS} pulls on this casino</span>}>📉 Who wastes the fewest coins?</SectionTitle>
      <div className="inset" style={{ padding: "10px 10px 2px" }}>
        <LinePlot height={230} xMax={RUN_PULLS} xLabel="pull" yLabel="regret (coins lost)" series={
          // draw the selected strategy last so it sits on top
          [...STRATEGIES].sort((a, b) => Number(a === selected) - Number(b === selected)).map((s) => ({
            key: s, color: STRATEGY_COLOR[s], values: sim.regret[s], width: s === selected ? 3.2 : 1.8, opacity: s === selected ? 1 : 0.6,
          }))
        } />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
        {STRATEGIES.map((s, i) => (
          <button key={s} type="button" onClick={() => onSelect(s)} className="inset col"
            style={{ padding: "8px 12px", gap: 2, textAlign: "left", font: "inherit", color: "var(--text)", cursor: "pointer",
              boxShadow: s === selected ? `0 0 0 2px ${STRATEGY_COLOR[s]} inset` : "none" }}>
            <span className="row small" style={{ gap: 6, fontWeight: 650 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: STRATEGY_COLOR[s] }} />{label(s)}{s === winner && <span title="least regret">🏆</span>}
            </span>
            <span className="tiny muted num">regret {finals[i].toFixed(1)} · best machine {Math.round(sim.optimal[s] * 100)}% of pulls</span>
          </button>
        ))}
      </div>
      <Caption k={`${winner}`}>
        Too little exploring gets stuck on a so-so machine; too much wastes pulls on machines you already know are bad. <b>UCB</b> and <b>Thompson</b> balance the two —
        they explore while unsure and then commit. On this casino, <b>{label(winner)}</b> loses the fewest coins. Try ε = 0 or ε = 0.5 and watch the orange line bend.
      </Caption>
    </>
  );
}
