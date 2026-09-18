import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { Backtest } from "../types";
import {
  ErrorNote,
  Loading,
  Panel,
  PanelHead,
  Segmented,
  Spec,
} from "./ui";

const THRESHOLDS = [1, 1.5, 2, 2.5, 3, 3.5, 4].map((v) => ({
  value: v,
  label: v.toFixed(1),
}));

function Metric({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <p className="key">{label}</p>
      <p className="mt-2 font-mono text-[22px] font-medium leading-none">
        {value}
        {unit && <span className="ml-1 text-[11px] font-normal text-faint">{unit}</span>}
      </p>
      {hint && <p className="mt-2 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

// Backtest of the mean-reversion rule. The entry threshold takes seven discrete
// values, so it is a row of buttons rather than a slider you have to nudge.
export function BacktestPanel() {
  const [entryZ, setEntryZ] = useState(2.0);
  const { data, loading, error } = useApi<Backtest>(
    () => api.backtest(entryZ, 0.0),
    [entryZ],
  );

  return (
    <Panel>
      <PanelHead
        title="Mean-reversion backtest"
        action={
          <label className="flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="key">Entry threshold</span>
            <div className="scroll-slim max-w-full overflow-x-auto">
              <Segmented
                label="Entry z threshold"
                value={entryZ}
                onChange={setEntryZ}
                options={THRESHOLDS}
              />
            </div>
          </label>
        }
      />

      {loading && <Loading label="Running the backtest" />}
      {error && <ErrorNote message={error} />}

      {data && !loading && (
        <>
          <div className="grid gap-px border border-line bg-hair sm:grid-cols-2 lg:grid-cols-3">
            <Metric
              label="Trades"
              value={String(data.n_trades)}
              hint={`entries at |z| ≥ ${entryZ.toFixed(1)}σ`}
            />
            <Metric
              label="Hit rate"
              value={(data.hit_rate * 100).toFixed(1)}
              unit="%"
              hint="closed in the signalled direction"
            />
            <Metric
              label="Avg reversion"
              value={data.avg_reversion_bps.toFixed(2)}
              unit="BP"
              hint="spread captured per trade"
            />
            <Metric
              label="Sharpe"
              value={data.sharpe.toFixed(2)}
              hint="per trade, no financing cost"
            />
            <Metric
              label="Max drawdown"
              value={data.max_drawdown_bps.toFixed(1)}
              unit="BP"
              hint="peak to trough of cumulative bp"
            />
            <Metric
              label="Exit"
              value={data.exit_z.toFixed(2)}
              unit="σ"
              hint="residual back on the curve"
            />
          </div>

          <Spec
            items={[
              ["Entry", `|Z| ≥ ${data.entry_z.toFixed(2)}σ`],
              ["Exit", `|Z| ≤ ${data.exit_z.toFixed(2)}σ`],
              ["Pnl unit", "BP OF SPREAD"],
              ["Costs", "NONE MODELLED"],
              ["Z window", "252D TRAILING"],
            ]}
          />
        </>
      )}
    </Panel>
  );
}
