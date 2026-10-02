import { useMemo, useState } from "react";
import { Segmented } from "../../glass";
import { useSize } from "../../charts";
import { withAlpha } from "../../../lib/colors";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, pct, rng, useDone } from "./shared";

type Mode = "raw" | "drop" | "fill";
interface Patient { id: number; readmit: boolean; a1c: boolean; bmi: boolean; complete: boolean }

const N = 120;
const sig = (x: number) => 1 / (1 + Math.exp(-x));

/** Sicker patients are both more likely to be readmitted and more likely to have had the HbA1c test ordered. */
function makePatients(): Patient[] {
  const r = rng(3);
  const out: Patient[] = [];
  for (let i = 0; i < N; i++) {
    const severity = r();
    const readmit = r() < sig(9 * (severity - 0.78));
    const a1c = r() < sig(10 * (severity - 0.62));
    const bmi = r() > 0.12;
    out.push({ id: i, readmit, a1c, bmi, complete: a1c && bmi });
  }
  return out;
}

export function MissingDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [mode, setMode] = useState<Mode>("raw");
  const [ref, { width }] = useSize<HTMLDivElement>();
  const patients = useMemo(makePatients, []);

  const stats = useMemo(() => {
    const kept = mode === "drop" ? patients.filter((p) => p.complete) : patients;
    const rate = (ps: Patient[]) => (ps.length ? ps.filter((p) => p.readmit).length / ps.length : 0);
    const blanks = patients.reduce((a, p) => a + (p.a1c ? 0 : 1) + (p.bmi ? 0 : 1), 0);
    const missingA1c = patients.filter((p) => !p.a1c).length;
    return { kept: kept.length, keptRate: rate(kept), allRate: rate(patients), blanks, missingA1c };
  }, [patients, mode]);

  const cols = width < 520 ? 12 : 15;
  const rows = Math.ceil(N / cols);
  const cell = width ? Math.min(58, width / cols) : 0;
  const card = cell - Math.max(4, cell * 0.12);
  const gridW = cell * cols;
  const offsetX = (width - gridW) / 2;

  // Position of each patient: original grid, or packed together when incomplete rows are dropped
  // (the dropped ones shrink into a faded "thrown away" pile underneath).
  const layout = useMemo(() => {
    const keep = new Map<number, number>();
    const bin = new Map<number, number>();
    let k = 0, b = 0;
    for (const p of patients) {
      if (mode !== "drop") keep.set(p.id, p.id);
      else if (p.complete) keep.set(p.id, k++);
      else bin.set(p.id, b++);
    }
    return { keep, bin, keptRows: Math.ceil(k / cols) };
  }, [patients, mode, cols]);
  const small = cell * 0.56;
  const binCols = Math.max(1, Math.floor(gridW / small));
  const binTop = (layout.keptRows + 0.75) * cell;

  const change = (m: Mode) => { setMode(m); if (m !== "raw") done(); };
  const dropped = N - stats.kept;

  const caption =
    mode === "raw" ? (
      <>Hollow dots are blanks. <b>{stats.missingA1c} of {N}</b> patients never had the HbA1c test — mostly the healthier ones nobody was worried about.</>
    ) : mode === "drop" ? (
      <>Only <b>{stats.kept} of {N}</b> patients survive, and <b>{pct(stats.keptRate)}</b> of them were readmitted versus <b>{pct(stats.allRate)}</b> of everyone — a model trained here thinks everybody is sick.</>
    ) : (
      <>Every patient stays. Each blank gets the column's median (amber), and the readmission rate matches the real population: <b>{pct(stats.allRate)}</b>.</>
    );

  return (
    <DemoFrame
      controls={
        <>
          <Segmented value={mode} onChange={change} options={[
            { value: "raw", label: "Raw data" },
            { value: "drop", label: "Drop incomplete rows" },
            { value: "fill", label: "Fill with median" },
          ]} />
          <span className="small faint">Each card = one patient · left dot HbA1c test · right dot BMI</span>
        </>
      }
      stats={
        <>
          <Stat label="Patients kept" value={stats.kept} format={(v) => `${Math.round(v)} / ${N}`} color={mode === "drop" ? C.warn : undefined} />
          <Stat label="Readmitted · kept rows" value={stats.keptRate} color={C.pos} emphasis={mode === "drop"} sub="what the model learns from" />
          <Stat label="Readmitted · everyone" value={stats.allRate} sub="the patients it will meet" />
          <Stat label={mode === "fill" ? "Blanks filled" : "Blank cells"} value={mode === "drop" ? 0 : stats.blanks} format={(v) => String(Math.round(v))} color={mode === "fill" ? "#C9A100" : undefined} />
        </>
      }
      caption={caption}
      captionKey={mode}
    >
      <div className="inset" style={{ padding: 14 }}>
        <div ref={ref} style={{ position: "relative", width: "100%", height: rows * cell }}>
          {width > 0 && patients.map((p) => {
            const slot = layout.keep.get(p.id);
            const binned = slot === undefined;
            const bi = layout.bin.get(p.id) ?? 0;
            const x = binned ? offsetX + (bi % binCols) * small - (card - card * 0.5) / 2 : offsetX + (slot! % cols) * cell;
            const y = binned ? binTop + 22 + Math.floor(bi / binCols) * small - (card - card * 0.5) / 2 : Math.floor(slot! / cols) * cell;
            const s = slot ?? p.id;
            const base = p.readmit ? C.pos : C.neg;
            const delay = binned ? 80 + (bi % 23) * 12 : (s % cols) * 9 + Math.floor(s / cols) * 18;
            return (
              <div key={p.id}
                title={`${p.readmit ? "Readmitted" : "Not readmitted"} · HbA1c ${p.a1c ? "measured" : "missing"} · BMI ${p.bmi ? "measured" : "missing"}`}
                style={{
                  position: "absolute", left: 0, top: 0, width: card, height: card, borderRadius: card * 0.26,
                  transform: binned ? `translate(${x}px, ${y}px) scale(0.5)` : `translate(${x}px, ${y}px)`,
                  opacity: binned ? 0.38 : 1,
                  transition: `transform .75s var(--ease) ${delay}ms, opacity .45s ease ${delay}ms`,
                  background: `linear-gradient(160deg, ${withAlpha(base, 0.95)}, ${withAlpha(base, 0.72)})`,
                  boxShadow: `0 1px 0 rgba(255,255,255,0.35) inset, 0 3px 10px ${withAlpha(base, 0.28)}`,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: card * 0.12,
                }}>
                <Slot size={card * 0.27} present={p.a1c} mode={mode} />
                <Slot size={card * 0.27} present={p.bmi} mode={mode} />
              </div>
            );
          })}
          {mode === "drop" && width > 0 && (
            <div className="small" style={{ position: "absolute", left: offsetX, right: 0, top: binTop, color: "var(--text-2)", animation: "mlpRiseIn .6s .5s both" }}>
              🗑️ Thrown away: <b>{dropped}</b> patients — mostly ones who went home and stayed home
            </div>
          )}
          <style>{`@keyframes mlpRiseIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
        </div>
      </div>
      <Legend items={[
        { color: C.pos, label: "Readmitted within 30 days", shape: "square" },
        { color: C.neg, label: "Not readmitted", shape: "square" },
        { color: "var(--text-3)", label: "Hollow = blank", shape: "ring" },
        { color: C.amber, label: "Filled with the median" },
      ]} />
    </DemoFrame>
  );
}

function Slot({ size, present, mode }: { size: number; present: boolean; mode: Mode }) {
  const filled = !present && mode === "fill";
  return (
    <span style={{
      width: size, height: size, borderRadius: size, boxSizing: "border-box", flexShrink: 0,
      background: present ? "rgba(255,255,255,0.95)" : filled ? C.amber : "transparent",
      border: present ? "none" : filled ? "1.5px solid rgba(255,255,255,0.9)" : "1.6px solid rgba(255,255,255,0.85)",
      boxShadow: filled ? `0 0 8px ${C.amber}` : "none",
      transform: filled ? "scale(1.12)" : "scale(1)",
      transition: "background .45s, box-shadow .45s, transform .45s cubic-bezier(.34,1.56,.64,1)",
    }} />
  );
}
