import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { spring } from "../../design/motion";
import { Segmented, Tooltip } from "../glass";
import { catalogFor, templatesFor, type SupervisedTask, type Template } from "./catalog";
import { labelOf } from "./custom";
import { FUNCTIONS, pretty, tokenize, type FormulaError, type Node } from "./expr";

const OPS: { show: string; insert: string; tip: string }[] = [
  { show: "+", insert: " + ", tip: "add" },
  { show: "−", insert: " - ", tip: "subtract" },
  { show: "×", insert: " * ", tip: "multiply" },
  { show: "÷", insert: " / ", tip: "divide" },
  { show: "^", insert: "^", tip: "power, e.g. mae^2" },
  { show: "( )", insert: "()", tip: "brackets — wrap the selection" },
];
const FNS = ["sqrt", "abs", "log", "exp", "min", "max", "pow"] as const;

/** Formula input with live token colours and an inline error underline, plus chips, operators and templates. */
export function FormulaEditor({ task, formula, onChange, node, error, available, onTemplate }: {
  task: SupervisedTask;
  formula: string;
  onChange: (f: string) => void;
  node?: Node;
  error?: FormulaError;
  /** metrics at least one model of the latest run has (others are dimmed) */
  available: Set<string> | null;
  onTemplate: (t: Template) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<"test" | "train">("test");
  const metrics = catalogFor(task);

  /** Insert text at the caret (or wrap the selection when `wrap` is "fn(" / "("). */
  const insert = (text: string, wrap = false) => {
    const el = input.current;
    const s = el?.selectionStart ?? formula.length;
    const e = el?.selectionEnd ?? s;
    const sel = formula.slice(s, e);
    let ins: string;
    let caret: number;
    if (wrap) {
      const open = text.endsWith("()") ? text.slice(0, -1) : text;
      ins = `${open}${sel}${sel ? ")" : ")"}`;
      caret = s + open.length + sel.length + (sel ? 1 : 0);
    } else {
      const prev = formula.slice(0, s).trimEnd().slice(-1);
      const needsGap = /[\w)]/.test(prev) && /^\w/.test(text);
      ins = `${needsGap ? " + " : ""}${text}`;
      caret = s + ins.length;
    }
    const next = formula.slice(0, s) + ins + formula.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="col" style={{ gap: 6 }}>
        <span className="eyebrow">Start from an idea</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {templatesFor(task).map((t) => (
            <Tooltip key={t.name} content={<><b>{t.name}</b><br /><span className="mono">{t.formula}</span><br />{t.why}</>} width={250}>
              <motion.button type="button" whileTap={{ scale: 0.95 }} className={`btn sm ${formula.replace(/\s/g, "") === t.formula.replace(/\s/g, "") ? "primary" : ""}`} onClick={() => onTemplate(t)}>
                {t.name}
              </motion.button>
            </Tooltip>
          ))}
        </div>
      </div>

      <HighlightedInput inputRef={input} value={formula} onChange={onChange} error={error} />

      {/* no exit animations: while typing fast, a lingering stale message is worse than an instant swap */}
      <div style={{ minHeight: 20 }}>
        {error ? (
          <motion.div key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy}
            className="row wrap small" style={{ gap: 8, color: "var(--danger)", alignItems: "baseline" }} role="alert">
            <span>⚠️ <b>{error.message}</b>{error.pos < formula.length ? <span className="faint"> · at character {error.pos + 1}</span> : null}</span>
            {error.hint && <span className="muted">{error.hint}</span>}
            {error.fix && (
              <button type="button" className="btn sm" onClick={() => {
                const f = error.fix!;
                onChange(formula.slice(0, f.pos) + f.text + formula.slice(f.end));
                input.current?.focus();
              }}>🪄 {error.fix.label}</button>
            )}
          </motion.div>
        ) : node ? (
          <motion.div key="ok" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy}
            className="small row wrap" style={{ gap: 6, color: "var(--text-2)" }}>
            <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Reads as</span>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{pretty(node, (n) => labelOf(task, n))}</span>
          </motion.div>
        ) : null}
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {OPS.map((o) => (
          <Tooltip key={o.show} content={o.tip} width={160}>
            <button type="button" className="btn sm mono" style={{ minWidth: 36, fontSize: 14 }} onClick={() => insert(o.insert, o.insert === "()")}>{o.show}</button>
          </Tooltip>
        ))}
        <span style={{ width: 6 }} />
        {FNS.map((f) => (
          <Tooltip key={f} content={FUNCTIONS[f][2]} width={200}>
            <button type="button" className="btn sm ghost mono" onClick={() => insert(`${f}(`, true)}>{f}( )</button>
          </Tooltip>
        ))}
      </div>

      <div className="col" style={{ gap: 8 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <span className="eyebrow">Metrics you can use · click to insert</span>
          <span className="row" style={{ gap: 6 }}>
            <span className="tiny faint">measured on</span>
            <Segmented size="sm" value={scope} onChange={setScope} options={[{ value: "test", label: "test rows" }, { value: "train", label: "practice rows" }]} />
          </span>
        </div>
        {scope === "train" && <span className="tiny muted">Inserts <span className="mono">train.</span> names — the score on rows the model practised on. Comparing them with test scores shows memorising.</span>}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: 6 }}>
          {metrics.map((m) => {
            const missing = available !== null && !m.extra && !available.has(m.key);
            const ins = scope === "train" && m.key !== "fit_time" && m.key !== "n_params" ? `train.${m.key}` : m.key;
            return (
              <motion.button key={m.key} type="button" whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
                onClick={() => insert(ins)} title={missing ? `${m.label} isn't available for any model in your latest run` : `Insert ${ins}`}
                className="inset col" style={{ padding: "6px 22px 7px 9px", gap: 1, textAlign: "left", cursor: "pointer", alignItems: "flex-start", opacity: missing ? 0.5 : 1, position: "relative" }}>
                <span className="tiny faint" title={m.lower ? "lower is better" : "higher is better"} style={{ position: "absolute", top: 6, right: 8 }}>{m.lower ? "↓" : "↑"}</span>
                <span className="row wrap" style={{ columnGap: 6, rowGap: 0, alignItems: "baseline" }}>
                  <b style={{ fontSize: 12.5 }}>{m.label}</b>
                  <span className="mono faint" style={{ fontSize: 10.5, wordBreak: "break-all" }}>{ins}</span>
                </span>
                <span className="tiny muted" style={{ lineHeight: 1.35 }}>{m.short}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A single-line input whose text is drawn by a coloured layer behind it (tokens + error underline). */
function HighlightedInput({ value, onChange, error, inputRef }: { value: string; onChange: (v: string) => void; error?: FormulaError; inputRef: RefObject<HTMLInputElement | null> }) {
  const layer = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  const sync = () => {
    if (layer.current && inputRef.current) layer.current.scrollLeft = inputRef.current.scrollLeft;
  };
  useLayoutEffect(sync, [value]);
  const toks = tokenize(value);
  const errFrom = error ? Math.min(error.pos, value.length) : -1;
  const errTo = error ? Math.min(error.end, value.length) : -1;
  const pieces: { text: string; color: string; bad: boolean; weight?: number }[] = [];
  toks.forEach((t, ti) => {
    let color = "var(--text)";
    let weight: number | undefined;
    if (t.kind === "num") color = "var(--warning)";
    else if (t.kind === "name") {
      const isFn = toks.slice(ti + 1).find((x) => x.kind !== "space")?.kind === "lp";
      color = isFn ? "var(--accent-2)" : /^(train|test)\./i.test(t.text) ? "var(--accent-2)" : "var(--accent)";
      weight = 600;
    } else if (t.kind === "op" || t.kind === "lp" || t.kind === "rp" || t.kind === "comma") color = "var(--text-2)";
    else if (t.kind === "bad") color = "var(--danger)";
    // split the token around the error range
    const cuts = [t.pos, Math.max(t.pos, Math.min(t.end, errFrom)), Math.max(t.pos, Math.min(t.end, errTo)), t.end];
    for (let i = 0; i < 3; i++) {
      if (cuts[i + 1] > cuts[i]) pieces.push({ text: value.slice(cuts[i], cuts[i + 1]), color, weight, bad: i === 1 });
    }
  });
  const atEnd = !!error && error.pos >= value.length;
  return (
    <div className="input" style={{ position: "relative", height: 44, padding: 0, overflow: "hidden", ...(focus ? { borderColor: "var(--accent)", boxShadow: "0 0 0 4px var(--accent-soft)" } : {}),
      ...(error ? { borderColor: "color-mix(in srgb, var(--danger) 60%, transparent)" } : {}) }}>
      <div ref={layer} aria-hidden style={{ position: "absolute", inset: 0, padding: "0 14px", whiteSpace: "pre", overflow: "hidden", fontFamily: "var(--mono)", fontSize: 15, lineHeight: "42px", pointerEvents: "none" }}>
        {pieces.map((p, i) => (
          <span key={i} style={{ color: p.color, fontWeight: p.weight, ...(p.bad ? { textDecoration: "underline wavy var(--danger)", textUnderlineOffset: 4, background: "color-mix(in srgb, var(--danger) 14%, transparent)", borderRadius: 3 } : {}) }}>{p.text}</span>
        ))}
        {atEnd && <span style={{ textDecoration: "underline wavy var(--danger)", textUnderlineOffset: 4 }}>{"  "}</span>}
        {!value && <span style={{ color: "var(--text-3)" }}>e.g. 2*mae + mse</span>}
      </div>
      <input ref={inputRef} value={value} spellCheck={false} autoComplete="off" autoCapitalize="off" aria-label="Formula" aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)} onScroll={sync} onKeyUp={sync} onSelect={sync} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: "0 14px", border: "none", outline: "none", background: "transparent", color: "transparent", caretColor: "var(--text)",
          fontFamily: "var(--mono)", fontSize: 15, lineHeight: "42px" }} />
    </div>
  );
}
