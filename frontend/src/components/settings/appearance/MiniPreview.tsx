import type { ResolvedTheme } from "../../../design/apply";
import type { UIPrefs } from "../../../design/prefs";
import { useSize } from "../../charts";
import { Segmented, Slider, Toggle } from "../../glass";
import { scopeProps } from "./shared";

const noop = () => {};
const pct = (v: number) => `${Math.round(v * 100)}%`;
const LEAF_W = 340;

/** A tiny, live rendering of the app under some prefs: real .glass / .btn / segmented / slider / badge markup inside a
 * scoped data-* element, scaled down to the tile width (the scale sits on a leaf wrapper only). */
export function MiniPreview({ prefs, theme, title = "Train split" }: { prefs: UIPrefs; theme?: ResolvedTheme; title?: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const scale = width ? width / LEAF_W : 0.5;
  const scoped = scopeProps(prefs, theme);
  return (
    <div ref={ref} className="ap-mini bg-swatch" {...scoped} aria-hidden>
      <div className="ap-mini-leaf" style={{ transform: `scale(${scale})` }} inert>
        <div className="glass pad col" style={{ gap: 11 }}>
          <div className="row between" style={{ gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--h1-weight)" as any, fontSize: 19, letterSpacing: "var(--heading-letter)" }}>{title}</span>
            <span className="badge accent">Ready</span>
          </div>
          <Slider fixedRenderer="slider" value={0.3} min={0.05} max={0.5} step={0.01} onChange={noop} format={pct} />
          <Segmented<string>
            fixedRenderer="segmented"
            size="sm"
            full
            value="b"
            onChange={noop}
            options={[{ value: "a", label: "None" }, { value: "b", label: "Standard" }, { value: "c", label: "Robust" }]}
          />
          <div className="row" style={{ gap: 8 }}>
            <Toggle fixedRenderer="switch" checked onChange={noop} />
            <span className="badge">3 models</span>
            <div className="grow" />
            <button className="btn sm" tabIndex={-1}>Back</button>
            <button className="btn primary sm" tabIndex={-1}>Train</button>
          </div>
        </div>
      </div>
    </div>
  );
}
