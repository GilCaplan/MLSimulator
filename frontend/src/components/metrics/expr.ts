/* A tiny, safe formula language for learner-made metrics: numbers, metric names (optionally `train.` / `test.`),
 * + - * / ^, parentheses, unary minus and a handful of functions. Tokenizer + recursive descent parser + evaluator.
 * Never uses eval/Function. Self-contained (no imports) so it can be unit-tested with plain node. */

export type Scope = "test" | "train";

export type Node =
  | { k: "num"; v: number; pos: number; end: number }
  | { k: "var"; name: string; raw: string; scope: Scope | null; pos: number; end: number }
  | { k: "neg"; a: Node; pos: number; end: number }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node; pos: number; end: number }
  | { k: "call"; fn: FnName; args: Node[]; pos: number; end: number };

export type FnName = "abs" | "sqrt" | "log" | "exp" | "min" | "max" | "pow";

/** Function name → [min args, max args, one-line help]. */
export const FUNCTIONS: Record<FnName, [number, number, string]> = {
  abs: [1, 1, "abs(x) — size of x, ignoring its sign"],
  sqrt: [1, 1, "sqrt(x) — square root"],
  log: [1, 1, "log(x) — natural logarithm (squashes big numbers)"],
  exp: [1, 1, "exp(x) — e to the power x"],
  min: [1, 99, "min(a, b, …) — the smallest"],
  max: [1, 99, "max(a, b, …) — the largest"],
  pow: [2, 2, "pow(x, n) — x to the power n (same as x ^ n)"],
};

/** Friendly alternative spellings for metric names. */
export const ALIASES: Record<string, string> = {
  fit_time_s: "fit_time", time: "fit_time", seconds: "fit_time", params: "n_params", parameters: "n_params",
  r_squared: "r2", rsquared: "r2", auc: "roc_auc", f1_macro: "f1", ap: "avg_precision", logloss: "log_loss",
  bal_accuracy: "balanced_accuracy", balanced_acc: "balanced_accuracy", acc: "accuracy",
};

/** A one-click repair: replace src[pos, end) with `text`. */
export interface Fix { pos: number; end: number; text: string; label: string }

export class FormulaError extends Error {
  pos: number;
  end: number;
  hint?: string;
  fix?: Fix;
  constructor(message: string, pos: number, end: number = pos + 1, hint?: string, fix?: Fix) {
    super(message);
    this.pos = pos;
    this.end = Math.max(end, pos + 1);
    this.hint = hint;
    this.fix = fix;
  }
}

/* ------------------------------------------------------------------ tokenizer */

export type TokKind = "num" | "name" | "op" | "lp" | "rp" | "comma" | "space" | "bad";
export interface Token { kind: TokKind; text: string; pos: number; end: number; value?: number }

const OP_MAP: Record<string, string> = { "+": "+", "-": "-", "−": "-", "–": "-", "*": "*", "×": "*", "·": "*", "/": "/", "÷": "/", "^": "^" };

