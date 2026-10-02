import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { Glass, Segmented, Slider, Toggle } from "../../../glass";
import { colorAt } from "../../../../lib/colors";
import { rng, type Rand } from "../rand";
import { Caption, LinePlot, SectionTitle, Tile, useFrameLoop, useFullMotion } from "../ui";
import { MachineCard } from "./MachineCard";
import { BetaCurves, MachineView } from "./MachineView";
import { RegretChart } from "./RegretChart";
import {
  ARM_NAMES, N_ARMS, RUN_PULLS, STRATEGY_LABEL, choose, emptyCounts, estimates, makeCasino, simulateAll,
  type Counts, type Strategy,
} from "./sim";

type Speed = "slow" | "fast" | "turbo" | "instant";
const RATE: Record<Speed, number> = { slow: 4, fast: 30, turbo: 120, instant: Infinity };

/** Everything a session has seen so far (mutable; the component re-renders via `bump`). */
interface Session {
  counts: Counts;
  reward: number;
  regret: number;
  optimal: number;
  /** cumulative coins after each pull */
  history: number[];
  lastArm: number | null;
  armLast: (boolean | null)[];
  armPullId: number[];
  youPulls: number;
  agentPulls: number;
  outcomes: Rand;
  choices: Rand;
}

const newSession = (seed: number, epoch: number): Session => ({
  counts: emptyCounts(), reward: 0, regret: 0, optimal: 0, history: [], lastArm: null,
  armLast: Array(N_ARMS).fill(null), armPullId: Array(N_ARMS).fill(0), youPulls: 0, agentPulls: 0,
  outcomes: rng(seed * 4099 + epoch * 7 + 1), choices: rng(seed * 6151 + epoch * 13 + 5),
});

const pctFmt = (v: number) => `${Math.round(v)}%`;
const coinFmt = (v: number) => `${Math.round(v)}`;
const regretFmt = (v: number) => v.toFixed(1);

