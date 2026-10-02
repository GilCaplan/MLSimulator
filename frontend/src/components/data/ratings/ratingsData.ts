import { fullPipeline, useProject } from "../../../lib/store";
import type { DatasetProfile, DatasetSummary, PipelineSpec, Project } from "../../../lib/types";

export type RoleId = "user" | "item" | "rating" | "time";
export type Roles = Record<RoleId, string | null>;

export const ROLES: { id: RoleId; icon: string; label: string; help: string; optional?: boolean }[] = [
  { id: "user", icon: "👤", label: "Who", help: "The column that says who gave the rating — a user id, customer number or name." },
  { id: "item", icon: "🎬", label: "What", help: "The column that says what was rated — a film, product, song or book id." },
  { id: "rating", icon: "⭐", label: "Rating", help: "How much they liked it — stars, a score, or 1 for “bought”. Higher must mean better." },
  { id: "time", icon: "🕒", label: "When", help: "Optional: when it happened (a date, timestamp or day number). With it, the test uses each person's most recent ratings — just like real life, where we predict the future from the past.", optional: true },
];

const PATTERNS: Record<RoleId, RegExp> = {
  user: /^(user|users|user_?id|userid|uid|customer|customer_?id|client|viewer|member|person|reader|listener|buyer|shopper)$/i,
  item: /^(item|items|item_?id|itemid|iid|movie|movie_?id|film|product|product_?id|song|track|book|book_?id|isbn|sku|asin|article|game)$/i,
  rating: /^(rating|ratings|stars?|score|rate|grade|value|review_?score|liked|bought|count|plays)$/i,
  time: /^(time|timestamp|ts|date|datetime|day|when|created|created_at|rated_at|order_date|t)$/i,
};

const isNumeric = (d: DatasetSummary, name: string) => d.columns.find((c) => c.name === name)?.role === "numeric";

/** Best guess of which column plays which part, from the column names (and types as a fallback). */
export function guessRoles(d: DatasetSummary): Roles {
  const names = d.columns.map((c) => c.name);
  const used = new Set<string>();
  const take = (role: RoleId) => {
    const hit = names.find((n) => !used.has(n) && PATTERNS[role].test(n.trim()));
    if (hit) used.add(hit);
    return hit ?? null;
  };
  const out: Roles = { user: take("user"), item: take("item"), rating: take("rating"), time: take("time") };
  if (!out.rating) {
    // a small-integer numeric column is the likeliest rating
    const cand = d.columns.filter((c) => !used.has(c.name) && c.role === "numeric" && c.unique <= 11).sort((a, b) => a.unique - b.unique)[0]
      ?? d.columns.filter((c) => !used.has(c.name) && c.role === "numeric").sort((a, b) => a.unique - b.unique)[0];
    if (cand) { out.rating = cand.name; used.add(cand.name); }
  }
  for (const role of ["user", "item"] as const) {
    if (out[role]) continue;
    const cand = names.find((n) => !used.has(n));
    if (cand) { out[role] = cand; used.add(cand); }
  }
  if (!out.time) {
    const cand = d.columns.filter((c) => !used.has(c.name) && (c.role === "datetime" || (c.role === "numeric" && c.unique > 11))).sort((a, b) => b.unique - a.unique)[0];
    if (cand) out.time = cand.name;
  }
  return out;
}

/** The roles saved in the project (if they still fit the dataset), else a fresh guess. */
export function rolesOf(project: Project, dataset: DatasetSummary | null): Roles {
  const saved = (project.pipeline?.columns ?? {}) as Partial<Roles>;
  const names = new Set(dataset?.columns.map((c) => c.name) ?? []);
  const guess = dataset ? guessRoles(dataset) : { user: null, item: null, rating: null, time: null };
  const ok = (v?: string | null) => !!v && (!dataset || names.has(v));
  const hasSaved = ok(saved.user) && ok(saved.item) && ok(saved.rating);
  if (!hasSaved) return guess;
  return { user: saved.user!, item: saved.item!, rating: saved.rating!, time: ok(saved.time) ? saved.time! : null };
}

export const rolesReady = (r: Roles) => !!r.user && !!r.item && !!r.rating && new Set([r.user, r.item, r.rating]).size === 3;

/** Does this profile describe these roles? */
export function profileFits(p: DatasetProfile | null, r: Roles): p is DatasetProfile {
  const c = p?.columns_roles;
  return !!p && p.modality === "ratings" && !!c && c.user === r.user && c.item === r.item && c.rating === r.rating && p.n_users !== undefined;
}

/** Make a freshly loaded dataset the project's ratings: guess the column roles, reset everything downstream. */
export function adoptRatingsDataset(d: DatasetSummary) {
  const s = useProject.getState();
  s.setDataset(d);
  s.setProfile(null);
  s.setReport(null);
  const keep = (s.project?.pipeline ?? {}) as Partial<PipelineSpec>;
  s.update({ dataset_id: d.id, target: null, truth: null, pipeline: { columns: guessRoles(d), ...(keep.recsys ? { recsys: keep.recsys } : {}) }, prepared_id: null });
}

/** Give a column a role; if another role had that column, the two swap. */
export function setRole(roles: Roles, role: RoleId, col: string | null) {
  const s = useProject.getState();
  const p = s.project;
  if (!p) return;
  const next: Roles = { ...roles, [role]: col };
  if (col) for (const r of Object.keys(roles) as RoleId[]) if (r !== role && roles[r] === col) next[r] = roles[role];
  const cur = (p.pipeline ?? {}) as Partial<PipelineSpec>;
  s.update({ pipeline: { ...cur, columns: next }, prepared_id: null });
  s.setReport(null);
}

/** The full recipe for a ratings project. `fullPipeline` doesn't carry `columns`, so add the saved roles back. */
export function ratingsSpec(p: Project): PipelineSpec | null {
  const spec = fullPipeline(p);
  if (!spec) return null;
  const cols = p.pipeline?.columns;
  return { ...spec, modality: "ratings", ...(cols ? { columns: cols } : {}) };
}

/** Rank items by how many people rated them and find the "head": the fewest items that collect `share` of all ratings. */
export function headSize(sortedDesc: number[], share = 0.5): number {
  const total = sortedDesc.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let acc = 0;
  for (let i = 0; i < sortedDesc.length; i++) {
    acc += sortedDesc[i];
    if (acc >= total * share) return i + 1;
  }
  return sortedDesc.length;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString();
export const pctText = (v: number, digits = 1) => `${(v * 100).toFixed(v >= 0.999 && v < 1 ? 2 : digits)}%`;

/** Deterministic poster colour for an item id / title. */
const POSTERS = ["#FF375F", "#0A84FF", "#30D158", "#FF9F0A", "#BF5AF2", "#64D2FF", "#5E5CE6", "#FF6482", "#66D4CF", "#AC8E68"];
export function posterColor(key: string) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return POSTERS[h % POSTERS.length];
}

export const GENRE_EMOJI: Record<string, string> = {
  Action: "💥", Comedy: "😂", Drama: "🎭", "Sci-Fi": "🚀", Romance: "💕", Horror: "👻", Documentary: "🎥", Animation: "🧸",
};