/** Splits a formula into tokens. Whitespace is kept (kind "space") so the editor can highlight every character. */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const start = i;
    if (/\s/.test(c)) {
      while (i < src.length && /\s/.test(src[i])) i++;
      out.push({ kind: "space", text: src.slice(start, i), pos: start, end: i });
    } else if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) {
        out.push({ kind: "bad", text: c, pos: i, end: i + 1 });
        i++;
      } else {
        i += m[0].length;
        out.push({ kind: "num", text: m[0], pos: start, end: i, value: Number(m[0]) });
      }
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/.exec(src.slice(i))!;
      i += m[0].length;
      out.push({ kind: "name", text: m[0], pos: start, end: i });
    } else if (c === "*" && src[i + 1] === "*") {
      i += 2;
      out.push({ kind: "op", text: "^", pos: start, end: i });
    } else if (OP_MAP[c]) {
      i++;
      out.push({ kind: "op", text: OP_MAP[c], pos: start, end: i });
    } else if (c === "(" || c === ")") {
      i++;
      out.push({ kind: c === "(" ? "lp" : "rp", text: c, pos: start, end: i });
    } else if (c === ",") {
      i++;
      out.push({ kind: "comma", text: c, pos: start, end: i });
    } else {
      i++;
      out.push({ kind: "bad", text: c, pos: start, end: i });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ suggestions */

/** Edit distance where swapping two neighbouring letters counts as one typo (optimal string alignment). */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** The closest known word, if it's close enough to be a likely typo. */
export function suggest(word: string, known: string[]): string | undefined {
  const w = word.toLowerCase();
  let best: string | undefined;
  let bestD = Infinity;
  for (const k of known) {
    const d = k.startsWith(w) && w.length >= 3 ? 0.5 : levenshtein(w, k);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best !== undefined && bestD <= (w.length <= 4 ? 1 : Math.max(2, Math.floor(w.length / 3))) ? best : undefined;
}

/* ------------------------------------------------------------------ parser */

const describe = (t: Token | undefined) =>
  !t ? "the end" : t.kind === "num" ? `the number ${t.text}` : t.kind === "name" ? `'${t.text}'` : `'${t.text}'`;

/**
 * Parses a formula. `names` is the list of metric names allowed here (lower-case keys); unknown names, prefixes and
 * functions raise a FormulaError with the character position and, when possible, a "did you mean" suggestion.
 */
export function parse(src: string, names: string[]): Node {
  const toks = tokenize(src).filter((t) => t.kind !== "space");
  const bad = toks.find((t) => t.kind === "bad");
  if (bad) throw new FormulaError(`'${bad.text}' isn't something a formula understands`, bad.pos, bad.end, "Use numbers, metric names, + − × ÷ ^ and ( ).");
  if (!toks.length) throw new FormulaError("Type a formula — for example 2*mae + mse", 0, 1);
  const known = new Set(names);
  let i = 0;
  const peek = () => toks[i];
  const endPos = src.length;

  const expectOperand = (after: Token | undefined): never => {
    const t = peek();
    if (!t) throw new FormulaError(after ? `Something is missing after '${after.text}'` : "The formula ends too early", endPos, endPos + 1, "Add a number or a metric name.");
    if (t.kind === "rp") throw new FormulaError(after?.kind === "lp" ? "Empty brackets ( )" : `Something is missing before ')'`, t.pos, t.end);
    throw new FormulaError(`Expected a number or a metric name, found ${describe(t)}`, t.pos, t.end);
  };

  function expr(): Node {
    let a = term();
    while (peek()?.kind === "op" && (peek().text === "+" || peek().text === "-")) {
      const op = toks[i++];
      const b = term();
      a = { k: "bin", op: op.text as "+" | "-", a, b, pos: a.pos, end: b.end };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t?.kind === "op" && (t.text === "*" || t.text === "/")) {
        i++;
        const b = unary();
        a = { k: "bin", op: t.text as "*" | "/", a, b, pos: a.pos, end: b.end };
      } else if (t && (t.kind === "num" || t.kind === "name" || t.kind === "lp")) {
        // two operands side by side: "2mae", "2 mae" or "mae (…)"
        const prev = toks[i - 1];
        throw new FormulaError(`Missing an operator between '${prev.text}' and '${t.text}'`, t.pos, t.end, `Did you mean ${prev.text}*${t.text}?`,
          { pos: prev.end, end: t.pos, text: "*", label: `Use ${prev.text}*${t.text}` });
      } else return a;
    }
  }
  function unary(): Node {
    const t = peek();
    if (t?.kind === "op" && (t.text === "-" || t.text === "+")) {
      i++;
      const a = unary();
      return t.text === "-" ? { k: "neg", a, pos: t.pos, end: a.end } : a;
    }
    return power();
  }
  function power(): Node {
    const a = primary();
    const t = peek();
    if (t?.kind === "op" && t.text === "^") {
      i++;
      const b = unary(); // right-associative; allows 2^-1
      return { k: "bin", op: "^", a, b, pos: a.pos, end: b.end };
    }
    return a;
  }
  function primary(): Node {
    const t = peek();
    const before = toks[i - 1];
    if (!t || t.kind === "rp" || t.kind === "op" || t.kind === "comma") {
      if (t?.kind === "op") throw new FormulaError(`'${t.text}' needs something on its left`, t.pos, t.end);
      if (t?.kind === "comma") throw new FormulaError("A comma only goes between a function's inputs, like max(a, b)", t.pos, t.end);
      return expectOperand(before);
    }
    if (t.kind === "num") {
      i++;
      return { k: "num", v: t.value!, pos: t.pos, end: t.end };
    }
    if (t.kind === "lp") {
      i++;
      if (peek()?.kind === "rp") throw new FormulaError("Empty brackets ( )", t.pos, peek().end);
      const e = expr();
      const close = peek();
      if (close?.kind !== "rp") {
        if (!close) throw new FormulaError("Missing ')'", endPos, endPos + 1, `The '(' at position ${t.pos + 1} is never closed.`, { pos: endPos, end: endPos, text: ")", label: "Add the ')'" });
        throw new FormulaError(`Expected ')' but found ${describe(close)}`, close.pos, close.end);
      }
      i++;
      return { ...e, pos: t.pos, end: close.end } as Node;
    }
    // a name: function call or metric
    i++;
    const raw = t.text;
    const lower = raw.toLowerCase();
    if (peek()?.kind === "lp") {
      const fn = lower as FnName;
      if (!(fn in FUNCTIONS)) {
        const s = suggest(lower, Object.keys(FUNCTIONS));
        throw new FormulaError(`Unknown function '${raw}'${s ? ` — did you mean ${s}?` : ""}`, t.pos, t.end, `Functions: ${Object.keys(FUNCTIONS).join(", ")}.`,
          s ? { pos: t.pos, end: t.end, text: s, label: `Use ${s}` } : undefined);
      }
      const lp = toks[i++];
      const args: Node[] = [];
      if (peek()?.kind !== "rp") {
        for (;;) {
          args.push(expr());
          if (peek()?.kind === "comma") { i++; continue; }
          break;
        }
      }
      const close = peek();
      if (close?.kind !== "rp") {
        if (!close) throw new FormulaError("Missing ')'", endPos, endPos + 1, `${fn}( at position ${lp.pos + 1} is never closed.`, { pos: endPos, end: endPos, text: ")", label: "Add the ')'" });
        throw new FormulaError(`Expected ',' or ')' but found ${describe(close)}`, close.pos, close.end);
      }
      i++;
      const [lo, hi, help] = FUNCTIONS[fn];
      if (args.length < lo || args.length > hi) {
        throw new FormulaError(`${fn} takes ${lo === hi ? lo : `at least ${lo}`} input${lo === 1 && hi === 1 ? "" : "s"}, got ${args.length}`, t.pos, close.end, help);
      }
      return { k: "call", fn, args, pos: t.pos, end: close.end };
    }
    let scope: Scope | null = null;
    let name = lower;
    const dot = lower.indexOf(".");
    if (dot >= 0) {
      const pre = lower.slice(0, dot);
      name = lower.slice(dot + 1);
      if (pre !== "train" && pre !== "test") {
        const s = suggest(pre, ["train", "test"]);
        throw new FormulaError(`Unknown prefix '${raw.slice(0, dot)}.'${s ? ` — did you mean ${s}.?` : ""}`, t.pos, t.pos + dot + 1, "Only train. (scores on the practice rows) and test. (the default) are allowed.",
          s ? { pos: t.pos, end: t.pos + dot, text: s, label: `Use ${s}.` } : undefined);
      }
      scope = pre;
      if (name.includes(".")) throw new FormulaError(`'${raw}' has too many dots`, t.pos, t.end);
    }
    name = ALIASES[name] ?? name;
    if (lower in FUNCTIONS && !scope) throw new FormulaError(`${lower} is a function — write ${lower}(…)`, t.pos, t.end, FUNCTIONS[lower as FnName][2], { pos: t.end, end: t.end, text: "()", label: `Add ( )` });
    if (!known.has(name)) {
      const s = suggest(name, names);
      const off = dot >= 0 ? dot + 1 : 0;
      throw new FormulaError(`Unknown name '${raw.slice(off)}'${s ? ` — did you mean ${s}?` : ""}`, t.pos + off, t.end, s ? undefined : `Available here: ${names.join(", ")}.`,
        s ? { pos: t.pos + off, end: t.end, text: s, label: `Use ${s}` } : undefined);
    }
    return { k: "var", name, raw, scope, pos: t.pos, end: t.end };
  }

  const root = expr();
  const extra = peek();
  if (extra) {
    if (extra.kind === "rp") throw new FormulaError("There's a ')' without a matching '('", extra.pos, extra.end);
    if (extra.kind === "comma") throw new FormulaError("A comma only goes between a function's inputs, like max(a, b)", extra.pos, extra.end);
    throw new FormulaError(`Unexpected ${describe(extra)}`, extra.pos, extra.end);
  }
  return root;
}

/* ------------------------------------------------------------------ evaluation */

export type Lookup = (name: string, scope: Scope) => number | null | undefined;
export interface EvalResult { value: number | null; missing?: { name: string; scope: Scope }; problem?: string }

/** Evaluates a parsed formula. Unprefixed names read `defaultScope`. Missing metrics give value null (with which one). */
export function evaluate(node: Node, lookup: Lookup, defaultScope: Scope = "test"): EvalResult {
  class Missing {
    name: string;
    scope: Scope;
    constructor(name: string, scope: Scope) { this.name = name; this.scope = scope; }
  }
  const go = (n: Node): number => {
    switch (n.k) {
      case "num": return n.v;
      case "var": {
        const scope = n.scope ?? defaultScope;
        const v = lookup(n.name, scope);
        if (v === null || v === undefined || Number.isNaN(v)) throw new Missing(n.name, scope);
        return v;
      }
      case "neg": return -go(n.a);
      case "bin": {
        const a = go(n.a), b = go(n.b);
        return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b : Math.pow(a, b);
      }
      case "call": {
        const v = n.args.map(go);
        switch (n.fn) {
          case "abs": return Math.abs(v[0]);
          case "sqrt": return Math.sqrt(v[0]);
          case "log": return Math.log(v[0]);
          case "exp": return Math.exp(v[0]);
          case "min": return Math.min(...v);
          case "max": return Math.max(...v);
          case "pow": return Math.pow(v[0], v[1]);
        }
      }
    }
    return NaN;
  };
  try {
    const v = go(node);
    if (Number.isNaN(v)) return { value: null, problem: "The result isn't a number (for example the square root or log of a negative value)." };
    if (!Number.isFinite(v)) return { value: null, problem: "The result is infinite (probably a division by zero)." };
    return { value: v };
  } catch (e) {
    if (e instanceof Missing) return { value: null, missing: { name: e.name, scope: e.scope } };
    throw e;
  }
}

/** Every metric a formula reads, with its scope (unprefixed = test). */
export function variables(node: Node): { name: string; scope: Scope }[] {
  const out: { name: string; scope: Scope }[] = [];
  const walk = (n: Node) => {
    if (n.k === "var") { if (!out.some((o) => o.name === n.name && o.scope === (n.scope ?? "test"))) out.push({ name: n.name, scope: n.scope ?? "test" }); }
    else if (n.k === "neg") walk(n.a);
    else if (n.k === "bin") { walk(n.a); walk(n.b); }
    else if (n.k === "call") n.args.forEach(walk);
  };
  walk(node);
  return out;
}

/**
 * How each metric pushes the formula: +1 = the formula grows when the metric grows, −1 = it shrinks, with a rough weight
 * (the size of a constant multiplier). Used to guess "lower/higher is better" and the closest built-in metric.
 */
export function influences(node: Node): { name: string; scope: Scope; sign: number; weight: number }[] {
  const out: { name: string; scope: Scope; sign: number; weight: number }[] = [];
  const constOf = (n: Node): number | null => (n.k === "num" ? n.v : n.k === "neg" ? (constOf(n.a) === null ? null : -constOf(n.a)!) : null);
  const walk = (n: Node, sign: number, weight: number) => {
    if (n.k === "var") out.push({ name: n.name, scope: n.scope ?? "test", sign, weight });
    else if (n.k === "neg") walk(n.a, -sign, weight);
    else if (n.k === "bin") {
      if (n.op === "+") { walk(n.a, sign, weight); walk(n.b, sign, weight); }
      else if (n.op === "-") { walk(n.a, sign, weight); walk(n.b, -sign, weight); }
      else if (n.op === "*") {
        const ca = constOf(n.a), cb = constOf(n.b);
        if (ca !== null) walk(n.b, sign * Math.sign(ca || 1), weight * Math.abs(ca));
        else if (cb !== null) walk(n.a, sign * Math.sign(cb || 1), weight * Math.abs(cb));
        else { walk(n.a, sign, weight); walk(n.b, sign, weight); }
      } else if (n.op === "/") {
        const cb = constOf(n.b);
        walk(n.a, sign * (cb !== null ? Math.sign(cb || 1) : 1), cb ? weight / Math.abs(cb) : weight);
        walk(n.b, -sign, weight);
      } else { walk(n.a, sign, weight); walk(n.b, sign, weight); }
    } else if (n.k === "call") n.args.forEach((a) => walk(a, sign, weight));
  };
  walk(node, 1, 1);
  return out;
}

/** Re-prints a formula with display names (e.g. "2 × MAE + MSE"). */
export function pretty(node: Node, label: (name: string) => string = (n) => n): string {
  const prec = (n: Node) => (n.k === "bin" ? (n.op === "+" || n.op === "-" ? 1 : n.op === "^" ? 3 : 2) : n.k === "neg" ? 2.5 : 4);
  const wrap = (n: Node, p: number) => (prec(n) < p ? `(${go(n)})` : go(n));
  const go = (n: Node): string => {
    switch (n.k) {
      case "num": return String(n.v);
      case "var": return (n.scope === "train" ? "train " : n.scope === "test" ? "test " : "") + label(n.name);
      case "neg": return `−${wrap(n.a, 3)}`;
      case "call": return `${n.fn}(${n.args.map(go).join(", ")})`;
      case "bin": {
        const p = prec(n);
        const sym = n.op === "*" ? " × " : n.op === "/" ? " ÷ " : n.op === "-" ? " − " : n.op === "^" ? "^" : " + ";
        if (n.op === "*" && n.a.k === "num" && n.b.k !== "num") return `${go(n.a)}×${wrap(n.b, p)}`;
        return `${wrap(n.a, p)}${sym}${wrap(n.b, n.op === "-" || n.op === "/" ? p + 0.5 : n.op === "^" ? p : p)}`;
      }
    }
  };
  return go(node);
}
