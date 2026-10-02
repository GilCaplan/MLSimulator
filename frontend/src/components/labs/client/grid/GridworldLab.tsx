import { useMemo, useReducer, useRef, useState } from "react";
import { Glass, Segmented, Slider, Toggle } from "../../../glass";
import { rng, smooth } from "../rand";
import { Caption, LinePlot, SectionTitle, Tile, Tiles, useFrameLoop, useFullMotion } from "../ui";
import { GridBoard } from "./GridBoard";
import {
  EMPTY, GOAL, MOVES, PIT, PRESETS, SLIP, WALL, greedyRoute, maxQ, moveFrom, newQ, presetWorld, shortestPath, startEpisode, stepEpisode,
  type Cell, type Episode, type PresetId, type World,
} from "./qlearn";

type Speed = "watch" | "quick" | "fast";
const STEPS_PER_SEC: Record<Exclude<Speed, "fast">, number> = { watch: 7, quick: 40 };
/** in fast mode only every Nth episode is drawn */
const SHOW_EVERY = 10;
const REPLAY_PER_SEC = 5;

type Mode = "idle" | "train" | "step" | "replay";

/** click cycle: empty → wall → pit → goal → empty (indexed by the current cell type) */
const NEXT: Cell[] = [WALL, PIT, GOAL, EMPTY];

