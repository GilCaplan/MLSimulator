/* Tiny illustrations of each control renderer / orientation for the picker cards (64×28, drawn with template variables). */
import type { ReactElement } from "react";

const ACC = "var(--accent)";
const FILL = "var(--fill-2)";
const SURF = "var(--glass-strong)";
const LINE = "var(--text-3)";
const INK = "var(--text-2)";

const box = (x: number, y: number, w: number, h: number, r = 4, fill = SURF, stroke: string = LINE, sw = 1.2) => (
  <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={sw} />
);

const GLYPHS: Record<string, ReactElement> = {
  slider: (
    <>
      <line x1={4} y1={14} x2={60} y2={14} stroke={FILL} strokeWidth={4} strokeLinecap="round" />
      <line x1={4} y1={14} x2={30} y2={14} stroke={ACC} strokeWidth={4} strokeLinecap="round" />
      <circle cx={30} cy={14} r={7} fill={SURF} stroke={LINE} strokeWidth={1} />
    </>
  ),
  stepper: (
    <>
      {box(2, 5, 18, 18)}
      <line x1={7} y1={14} x2={15} y2={14} stroke={INK} strokeWidth={1.6} />
      <text x={32} y={18.5} textAnchor="middle" fontSize={12} fontWeight={700} fill={INK}>5</text>
      {box(44, 5, 18, 18)}
      <line x1={49} y1={14} x2={57} y2={14} stroke={INK} strokeWidth={1.6} />
      <line x1={53} y1={10} x2={53} y2={18} stroke={INK} strokeWidth={1.6} />
    </>
  ),
  number: (
    <>
      {box(4, 5, 56, 18)}
      <text x={11} y={18} fontSize={11} fontWeight={600} fill={INK}>0.25</text>
      <line x1={38} y1={9} x2={38} y2={19} stroke={ACC} strokeWidth={1.5} />
    </>
  ),
  dropdown: (
    <>
      {box(4, 5, 56, 18)}
      <line x1={10} y1={14} x2={36} y2={14} stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <path d="M47 12l4 4 4-4" stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </>
  ),
  segmented: (
    <>
      {box(1, 6, 62, 16, 5, FILL, "none")}
      {box(22, 8, 20, 12, 4, ACC, "none")}
      <line x1={7} y1={14} x2={16} y2={14} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={48} y1={14} x2={57} y2={14} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  radio: (
    <>
      <circle cx={8} cy={8} r={5} fill={SURF} stroke={ACC} strokeWidth={1.5} />
      <circle cx={8} cy={8} r={2.5} fill={ACC} />
      <line x1={18} y1={8} x2={46} y2={8} stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={8} cy={21} r={5} fill={SURF} stroke={LINE} strokeWidth={1.2} />
      <line x1={18} y1={21} x2={40} y2={21} stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),
  chips: (
    <>
      {box(1, 2, 22, 11, 5.5, ACC, "none")}
      {box(26, 2, 30, 11, 5.5)}
      {box(1, 16, 30, 11, 5.5)}
      {box(34, 16, 18, 11, 5.5)}
    </>
  ),
  cards: (
    <>
      {box(1, 3, 19, 22, 4, SURF, ACC, 1.8)}
      {box(23, 3, 19, 22)}
      {box(45, 3, 18, 22)}
      <line x1={5} y1={19} x2={15} y2={19} stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10.5} cy={10} r={3} fill={ACC} />
    </>
  ),
  switch: (
    <>
      {box(16, 5, 32, 18, 9, ACC, "none")}
      <circle cx={39} cy={14} r={7} fill="#fff" />
    </>
  ),
  checkbox: (
    <>
      {box(4, 6, 16, 16, 3.5, ACC, "none")}
      <path d="M8 14l3 3 5-6" stroke="var(--accent-contrast)" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={26} y1={14} x2={56} y2={14} stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  yesno: (
    <>
      {box(4, 6, 56, 16, 5, FILL, "none")}
      {box(32, 8, 26, 12, 4, ACC, "none")}
      <text x={18} y={17.5} textAnchor="middle" fontSize={9} fontWeight={600} fill={INK}>No</text>
      <text x={45} y={17.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--accent-contrast)">Yes</text>
    </>
  ),
  horizontal: (
    <>
      {box(1, 8, 19, 12, 3)}
      {box(23, 8, 19, 12, 3, ACC, "none")}
      {box(45, 8, 18, 12, 3)}
    </>
  ),
  vertical: (
    <>
      {box(16, 1, 32, 7.5, 2)}
      {box(16, 10.25, 32, 7.5, 2, ACC, "none")}
      {box(16, 19.5, 32, 7.5, 2)}
    </>
  ),
  auto: (
    <>
      {box(1, 2, 26, 11, 3)}
      {box(30, 2, 26, 11, 3, ACC, "none")}
      {box(1, 16, 20, 11, 3)}
      <path d="M44 22h14m-4-4l4 4-4 4" stroke={LINE} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </>
  ),
};

export function Glyph({ name }: { name: string }) {
  return (
    <span className="ap-glyph" aria-hidden>
      <svg width={64} height={28} viewBox="0 0 64 28">{GLYPHS[name] ?? null}</svg>
    </span>
  );
}
