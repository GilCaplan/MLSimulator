import type { ReactNode } from "react";
import { InfoTip } from "./Tooltip";

/** Label (+ optional help tip and right-hand slot) above a control. */
export function Field({ label, help, children, right }: { label: ReactNode; help?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="col field" style={{ gap: 6 }}>
      <div className="row between" style={{ gap: 6 }}>
        <span className="row field-label" style={{ gap: 6 }}>
          {label}
          {help && <InfoTip text={help} />}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}
