import { motion } from "framer-motion";
import { spring } from "../../design/motion";
import type { ColumnSummary, PipelineSpec } from "../../lib/types";
import { Segmented, Toggle } from "../glass";
import { DEFAULT_PARTS, droppedSources } from "./features/featureOps";
import { STAGE_ICONS, stageState } from "./FlowStrip";
import { Note, StageCard, SubHead, type StageId } from "./StageCard";
import { AUTO_IGNORED, fmtInt, patchPipeline, type PrepCtx } from "./state";

export interface CardProps { ctx: PrepCtx; open: boolean; onToggle: () => void; flash?: boolean; /** open + scroll to another stage */ onJump?: (id: StageId) => void }

const ROLE_ICON: Record<ColumnSummary["role"], string> = { numeric: "🔢", categorical: "🏷️", id: "🪪", text: "📝", datetime: "📅" };

export function CleanCard({ ctx, open, onToggle, flash, onJump }: CardProps) {
  const { spec, columns, used, targetCol } = ctx;
  const drop = new Set(spec.drop_columns);
  const steps = spec.features ?? [];
  const dated = new Set(steps.filter((s) => s.op === "date_parts").map((s) => s.column));
  const replaced = new Set(steps.flatMap(droppedSources));
  const groupCol = spec.split.method === "group" ? spec.split.group_column : null;
  const makeParts = (name: string) => {
    if (!dated.has(name)) patchPipeline("features", [...steps, { op: "date_parts", column: name, parts: [...DEFAULT_PARTS], drop_source: true }]);
    onJump?.("features");
  };
  const missNum = used.filter((c) => c.role === "numeric").reduce((a, c) => a + c.missing, 0);
  const missCat = used.filter((c) => c.role !== "numeric").reduce((a, c) => a + c.missing, 0);
  const ignored = columns.filter((c) => drop.has(c.name) || AUTO_IGNORED.has(c.role)).length;
  const toggle = (name: string) =>
    patchPipeline("drop_columns", drop.has(name) ? spec.drop_columns.filter((c) => c !== name) : [...spec.drop_columns, name]);

  return (
    <StageCard
      id="clean" icon={STAGE_ICONS.clean} title="Clean" open={open} onToggle={onToggle} flash={flash}
      summary={`${stageState("clean", spec, false)}${ignored ? ` · ${ignored} ignored` : ""}`}
      why="Models can't handle blanks, and some columns (like IDs) only add noise. Here we tidy both."
      info="Missing values are filled using the training rows only, so no information leaks in from the test set. ID-like and free-text columns are ignored automatically because they rarely generalise."
    >
      <div className="col" style={{ gap: 10 }}>
        <SubHead info="Click a column to leave it out. Columns that look like IDs or free text are skipped automatically.">Columns the models may use</SubHead>
        {columns.length === 0 ? (
          <div className="skeleton" style={{ height: 34 }} />
        ) : (
          <div className="row wrap" style={{ gap: 6 }}>
            {columns.map((c) => {
              if (c.role === "datetime") {
                const done = dated.has(c.name);
                return (
                  <motion.button
                    key={c.name} layout whileTap={{ scale: 0.94 }} transition={spring.snappy}
                    onClick={() => makeParts(c.name)}
                    title={done ? "Already turned into date parts — click to see them" : "Models can't read raw dates — click to turn it into month, weekday and hour"}
                    style={{ ...chipStyle(false), borderStyle: "dashed", borderColor: done ? "var(--success)" : "var(--accent)", color: "var(--text)", cursor: "pointer" }}
                  >
                    <span>{ROLE_ICON.datetime}</span>
                    <span style={{ fontWeight: 560 }}>{c.name}</span>
                    <span className="tiny" style={{ color: done ? "var(--success)" : "var(--accent)", fontWeight: 600 }}>{done ? "→ date parts ✓" : "→ make date parts"}</span>
                  </motion.button>
                );
              }
              const isGroup = c.name === groupCol;
              const isReplaced = replaced.has(c.name) && !drop.has(c.name);
              const auto = AUTO_IGNORED.has(c.role) || isGroup;
              const off = auto || drop.has(c.name) || isReplaced;
              return (
                <motion.button
                  key={c.name}
                  layout
                  disabled={auto}
                  onClick={() => toggle(c.name)}
                  whileTap={auto ? undefined : { scale: 0.94 }}
                  transition={spring.snappy}
                  title={isGroup ? "Used to keep groups together in the split — never shown to the models" : auto ? "Looks like an ID or free text — ignored automatically" : isReplaced ? "Replaced by an engineered feature (Create features)" : off ? "Ignored — click to use it" : "Used — click to ignore it"}
                  style={{ ...chipStyle(off), cursor: auto ? "not-allowed" : "pointer", textDecoration: off && !auto && !isReplaced ? "line-through" : "none" }}
                >
                  <span>{isGroup ? "👥" : ROLE_ICON[c.role]}</span>
                  <span style={{ fontWeight: 560 }}>{c.name}</span>
                  {c.missing > 0 && !off && <span className="badge warning" style={{ fontSize: 10, padding: "0 6px" }}>{fmtInt(c.missing)} blank</span>}
                  {isGroup ? <span className="tiny faint">group id</span> : auto ? <span className="tiny faint">auto-ignored</span> : isReplaced ? <span className="tiny faint">→ feature</span> : null}
                  {!off && c.repeats && c.repeats > 1.2 && <span className="tiny" style={{ color: "var(--warning)" }} title="Values repeat across rows — maybe the same person or thing. See Split → Keep groups together.">×{c.repeats.toFixed(1)}</span>}
                </motion.button>
              );
            })}
          </div>
        )}
        {targetCol && targetCol.missing > 0 && (
          <span className="tiny muted">{fmtInt(targetCol.missing)} row(s) have no “{targetCol.name}” value — they're always dropped.</span>
        )}
      </div>

      <Duplicates ctx={ctx} />

      <div className="row wrap" style={{ gap: 10 }}>
        <MissingTile label="blank numbers" n={missNum} />
        <MissingTile label="blank categories" n={missCat} />
      </div>
      {missNum + missCat === 0 && ctx.dataset && <Note icon="✨">No blanks in the columns you're using — these settings only matter for future data with gaps.</Note>}

      <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 8 }}>
          <SubHead info="Median is robust to extreme values; mean is the average; ‘most common’ uses the mode; zero fills with 0; drop removes any row with a blank (you lose data).">Fill blank numbers with</SubHead>
          <Segmented<PipelineSpec["impute"]["numeric"]> kind="form"
            size="sm"
            value={spec.impute.numeric}
            onChange={(v) => patchPipeline("impute", { numeric: v })}
            options={[
              { value: "median", label: "Median" },
              { value: "mean", label: "Mean" },
              { value: "most_frequent", label: "Most common" },
              { value: "zero", label: "Zero" },
              { value: "drop_rows", label: "Drop rows" },
            ]}
          />
        </div>
        <div className="col" style={{ gap: 8 }}>
          <SubHead info="‘Most common’ fills with the category seen most often. ‘Missing’ keeps blanks as their own category — useful when a blank itself means something.">Fill blank categories with</SubHead>
          <Segmented<PipelineSpec["impute"]["categorical"]> kind="form"
            size="sm"
            value={spec.impute.categorical}
            onChange={(v) => patchPipeline("impute", { categorical: v })}
            options={[{ value: "most_frequent", label: "Most common" }, { value: "constant", label: "A “missing” label" }]}
          />
        </div>
      </div>
    </StageCard>
  );
}

