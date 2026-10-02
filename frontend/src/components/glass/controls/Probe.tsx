import { useCallback, useState, type ReactNode } from "react";
import { ReportResolved, type ResolvedInfo } from "./context";

/** Wraps a control and shows a small badge with the renderer it resolved to (and why, when it differs from the pref).
 * `children` may be a render function receiving the info (to place the badge yourself). */
export function ResolvedProbe({ children, badge = true }: { children: ReactNode | ((info: ResolvedInfo | null) => ReactNode); badge?: boolean }) {
  const [info, setInfo] = useState<ResolvedInfo | null>(null);
  const onReport = useCallback((i: ResolvedInfo) => {
    setInfo((cur) => (cur && cur.renderer === i.renderer && cur.reason === i.reason && cur.pref === i.pref && cur.control === i.control ? cur : i));
  }, []);
  return (
    <ReportResolved onReport={onReport}>
      {typeof children === "function" ? children(info) : children}
      {badge && info && <ResolvedBadge info={info} />}
    </ReportResolved>
  );
}

export function ResolvedBadge({ info }: { info: ResolvedInfo }) {
  const changed = info.renderer !== info.pref;
  return (
    <span className="row wrap resolved-badge" style={{ gap: 6, marginTop: 6 }} data-resolved={info.renderer}>
      <span className={`badge ${changed ? "warning" : "accent"}`}>{info.renderer}</span>
      {info.reason && <span className="tiny faint">{info.reason}</span>}
    </span>
  );
}
