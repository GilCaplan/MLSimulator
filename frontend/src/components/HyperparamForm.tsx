import type { HyperParam } from "../lib/types";
import { Field, Segmented, Select, Slider, Toggle } from "./glass";

/** Renders any model's settings generically from the registry's hyperparameter schema. */
export function HyperparamForm({ params, values, onChange, columns = 1 }: {
  params: HyperParam[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  columns?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: "16px 22px" }}>
      {params.map((hp) => {
        const v = values[hp.name] ?? hp.default;
        if (hp.type === "bool") return <Toggle key={hp.name} label={hp.label} help={hp.help} checked={!!v} onChange={(x) => onChange(hp.name, x)} />;
        if (hp.type === "choice") {
          const opts = hp.options ?? [];
          return (
            <Field key={hp.name} label={hp.label} help={hp.help}>
              {opts.length <= 3 ? (
                <Segmented kind="form" size="sm" value={String(v)} onChange={(x) => onChange(hp.name, x)} options={opts.map((o) => ({ value: o, label: o }))} />
              ) : (
                <Select value={String(v)} onChange={(x) => onChange(hp.name, x)} options={opts.map((o) => ({ value: o, label: o }))} />
              )}
            </Field>
          );
        }
        return (
          <Slider key={hp.name} label={hp.label} help={hp.help} value={Number(v)} min={hp.min ?? 0} max={hp.max ?? 1}
            step={hp.step} log={hp.log} integer={hp.type === "int"}
            format={hp.name === "max_depth" && Number(v) === 0 ? () => "∞" : undefined}
            onChange={(x) => onChange(hp.name, x)} />
        );
      })}
    </div>
  );
}