function MissingTile({ label, n }: { label: string; n: number }) {
  return (
    <div className="inset row" style={{ padding: "8px 12px", gap: 8 }}>
      <span style={{ fontSize: 15 }}>{n ? "🕳️" : "✅"}</span>
      <b className="num" style={{ fontSize: 15, color: n ? "var(--warning)" : "var(--success)" }}>{fmtInt(n)}</b>
      <span className="small muted">{label}</span>
    </div>
  );
}

const chipStyle = (off: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12.5,
  border: `1px solid ${off ? "var(--hairline)" : "var(--accent)"}`, background: off ? "transparent" : "var(--accent-soft)",
  color: off ? "var(--text-3)" : "var(--text)",
});

/** Exact duplicate rows: count + "remove" switch, with a tiny two-identical-rows illustration. */
function Duplicates({ ctx }: { ctx: CardProps["ctx"] }) {
  const n = ctx.dataset?.n_duplicates ?? 0;
  const on = !!ctx.spec.dedupe?.enabled;
  const found = ctx.report?.duplicates_found;
  if (!ctx.dataset) return null;
  return (
    <div className="inset row wrap" style={{ padding: "12px 14px", gap: 14 }}>
      <DupRows on={on} has={n > 0} />
      <div className="col grow" style={{ gap: 3, minWidth: 200, flex: "1 1 220px" }}>
        <span className="row" style={{ gap: 8 }}>
          <b className="num" style={{ fontSize: 15, color: n ? "var(--warning)" : "var(--success)" }}>{n ? fmtInt(n) : "No"}</b>
          <span className="small">exact duplicate row{n === 1 ? "" : "s"}{n ? "" : " — nice"}</span>
          {found !== undefined && found > 0 && (
            <span className={`badge ${on ? "success" : "warning"}`} style={{ fontSize: 10.5 }}>last run: {on ? `removed ${fmtInt(found)}` : `kept ${fmtInt(found)}`}</span>
          )}
        </span>
        <span className="tiny muted" style={{ lineHeight: 1.45 }}>Copies can sit in both train and test, so the model is tested on answers it memorised.</span>
      </div>
      <Toggle label={<span className="small">Remove exact duplicates</span>} checked={on} onChange={(v) => patchPipeline("dedupe", { enabled: v })} />
    </div>
  );
}

function DupRows({ on, has }: { on: boolean; has: boolean }) {
  const row = (fill: string) => (
    <div className="row" style={{ gap: 3 }}>
      {[18, 12, 22, 10].map((w, i) => <span key={i} style={{ width: w, height: 7, borderRadius: 3, background: fill }} />)}
    </div>
  );
  return (
    <div className="col" style={{ gap: 4, width: 82, position: "relative", flexShrink: 0 }}>
      {row(has ? "var(--accent)" : "var(--fill-2)")}
      <motion.div animate={{ x: on ? 22 : 0, opacity: on ? 0.25 : 1 }} transition={spring.gentle} style={{ position: "relative" }}>
        {row(has ? "var(--accent)" : "var(--fill-2)")}
        <motion.span initial={false} animate={{ scaleX: on ? 1 : 0 }} transition={spring.snappy}
          style={{ position: "absolute", left: -2, right: -2, top: 3, height: 1.5, background: "var(--danger)", transformOrigin: "left" }} />
      </motion.div>
      {row("var(--fill-2)")}
    </div>
  );
}