export function BanditLab() {
  const full = useFullMotion();
  const [seed, setSeed] = useState(1);
  const probs = useMemo(() => makeCasino(seed), [seed]);
  const pmax = Math.max(...probs), best = probs.indexOf(pmax);

  const epoch = useRef(0);
  const session = useRef<Session>(newSession(seed, 0));
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const [strategy, setStrategy] = useState<Strategy>("egreedy");
  const [eps, setEps] = useState(0.1);
  const [c, setC] = useState(0.5);
  const [speed, setSpeed] = useState<Speed>("fast");
  const [reveal, setReveal] = useState(false);
  const [run, setRun] = useState<{ target: number; paused: boolean } | null>(null);
  const acc = useRef(0);

  const S = session.current;
  const running = !!run && !run.paused;

  const pull = useCallback((arm: number, by: "you" | "agent") => {
    const s = session.current;
    const win = s.outcomes() < probs[arm];
    s.counts.n[arm]++;
    if (win) { s.counts.s[arm]++; s.reward++; }
    s.regret += pmax - probs[arm];
    if (arm === best) s.optimal++;
    s.history.push(s.reward);
    s.lastArm = arm;
    s.armLast[arm] = win;
    s.armPullId[arm]++;
    if (by === "you") s.youPulls++; else s.agentPulls++;
  }, [probs, pmax, best]);

  const reset = (nextSeed = seed) => {
    epoch.current++;
    session.current = newSession(nextSeed, epoch.current);
    acc.current = 0;
    setRun(null);
    bump();
  };

  const agentStep = () => pull(choose(strategy, session.current.counts, { eps, c }, session.current.choices), "agent");

  useFrameLoop(running, (dt) => {
    if (!run) return;
    const s = session.current;
    const left = run.target - s.history.length;
    let k = RATE[speed] === Infinity ? left : 0;
    if (k === 0) {
      acc.current += dt * RATE[speed];
      k = Math.min(left, Math.floor(acc.current));
      acc.current -= k;
    }
    for (let i = 0; i < k; i++) agentStep();
    if (s.history.length >= run.target) setRun(null);
    if (k > 0) bump();
  });

  const startRun = () => {
    acc.current = 1; // first pull right away
    setRun({ target: session.current.history.length + RUN_PULLS, paused: false });
  };

  /* ---------- instant comparison of every strategy on this casino */
  const sim = useMemo(() => simulateAll(probs, { eps, c }, seed), [probs, eps, c, seed]);

  /* ---------- derived numbers */
  const pulls = S.history.length;
  const bestPossible = pulls * pmax;
  const optimalPct = pulls ? (S.optimal / pulls) * 100 : 0;
  const animateCards = full && (speed === "slow" || !running);
  const progress = run ? 1 - (run.target - pulls) / RUN_PULLS : 0;
  const ests = estimates(S.counts);
  const favourite = pulls ? S.counts.n.indexOf(Math.max(...S.counts.n)) : -1;
  const who = S.agentPulls === 0 ? "you" : S.youPulls === 0 ? "agent" : "both";

  const worldCaption = pulls === 0
    ? { k: "start", text: <>Click a machine to pull its lever. Each one pays <b>1 coin</b> with its own hidden chance — can you find the best one before you waste too many pulls?</> }
    : pulls < 15
      ? { k: "early", text: <>After {pulls} pull{pulls === 1 ? "" : "s"} every estimate is still a guess — one lucky coin can make a bad machine look great. Keep sampling, or hand over to a strategy below.</> }
      : !reveal
        ? { k: "fav", text: <>Most pulls went to machine <b>{ARM_NAMES[favourite]}</b> — the current favourite. But is it really the best, or just lucky early on? Regret counts the coins lost compared to always playing the true best machine: <b>{S.regret.toFixed(1)}</b> so far. Flip <b>Reveal</b> to check.</> }
        : favourite === best
          ? { k: "best", text: <>Most pulls went to machine <b>{ARM_NAMES[best]}</b> — the real winner at {Math.round(pmax * 100)}%. Every pull elsewhere still cost something: regret <b>{S.regret.toFixed(1)}</b> coins.</> }
          : { k: "notbest", text: <>Most pulls went to machine <b>{ARM_NAMES[favourite]}</b>, but the best is <b>{ARM_NAMES[best]}</b> ({Math.round(pmax * 100)}% vs {Math.round(probs[favourite] * 100)}%). Stuck on a so-so machine — every pull there adds to the regret ({S.regret.toFixed(1)} so far).</> };

  const strategyCaption = (() => {
    if (strategy === "egreedy" && eps === 0) return { k: "greedy", text: <>ε = 0 is pure greed: it always pulls the machine that <i>looks</i> best so far. One early lucky streak and it's stuck on a so-so machine forever — it never checks the others again.</> };
    if (strategy === "egreedy" && eps >= 0.3) return { k: "eps-hi", text: <>With ε = {eps.toFixed(2)}, {Math.round(eps * 100)}% of all pulls are random. It finds the winner quickly — then keeps wasting about {Math.round(eps * 80)}% of its pulls on worse machines, forever.</> };
    if (strategy === "egreedy") return { k: "eps", text: <>ε-greedy plays the best-looking machine, but {Math.round(eps * 100)}% of the time it pulls a random one, just to double-check. Simple — but it keeps exploring at the same rate even when it's already sure.</> };
    if (strategy === "ucb" && c < 0.1) return { k: "ucb0", text: <>With c ≈ 0, UCB has no curiosity bonus left — it's basically greedy and can get stuck just like ε = 0.</> };
    if (strategy === "ucb") return { k: "ucb", text: <>UCB adds an "I'm not sure yet" bonus to machines with few pulls (bigger c = more curious). Uncertain machines get tried; once the bonus shrinks, it settles on the winner.</> };
    if (strategy === "thompson") return { k: "ts", text: <>Thompson keeps a belief curve per machine and, each pull, draws a random guess from every curve and plays the highest. Wide (unsure) curves sometimes win the draw, so they get explored; narrow ones only win if they're truly good.</> };
    return { k: "rand", text: <>Random never learns anything: it spreads pulls evenly, so its regret climbs in a straight line. It's the baseline every real strategy must beat.</> };
  })();

  return (
    <div className="col" style={{ gap: 16, minWidth: 0 }}>
      {/* ================= the casino */}
      <Glass className="col" style={{ gap: 14, minWidth: 0 }}>
        <SectionTitle right={
          <div className="row wrap" style={{ gap: 10, rowGap: 8 }}>
            <Toggle label="Reveal true payouts" checked={reveal} onChange={setReveal} />
            <button className="btn sm" onClick={() => reset()} disabled={pulls === 0 && !run}>↺ Reset pulls</button>
            <button className="btn sm" onClick={() => { const n = seed + 1; setSeed(n); reset(n); }}>🎲 New casino</button>
          </div>
        }>🎰 Five machines, hidden payouts</SectionTitle>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 8 }}>
          {probs.map((p, i) => (
            <MachineCard key={`${seed}-${i}`} arm={i} pulls={S.counts.n[i]} wins={S.counts.s[i]} last={S.armLast[i]} pullId={S.armPullId[i]}
              active={S.lastArm === i} revealed={reveal} prob={p} isBest={i === best} disabled={running} animate={animateCards}
              onPull={() => { pull(i, "you"); bump(); }} />
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <Tile label="Total reward" value={S.reward} format={coinFmt} sub={`of ≈ ${bestPossible.toFixed(0)} possible`} color={colorAt(2)} />
            <Tile label="Optimal pulls" value={optimalPct} format={pctFmt} sub={reveal ? `on machine ${ARM_NAMES[best]}, the best` : "on the (hidden) best machine"} />
            <Tile label="Regret" value={S.regret} format={regretFmt} sub="coins lost vs always-best" color={S.regret > 25 ? "var(--danger)" : undefined} emphasis={S.regret > 25} />
            <Tile label="Pulls" value={pulls} format={coinFmt} sub={who === "you" ? "all by you" : who === "agent" ? "all by the agent" : `${S.youPulls} you · ${S.agentPulls} agent`} />
          </div>
          <div className="inset col" style={{ padding: "10px 12px 4px", gap: 4, minWidth: 0 }}>
            <div className="row wrap between tiny" style={{ gap: 8 }}>
              <span className="muted" style={{ fontWeight: 600 }}>Coins collected vs best possible</span>
              <span className="row" style={{ gap: 10 }}>
                <span className="row" style={{ gap: 4 }}><Swatch color={colorAt(2)} />{who === "agent" ? "agent" : "you"}</span>
                <span className="row" style={{ gap: 4 }}><Swatch color="var(--text-3)" dashed />best machine every time{reveal ? ` (${ARM_NAMES[best]})` : ""}</span>
              </span>
            </div>
            <LinePlot height={150} xMax={Math.max(20, pulls)} yDomain={[0, Math.max(5, bestPossible * 1.08, S.reward * 1.08)]} series={[
              { key: "best", color: "var(--text-3)", values: linearPoints(pulls, pmax), dashed: true, width: 1.6, opacity: 0.45 },
              { key: "you", color: colorAt(2), values: [0, ...S.history] },
            ]} />
          </div>
        </div>
        <Caption k={worldCaption.k}>{worldCaption.text}</Caption>
      </Glass>

      {/* ================= the strategy */}
      <Glass className="col" style={{ gap: 14, minWidth: 0 }}>
        <SectionTitle right={<span className="small muted">{STRATEGY_LABEL[strategy]} pulls for you — it only sees the coins, never the true payouts</span>}>
          🤖 Let a strategy play
        </SectionTitle>
        <div className="row wrap" style={{ gap: 14, rowGap: 12, alignItems: "flex-end" }}>
          <Segmented value={strategy} onChange={(v) => setStrategy(v)} options={[
            { value: "egreedy", label: "ε-greedy" },
            { value: "ucb", label: "UCB" },
            { value: "thompson", label: "Thompson" },
            { value: "random", label: "Random" },
          ]} />
          <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 360 }}>
            {strategy === "egreedy" && <Slider label="ε — share of random pulls" help="How often ε-greedy ignores what it knows and pulls a random machine." value={eps} min={0} max={0.6} step={0.01} onChange={setEps} format={(v) => v.toFixed(2)} />}
            {strategy === "ucb" && <Slider label="c — curiosity bonus" help="UCB score = estimate + c × √(ln pulls ÷ pulls of this machine). Bigger c explores more." value={c} min={0} max={3} step={0.05} onChange={setC} format={(v) => v.toFixed(2)} />}
            {strategy === "thompson" && <div className="small muted">No knob: the belief curves decide how much to explore.</div>}
            {strategy === "random" && <div className="small muted">No knob: every machine is equally likely, every pull.</div>}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 10, rowGap: 10 }}>
          <Segmented size="sm" value={speed} onChange={setSpeed} options={[
            { value: "slow", label: "🐢 Slow" },
            { value: "fast", label: "🏃 Fast" },
            { value: "turbo", label: "🚀 Turbo" },
            { value: "instant", label: "⚡ Instant" },
          ]} />
          <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
            {!run && <button className="btn primary" onClick={startRun}>▶ Run {RUN_PULLS} pulls</button>}
            {run && <button className="btn" onClick={() => setRun({ ...run, paused: !run.paused })}>{run.paused ? "▶ Resume" : "⏸ Pause"}</button>}
            {run && <button className="btn ghost" onClick={() => setRun(null)}>■ Stop</button>}
          </div>
        </div>
        {run && (
          <div className="col" style={{ gap: 4 }}>
            <div style={{ height: 6, borderRadius: 3, background: "var(--fill)", overflow: "hidden" }}>
              <div style={{ width: `${progress * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 3 }} />
            </div>
            <span className="tiny faint num">{Math.round(progress * RUN_PULLS)} / {RUN_PULLS} pulls{run.paused ? " · paused" : ""}</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <MachineView counts={S.counts} probs={probs} revealed={reveal} animate={full && !running} />
          {strategy === "thompson"
            ? <BetaCurves counts={S.counts} probs={probs} revealed={reveal} />
            : <EstimateNote ests={ests} counts={S.counts} />}
        </div>
        <Caption k={strategyCaption.k}>{strategyCaption.text}</Caption>
      </Glass>

      {/* ================= all strategies, same casino */}
      <Glass className="col" style={{ gap: 12, minWidth: 0 }}>
        <RegretChart sim={sim} selected={strategy} onSelect={setStrategy} eps={eps} c={c} />
      </Glass>
    </div>
  );
}

const linearPoints = (n: number, slope: number) => Array.from({ length: n + 1 }, (_, i) => i * slope);

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return <svg width={16} height={6} aria-hidden><line x1={1} x2={15} y1={3} y2={3} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeDasharray={dashed ? "3 3" : undefined} /></svg>;
}

/** Plain-language read-out of what the player currently believes. */
function EstimateNote({ ests, counts }: { ests: number[]; counts: Counts }) {
  const tried = counts.n.filter((n) => n > 0).length;
  const total = counts.n.reduce((a, b) => a + b, 0);
  const leader = total ? ests.indexOf(Math.max(...ests)) : -1;
  const thin = counts.n.map((n, i) => (n > 0 && n < 5 ? ARM_NAMES[i] : null)).filter(Boolean);
  return (
    <div className="inset col" style={{ padding: 12, gap: 8, minWidth: 0 }}>
      <span className="tiny muted" style={{ fontWeight: 600 }}>What the player believes right now</span>
      {total === 0 ? (
        <span className="small muted">Nothing yet — every machine is a mystery. Pull some levers or run a strategy.</span>
      ) : (
        <ul className="small col" style={{ gap: 6, margin: 0, paddingLeft: 18 }}>
          <li>Looks best: <b style={{ color: colorAt(leader) }}>machine {ARM_NAMES[leader]}</b> at {Math.round(ests[leader] * 100)}%.</li>
          <li>{tried} of {N_ARMS} machines tried{tried < N_ARMS ? " — the untried ones could be the jackpot." : "."}</li>
          {thin.length > 0 && <li>Barely tested: {thin.join(", ")} — their estimates could be way off.</li>}
          <li className="muted">Switch to <b>Thompson</b> to see these beliefs drawn as curves.</li>
        </ul>
      )}
    </div>
  );
}
