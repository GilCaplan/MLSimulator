/* Tabular Q-learning on an 8×8 grid world. Pure functions over a mutable Float64Array Q-table — no React. */
import { argmaxRandom, type Rand } from "../rand";

export const N = 8;
export const CELLS = N * N;
export const MAX_STEPS = 150;
export const STEP_COST = -0.1;
export const GOAL_REWARD = 10;
export const PIT_REWARD = -10;
/** chance a move goes in a random direction on the slippery floor */
export const SLIP = 0.2;

export const EMPTY = 0, WALL = 1, PIT = 2, GOAL = 3;
export type Cell = typeof EMPTY | typeof WALL | typeof PIT | typeof GOAL;
export interface World { cells: Cell[]; start: number }
export interface QParams { alpha: number; gamma: number; eps: number; slippery: boolean }

/** up, right, down, left */
export const MOVES: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];
export const ARROW_DEG = [0, 90, 180, 270];

export const rc = (s: number) => [Math.floor(s / N), s % N] as const;
export const isTerminal = (c: Cell) => c === PIT || c === GOAL;

export const newQ = () => new Float64Array(CELLS * 4);

/** Deterministic move (walls and edges block: you stay put but still pay the step). */
export function moveFrom(world: World, s: number, a: number) {
  const [r, c] = rc(s);
  const nr = r + MOVES[a][0], nc = c + MOVES[a][1];
  if (nr < 0 || nr >= N || nc < 0 || nc >= N) return s;
  const s2 = nr * N + nc;
  return world.cells[s2] === WALL ? s : s2;
}

export function envStep(world: World, s: number, a: number, slippery: boolean, r: Rand) {
  const act = slippery && r() < SLIP ? Math.floor(r() * 4) : a;
  const s2 = moveFrom(world, s, act);
  const cell = world.cells[s2];
  const reward = cell === GOAL ? GOAL_REWARD : cell === PIT ? PIT_REWARD : STEP_COST;
  return { s2, reward, done: isTerminal(cell) };
}

export const qRow = (Q: Float64Array, s: number) => Q.subarray(s * 4, s * 4 + 4);
export function maxQ(Q: Float64Array, s: number) {
  const o = s * 4;
  return Math.max(Q[o], Q[o + 1], Q[o + 2], Q[o + 3]);
}

/** One in-progress episode — advanced a step at a time so the robot can be animated. */
export interface Episode { s: number; steps: number; reward: number; path: number[]; done: boolean; outcome: "goal" | "pit" | "timeout" | null }

export const startEpisode = (world: World): Episode => ({ s: world.start, steps: 0, reward: 0, path: [world.start], done: false, outcome: null });

/** ε-greedy step + Q-learning update: Q(s,a) ← Q(s,a) + α·(r + γ·max Q(s′) − Q(s,a)). */
export function stepEpisode(world: World, Q: Float64Array, ep: Episode, p: QParams, r: Rand) {
  if (ep.done) return;
  const a = r() < p.eps ? Math.floor(r() * 4) : argmaxRandom(qRow(Q, ep.s), r);
  const { s2, reward, done } = envStep(world, ep.s, a, p.slippery, r);
  const target = reward + (done ? 0 : p.gamma * maxQ(Q, s2));
  const i = ep.s * 4 + a;
  Q[i] += p.alpha * (target - Q[i]);
  ep.s = s2;
  ep.steps++;
  ep.reward += reward;
  ep.path.push(s2);
  if (done) { ep.done = true; ep.outcome = world.cells[s2] === GOAL ? "goal" : "pit"; }
  else if (ep.steps >= MAX_STEPS) { ep.done = true; ep.outcome = "timeout"; }
}

export function runEpisode(world: World, Q: Float64Array, p: QParams, r: Rand) {
  const ep = startEpisode(world);
  while (!ep.done) stepEpisode(world, Q, ep, p, r);
  return ep;
}

