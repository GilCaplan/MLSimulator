import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../design/motion";
import type { HyperParam } from "../../lib/types";
import { InfoTip, NumberField } from "../glass";

export interface SpaceEntry { on: boolean; min: number; max: number; values: string[] }
export type SpaceState = Record<string, SpaceEntry>;

const isNum = (hp: HyperParam) => hp.type === "int" || hp.type === "float";

export function initialSpace(params: HyperParam[]): SpaceState {
  const out: SpaceState = {};
  let numericOn = 0;
  for (const hp of params) {
    const on = isNum(hp) && numericOn < 2;
    if (on) numericOn++;
    out[hp.name] = { on, min: hp.min ?? 0, max: hp.max ?? 1, values: hp.options ? [...hp.options] : [] };
  }
  return out;
}

/** Convert the editor state into the backend's search-space format. */
export function toSpace(params: HyperParam[], state: SpaceState): Record<string, any> {
  const space: Record<string, any> = {};
  for (const hp of params) {
    const s = state[hp.name];
    if (!s?.on) continue;
    if (isNum(hp)) space[hp.name] = { min: Math.min(s.min, s.max), max: Math.max(s.min, s.max) };
    else if (hp.type === "choice") { if (s.values.length) space[hp.name] = { values: s.values }; }
    else space[hp.name] = {};
  }
  return space;
}

/** Tick which settings to search, and over what range. */
export function SpaceEditor({ params, state, onChange, disabled }: { params: HyperParam[]; state: SpaceState; onChange: (s: SpaceState) => void; disabled?: boolean }) {
  const set = (name: string, patch: Partial<SpaceEntry>) => onChange({ ...state, [name]: { ...state[name], ...patch } });
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 10 }}>
      {params.map((hp) => {
        const s = state[hp.name];
        if (!s) return null;
        return (
          <motion.div key={hp.name} layout className="inset col" transition={spring.snappy}
            style={{ padding: 12, gap: 8, borderColor: s.on ? "var(--accent)" : undefined, background: s.on ? "var(--accent-soft)" : undefined, opacity: disabled ? 0.6 : 1, transition: "background .2s, border-color .2s" }}>
            <label className="row" style={{ gap: 8, cursor: disabled ? "default" : "pointer" }}>
              <motion.span animate={{ scale: s.on ? [1, 1.25, 1] : 1, background: s.on ? "var(--accent)" : "var(--fill-2)" }} transition={{ duration: 0.25 }}
                style={{ width: 18, height: 18, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-contrast)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {s.on ? "✓" : ""}
              </motion.span>
              <input type="checkbox" checked={s.on} disabled={disabled} onChange={(e) => set(hp.name, { on: e.target.checked })} style={{ display: "none" }} />
              <b className="grow truncate" style={{ fontSize: 13 }}>{hp.label}</b>
              <InfoTip text={hp.help} />
            </label>
            <AnimatePresence initial={false}>
              {s.on && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.snappy} style={{ overflow: "hidden" }}>
                  {isNum(hp) ? (
                    <div className="row" style={{ gap: 6 }}>
                      <span className="tiny faint">from</span>
                      <NumberField value={s.min} min={hp.min} max={hp.max} step={hp.type === "int" ? 1 : hp.step ?? 0.001} onChange={(v) => set(hp.name, { min: hp.type === "int" ? Math.round(v) : v })} width={92} />
                      <span className="tiny faint">to</span>
                      <NumberField value={s.max} min={hp.min} max={hp.max} step={hp.type === "int" ? 1 : hp.step ?? 0.001} onChange={(v) => set(hp.name, { max: hp.type === "int" ? Math.round(v) : v })} width={92} />
                      {hp.log && <span className="tiny faint" title="Values are tried evenly on a log scale">log</span>}
                    </div>
                  ) : hp.type === "choice" ? (
                    <div className="row wrap" style={{ gap: 5 }}>
                      {(hp.options ?? []).map((o) => {
                        const on = s.values.includes(o);
                        return (
                          <motion.button key={o} whileTap={{ scale: 0.92 }} disabled={disabled}
                            onClick={() => set(hp.name, { values: on ? s.values.filter((v) => v !== o) : [...s.values, o] })}
                            className={`badge ${on ? "accent" : ""}`} style={{ border: "none", cursor: "pointer", outline: on ? "1px solid var(--accent)" : "none" }}>
                            {on ? "✓ " : ""}{o}
                          </motion.button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="tiny muted">Tries both on and off.</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
