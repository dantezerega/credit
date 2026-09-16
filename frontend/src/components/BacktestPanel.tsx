import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { Backtest } from "../types";
import {
  ErrorNote,
  Loading,
  Panel,
  PanelHeader,
  Segmented,
  cn,
} from "./ui";

const THRESHOLDS = [1, 1.5, 2, 2.5, 3, 3.5, 4].map((v) => ({
  value: v,
  label: v.toFixed(1),
}));

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "cheap" | "rich";
}) {
  return (
    <div className="bg-surface p-5">
      <p
        className={cn(
          "num text-[26px] font-semibold leading-none tracking-[-0.015em]",
          tone === "cheap" && "text-cheap",
          tone === "rich" && "text-rich",
        )}
      >
        {value}
      </p>
      <p className="mt-2.5 text-[14px] font-medium">{label}</p>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

// Backtest of the mean-reversion rule. The entry threshold was a slider you had
// to nudge; it only ever took seven values, so it is a row of buttons instead.
export function BacktestPanel() {
  const [entryZ, setEntryZ] = useState(2.0);
  const { data, loading, error } = useApi<Backtest>(
    () => api.backtest(entryZ, 0.0),
    [entryZ],
  );

  return (
    <Panel>
      <PanelHeader
        title="Mean-reversion backtest"
        action={
          <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[13.5px] text-muted">Enter at z of</span>
            <div className="scroll-slim max-w-full overflow-x-auto">
              <Segmented
                label="Entry z threshold"
                value={entryZ}
                onChange={setEntryZ}
                options={THRESHOLDS}
              />
            </div>
          </div>
        }
      />

      {loading && <Loading label="Running the backtest" />}
      {error && <ErrorNote message={error} />}

      {data && !loading && (
        <>
          <div className="overflow-hidden rounded-xl border border-hair">
            <div className="grid grid-cols-2 gap-px bg-hair md:grid-cols-3">
              <Metric
                label="Trades taken"
                value={String(data.n_trades)}
                hint={`at z above ${entryZ.toFixed(1)}`}
              />
              <Metric
                label="Hit rate"
                value={`${(data.hit_rate * 100).toFixed(0)}%`}
                hint="closed in the right direction"
                tone={data.hit_rate >= 0.5 ? "cheap" : "rich"}
              />
              <Metric
                label="Average reversion"
                value={`${data.avg_reversion_bps.toFixed(1)} bp`}
                hint="spread captured per trade"
              />
              <Metric
                label="Sharpe"
                value={data.sharpe.toFixed(2)}
                hint="return per unit of risk"
                tone={data.sharpe >= 0 ? "cheap" : "rich"}
              />
              <Metric
                label="Worst drawdown"
                value={`${data.max_drawdown_bps.toFixed(0)} bp`}
                hint="peak to trough"
              />
              <Metric
                label="Exit at z"
                value={data.exit_z.toFixed(1)}
                hint="back on the curve"
              />
            </div>
          </div>

          <p className="mt-5 max-w-prose font-serif text-[15px] leading-relaxed text-muted">
            A trade opens when a bond's residual passes {entryZ.toFixed(1)}{" "}
            standard deviations from its issuer curve, and closes when the
            residual returns to zero. Profit and loss is measured in basis points
            of spread captured, before any financing or transaction cost.
          </p>
        </>
      )}
    </Panel>
  );
}