/** Follow the learned (greedy) policy from the start, without slipping. Stops at a terminal, a loop or 64 steps. */
export function greedyRoute(world: World, Q: Float64Array): { path: number[]; outcome: "goal" | "pit" | "loop" | "stuck" } {
  const path = [world.start];
  const seen = new Set([world.start]);
  let s = world.start;
  for (let k = 0; k < CELLS; k++) {
    const row = qRow(Q, s);
    if (row[0] === row[1] && row[1] === row[2] && row[2] === row[3]) return { path, outcome: "stuck" };
    let a = 0;
    for (let i = 1; i < 4; i++) if (row[i] > row[a]) a = i;
    const s2 = moveFrom(world, s, a);
    path.push(s2);
    if (world.cells[s2] === GOAL) return { path, outcome: "goal" };
    if (world.cells[s2] === PIT) return { path, outcome: "pit" };
    if (seen.has(s2)) return { path, outcome: "loop" };
    seen.add(s2);
    s = s2;
  }
  return { path, outcome: "loop" };
}

/** Shortest number of steps from start to any goal (BFS), or null when no goal is reachable. */
export function shortestPath(world: World): number | null {
  const dist = new Map<number, number>([[world.start, 0]]);
  const q = [world.start];
  while (q.length) {
    const s = q.shift()!;
    for (let a = 0; a < 4; a++) {
      const s2 = moveFrom(world, s, a);
      if (dist.has(s2) || world.cells[s2] === PIT) continue;
      dist.set(s2, dist.get(s)! + 1);
      if (world.cells[s2] === GOAL) return dist.get(s2)!;
      q.push(s2);
    }
  }
  return null;
}

/** How sure the robot is about its best move here: the gap to the runner-up move, scaled to 0–1. */
export function confidence(Q: Float64Array, s: number) {
  const row = qRow(Q, s);
  let best = 0;
  for (let i = 1; i < 4; i++) if (row[i] > row[best]) best = i;
  let second = -Infinity;
  for (let i = 0; i < 4; i++) if (i !== best && row[i] > second) second = row[i];
  return { best, conf: Math.min(1, Math.max(0, (row[best] - second) / 1.2)), untouched: row[0] === 0 && row[1] === 0 && row[2] === 0 && row[3] === 0 };
}

/* ---------------------------------------------------------------- presets */

/** Map legend: . empty  # wall  x pit  G goal  S start */
const MAPS = {
  room: [
    ". . . . . . . G",
    ". . . . . . . .",
    ". . # # # . . .",
    ". . . . # . . .",
    ". x . . # . . .",
    ". # # . . . x .",
    ". . . . . . . .",
    "S . . . . . . .",
  ],
  cliff: [
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    "S x x x x x x G",
  ],
  maze: [
    "S . . # . . . .",
    "# # . # . # # .",
    ". . . . . # . .",
    ". # # # . # . #",
    ". . . # . . . .",
    "# # . # # # # .",
    ". . . . . x # .",
    ". # # # # . . G",
  ],
  hall: [
    "S . . . . . . .",
    "# # # # # # # .",
    ". . . . . . . .",
    ". # # # # # # #",
    ". . . . . . . .",
    "# # # # # # # .",
    ". . . . . . . .",
    "G # # # # # # #",
  ],
} as const;
export type PresetId = keyof typeof MAPS;
export const PRESETS: { id: PresetId; label: string }[] = [
  { id: "room", label: "🏠 Room" },
  { id: "cliff", label: "🧗 Cliff" },
  { id: "maze", label: "🌀 Maze" },
  { id: "hall", label: "🐍 Long hall" },
];

export function presetWorld(id: PresetId): World {
  const cells: Cell[] = [];
  let start = 0;
  MAPS[id].forEach((row, r) => row.split(" ").forEach((ch, c) => {
    if (ch === "S") start = r * N + c;
    cells.push(ch === "#" ? WALL : ch === "x" ? PIT : ch === "G" ? GOAL : EMPTY);
  }));
  return { cells, start };
}

/** Does any best-route cell sit right next to a pit? (the "risky shortcut" teaching moment) */
export function routeHugsPit(world: World, path: number[]) {
  return path.slice(0, -1).some((s) => MOVES.some((_, a) => {
    const s2 = moveFrom(world, s, a);
    return s2 !== s && world.cells[s2] === PIT;
  }));
}