export function GridworldLab() {
  const full = useFullMotion();
  const [preset, setPreset] = useState<PresetId>("cliff");
  const [world, setWorld] = useState<World>(() => presetWorld("cliff"));
  const worldRef = useRef(world);
  worldRef.current = world;

  const [alpha, setAlpha] = useState(0.5);
  const [gamma, setGamma] = useState(0.9);
  const [eps, setEps] = useState(0.2);
  const [decay, setDecay] = useState(true);
  const [episodes, setEpisodes] = useState(300);
  const [slippery, setSlippery] = useState(false);
  const [speed, setSpeed] = useState<Speed>("quick");
  const [showHeat, setShowHeat] = useState(true);
  const [showArrows, setShowArrows] = useState(true);

  const [mode, setMode] = useState<Mode>("idle");
  const [paused, setPaused] = useState(false);
  const [target, setTarget] = useState(0);
  const [editedAfterTraining, setEdited] = useState(false);

  // learner state lives in refs (mutated every frame); `bump` re-renders
  const Q = useRef(newQ());
  const qVersion = useRef(0);
  const rewards = useRef<number[]>([]);
  const outcomes = useRef<("goal" | "pit" | "timeout")[]>([]);
  const ep = useRef<Episode | null>(null);
  const shown = useRef<{ robot: number; trail: number[]; mood: "normal" | "goal" | "pit" }>({ robot: world.start, trail: [], mood: "normal" });
  const replay = useRef<{ path: number[]; i: number; outcome: string } | null>(null);
  const [replayResult, setReplayResult] = useState<string | null>(null);
  const r = useRef(rng(42));
  const acc = useRef(0);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const count = rewards.current.length;
  const epsNow = (n: number) => (decay ? eps * Math.max(0.05, 1 - n / Math.max(1, episodes)) : eps);
  const params = () => ({ alpha, gamma, eps: epsNow(rewards.current.length), slippery });

  const finishEpisode = (e: Episode) => {
    rewards.current.push(e.reward);
    outcomes.current.push(e.outcome ?? "timeout");
  };

  const stopAll = () => { setMode("idle"); setPaused(false); ep.current = null; };

  useFrameLoop(mode !== "idle" && !paused, (dt) => {
    const w = worldRef.current;
    if (mode === "replay") {
      const rp = replay.current;
      if (!rp) return stopAll();
      acc.current += dt * REPLAY_PER_SEC;
      while (acc.current >= 1 && rp.i < rp.path.length - 1) {
        acc.current -= 1;
        rp.i++;
      }
      const s = rp.path[rp.i];
      shown.current = { robot: s, trail: rp.path.slice(0, rp.i + 1), mood: w.cells[s] === PIT ? "pit" : w.cells[s] === GOAL ? "goal" : "normal" };
      if (rp.i >= rp.path.length - 1) { setReplayResult(rp.outcome); stopAll(); }
      bump();
      return;
    }

    const goalCount = mode === "step" ? count + 1 : target;
    if (speed === "fast" && mode === "train") {
      ep.current = null; // drop a half-watched episode when switching to fast mode
      const t0 = performance.now();
      while (rewards.current.length < goalCount && performance.now() - t0 < 9) {
        const e = startEpisode(w);
        while (!e.done) stepEpisode(w, Q.current, e, params(), r.current);
        finishEpisode(e);
        if (rewards.current.length % SHOW_EVERY === 0 || rewards.current.length === goalCount)
          shown.current = { robot: e.s, trail: e.path, mood: e.outcome === "pit" ? "pit" : e.outcome === "goal" ? "goal" : "normal" };
      }
    } else {
      const rate = speed === "fast" ? 200 : STEPS_PER_SEC[speed];
      acc.current += dt * rate;
      while (acc.current >= 1) {
        acc.current -= 1;
        if (!ep.current) ep.current = startEpisode(w);
        const e = ep.current;
        stepEpisode(w, Q.current, e, params(), r.current);
        shown.current = { robot: e.s, trail: e.path, mood: e.outcome === "pit" ? "pit" : e.outcome === "goal" ? "goal" : "normal" };
        if (e.done) {
          finishEpisode(e);
          ep.current = null;
          if (rewards.current.length >= goalCount) break;
        }
      }
    }
    qVersion.current++;
    if (rewards.current.length >= goalCount && !ep.current) { stopAll(); setTarget(Math.max(target, rewards.current.length)); }
    bump();
  });

  /* ---------- actions */
  const train = () => {
    setReplayResult(null);
    const n = rewards.current.length;
    setTarget(n < episodes ? episodes : n + episodes);
    acc.current = 1;
    setPaused(false);
    setMode("train");
  };
  const stepOne = () => {
    setReplayResult(null);
    acc.current = 1;
    setPaused(false);
    setMode("step");
  };
  const resetLearning = (w: World = world) => {
    Q.current = newQ();
    qVersion.current++;
    rewards.current = [];
    outcomes.current = [];
    ep.current = null;
    replay.current = null;
    r.current = rng(42);
    shown.current = { robot: w.start, trail: [], mood: "normal" };
    setTarget(0);
    setEdited(false);
    setReplayResult(null);
    stopAll();
    bump();
  };
  const watchRoute = () => {
    const g = greedyRoute(world, Q.current);
    const steps = g.path.length - 1;
    const msg = g.outcome === "goal" ? `🏁 Reached the goal in ${steps} step${steps === 1 ? "" : "s"}.`
      : g.outcome === "pit" ? "🕳️ The learned route walks straight into a pit — it needs more training."
        : g.outcome === "stuck" ? "🤷 The robot has learned nothing about the start cell yet — train first."
          : "🔁 It's going in circles — no complete route learned yet.";
    replay.current = { path: g.path, i: 0, outcome: msg };
    ep.current = null;
    setReplayResult(null);
    acc.current = 0;
    shown.current = { robot: world.start, trail: [world.start], mood: "normal" };
    setPaused(false);
    setMode("replay");
    if (!full) { // instant: jump straight to the end of the route
      replay.current.i = g.path.length - 1;
    }
  };
  const pickPreset = (id: PresetId) => {
    setPreset(id);
    const w = presetWorld(id);
    setWorld(w);
    worldRef.current = w;
    resetLearning(w);
  };
  const edit = (w: World) => {
    setWorld(w);
    worldRef.current = w;
    if (rewards.current.length) setEdited(true);
    if (mode === "replay") stopAll();
    if (mode === "idle") shown.current = { robot: w.start, trail: [], mood: "normal" };
    bump();
  };
  const cycle = (cell: number) => edit({ ...world, cells: world.cells.map((c, i) => (i === cell ? NEXT[c] : c)) });
  const moveStart = (cell: number) => edit({ ...world, start: cell });

  /* ---------- derived */
  const route = useMemo(() => greedyRoute(world, Q.current), [world, qVersion.current]); // eslint-disable-line react-hooks/exhaustive-deps
  const shortest = useMemo(() => shortestPath(world), [world]);
  const hugs = useMemo(() => route.path.slice(0, -1).filter((s) => MOVES.some((_, a) => { const s2 = moveFrom(world, s, a); return s2 !== s && world.cells[s2] === PIT; })).length, [route, world]);
  const last = outcomes.current.slice(-50);
  const success = last.length ? last.filter((o) => o === "goal").length / last.length : 0;
  const rw = rewards.current;
  const smoothed = useMemo(() => smooth(rw, Math.max(5, Math.round(Math.max(rw.length, 50) / 25))), [rw.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = mode === "train" || mode === "step";
  const routeLen = route.outcome === "goal" ? route.path.length - 1 : null;
  const startValue = maxQ(Q.current, world.start);
  const trainLabel = count === 0 ? `▶ Train ${episodes} episodes` : count < episodes ? `▶ Train to ${episodes}` : `▶ Train ${episodes} more`;

  const caption = (() => {
    if (shortest === null) return { k: "nogoal", text: <>There's no way to reach a 💎 from the start right now. Click empty cells to cycle them to a goal, or clear a wall.</> };
    if (eps === 0) return { k: "eps0", text: <>ε = 0: the robot never explores on purpose — it always takes the move that looks best so far. It only tries new moves by accident (untried ones still look like 0, tried ones cost −0.1), a slow blind sweep that in a bigger world may never reach the goal. And once it finds <i>a</i> route, it stops looking for a shorter one.</> };
    if (gamma < 0.35) return { k: "gamma", text: <>γ = {gamma.toFixed(2)}: the robot is short-sighted. A +10 that's 3 steps away is worth only {(10 * gamma ** 3).toFixed(2)} to it now, so only cells right next to the goal light up on the heatmap — far away, every move looks the same and it wanders.</> };
    if (slippery && hugs >= 2 && count > 0) return { k: "slip-hug", text: <>Slippery floor: {Math.round(SLIP * 100)}% of moves go a random way, so walking beside a pit is a real gamble. Train longer and the robot learns to pay a few extra −0.1 steps to keep its distance.</> };
    if (slippery) return { k: "slip", text: <>Slippery floor: {Math.round(SLIP * 100)}% of moves go a random way. Cells next to pits turn red on the heatmap — the robot learns that the safe way round is worth a few extra steps.</> };
    if (hugs >= 3 && route.outcome === "goal") return { k: "hug", text: <>Risk vs reward: the learned route hugs {hugs} pit edges because the robot plans as if it never slips — the shortcut saves steps (each costs −0.1). During training, though, its random ε moves tip it in (the dips in the chart). Turn on the <b>slippery floor</b> and see if it still dares.</> };
    if (alpha >= 0.9) return { k: "alpha", text: <>α = {alpha.toFixed(2)}: each new experience almost completely overwrites what the robot knew. Fast on a fixed maze — but jumpy and forgetful when outcomes are random (try the slippery floor).</> };
    if (count === 0) return { k: "start", text: <>Press <b>Train</b>. The robot starts knowing nothing: it bumps around, falls into pits (−10), and slowly the 💎 (+10) value spreads backwards across the grid. Each step costs −0.1, so shorter paths win.</> };
    if (routeLen !== null) return { k: `route-${routeLen === shortest}`, text: routeLen === shortest
      ? <>The learned route takes <b>{routeLen} steps</b> — as short as possible. Green cells are close to the goal; arrows show the best move, bolder = more confident. Try editing the maze while it trains.</>
      : <>The robot has a <b>{routeLen}-step</b> route, but the shortest is {shortest}. More episodes (or a bit more ε) let it discover the shortcut.</> };
    return { k: "learning", text: <>Still learning — no complete route yet. Watch the green value spread backwards from the 💎 as the robot gets lucky more often.</> };
  })();

  return (
    <div className="col" style={{ gap: 16, minWidth: 0 }}>
      <Glass className="col" style={{ gap: 14, minWidth: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 18, alignItems: "start" }}>
          {/* ---------- board column */}
          <div className="col" style={{ gap: 10, minWidth: 0 }}>
            <SectionTitle right={<Segmented size="sm" value={preset} onChange={pickPreset} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />}>
              🤖 The maze
            </SectionTitle>
            <div className="tiny muted">Click a cell to cycle <b>empty → wall → pit (−10) → goal (+10)</b>. Drag the 🏠 to move the start.</div>
            <GridBoard world={world} Q={Q.current} qVersion={qVersion.current} robot={shown.current.robot} trail={shown.current.trail}
              showHeat={showHeat} showArrows={showArrows} animateRobot={full && speed !== "fast"} robotTween={mode === "replay" ? 1 / REPLAY_PER_SEC : speed === "watch" ? 1 / STEPS_PER_SEC.watch : 1 / STEPS_PER_SEC.quick}
              onCycle={cycle} onMoveStart={moveStart} robotMood={shown.current.mood} />
            <div className="row wrap between" style={{ gap: 12, rowGap: 8 }}>
              <div className="row wrap" style={{ gap: 14, rowGap: 8 }}>
                <Toggle label="Value heatmap" checked={showHeat} onChange={setShowHeat} />
                <Toggle label="Best-move arrows" checked={showArrows} onChange={setShowArrows} />
              </div>
              <HeatLegend />
            </div>
            {editedAfterTraining && (
              <div className="tiny" style={{ color: "var(--warning)", fontWeight: 560 }}>
                ✏️ You changed the maze — the robot's old memories may now be wrong. Keep training to update them, or reset.
              </div>
            )}
          </div>

          {/* ---------- controls column */}
          <div className="col" style={{ gap: 12, minWidth: 0 }}>
            <SectionTitle>🎛️ How the robot learns</SectionTitle>
            <Slider label="Learning rate α" help="How much each new experience changes the robot's memory. 1 = forget the old estimate entirely." value={alpha} min={0.05} max={1} step={0.05} onChange={setAlpha} format={(v) => v.toFixed(2)} />
            <Slider label="Discount γ" help="How much future rewards count. 0 = only the next step matters; 0.99 = very far-sighted." value={gamma} min={0} max={0.99} step={0.01} onChange={setGamma} format={(v) => v.toFixed(2)} />
            <Slider label="Exploration ε" help="Chance of a random move instead of the best-known one." value={eps} min={0} max={1} step={0.05} onChange={setEps} format={(v) => v.toFixed(2)} />
            <div className="row wrap" style={{ gap: 14, rowGap: 8 }}>
              <Toggle label="Decay ε over training" help="Explore a lot at first, then less and less (down to 5% of ε)." checked={decay} onChange={setDecay} />
              <Toggle label="Slippery floor" help={`${Math.round(SLIP * 100)}% of moves go in a random direction — makes pits next to the path genuinely risky.`} checked={slippery} onChange={setSlippery} />
            </div>
            <Slider label="Episodes" help="One episode = one attempt from the start until the robot hits a goal, a pit, or gives up after 150 steps." value={episodes} min={20} max={2000} log integer onChange={setEpisodes} />
            <Segmented size="sm" value={speed} onChange={setSpeed} options={[
              { value: "watch", label: "🐢 Watch" },
              { value: "quick", label: "🏃 Quick" },
              { value: "fast", label: `⚡ Fast (every ${SHOW_EVERY}th)` },
            ]} />
            <div className="row wrap" style={{ gap: 8 }}>
              {!busy && <button className="btn primary" onClick={train}>{trainLabel}</button>}
              {busy && <button className="btn" onClick={() => setPaused((p) => !p)}>{paused ? "▶ Resume" : "⏸ Pause"}</button>}
              <button className="btn" onClick={stepOne} disabled={busy}>⏭ Step episode</button>
              <button className="btn ghost" onClick={() => resetLearning()}>↺ Reset</button>
            </div>
            <button className="btn gradient" onClick={watchRoute} disabled={busy || mode === "replay"} style={{ alignSelf: "flex-start" }}>👣 Watch the learned route</button>
            <div className="small" style={{ minHeight: 20 }}>
              {mode === "replay" ? <span className="muted">Following the best-known move from each cell…</span>
                : replayResult ? <span style={{ fontWeight: 560 }}>{replayResult}</span>
                  : busy ? <span className="muted num">Episode {count + 1}{mode === "train" ? ` of ${target}` : ""} · ε now {epsNow(count).toFixed(2)}{paused ? " · paused" : ""}</span>
                    : <span className="faint">{count ? `${count} episodes trained` : "Not trained yet"}</span>}
            </div>
          </div>
        </div>
      </Glass>

      <Glass className="col" style={{ gap: 12, minWidth: 0 }}>
        <SectionTitle right={<span className="small muted">smoothed line = trend · faint line = each episode</span>}>📈 Reward per episode</SectionTitle>
        <Tiles min={115}>
          <Tile label="Episodes" value={count} format={(v) => String(Math.round(v))} sub={target ? `target ${target}` : "press Train"} />
          <Tile label="Reached the goal" value={success * 100} format={(v) => `${Math.round(v)}%`} sub="of the last 50 episodes" color={success > 0.8 ? "var(--success)" : undefined} />
          <Tile label="Learned route" value={routeLen ?? 0} format={(v) => (routeLen === null ? "—" : `${Math.round(v)} steps`)} sub={shortest === null ? "no goal reachable" : `shortest possible: ${shortest}`}
            emphasis={routeLen !== null && routeLen === shortest} color={routeLen !== null && routeLen === shortest ? "var(--success)" : undefined} />
          <Tile label="Value of the start" value={startValue} format={(v) => v.toFixed(2)} sub="what the robot expects to earn" />
        </Tiles>
        <div className="inset" style={{ padding: "10px 10px 2px" }}>
          <LinePlot height={200} xMax={Math.max(20, target, count)} yDomain={count ? undefined : [-15, 12]} xLabel="episode" yLabel="total reward" zeroLine series={[
            { key: "raw", color: "var(--accent)", values: rw, width: 1, opacity: 0.28 },
            { key: "avg", color: "var(--accent)", values: smoothed, width: 2.6 },
          ]} />
        </div>
        <Caption k={caption.k}>{caption.text}</Caption>
      </Glass>
    </div>
  );
}

function HeatLegend() {
  return (
    <span className="row tiny muted" style={{ gap: 6 }}>
      <span>bad</span>
      <span style={{ width: 70, height: 8, borderRadius: 4, background: "linear-gradient(90deg, color-mix(in srgb, var(--danger) 65%, transparent), transparent 50%, color-mix(in srgb, var(--success) 65%, transparent))", border: "1px solid var(--hairline)" }} />
      <span>good</span>
    </span>
  );
}
