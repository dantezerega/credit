import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { Backtest } from "../types";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase text-gray-400">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}

// Backtest report for the mean-reversion strategy, with adjustable entry z.
export function BacktestPanel() {
  const [entryZ, setEntryZ] = useState(2.0);
  const { data, loading, error } = useApi<Backtest>(() => api.backtest(entryZ, 0.0), [entryZ]);

  return (
    <div className="card">
      <div className="flex justify-between items-baseline mb-3">
        <h3 className="font-semibold">Signal Backtest</h3>
        <label className="text-xs text-gray-400 flex items-center gap-2">
          Entry |z|
          <input
            type="range"
            min={1}
            max={4}
            step={0.5}
            value={entryZ}
            onChange={(e) => setEntryZ(Number(e.target.value))}
          />
          <span className="text-accent">{entryZ.toFixed(1)}</span>
        </label>
      </div>
      {loading && <div className="text-gray-500 text-sm">Running…</div>}
      {error && <div className="text-rich text-sm">{error}</div>}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Metric label="Trades" value={String(data.n_trades)} />
          <Metric label="Hit Rate" value={`${(data.hit_rate * 100).toFixed(0)}%`} />
          <Metric label="Avg Reversion" value={`${data.avg_reversion_bps.toFixed(1)} bp`} />
          <Metric label="Sharpe" value={data.sharpe.toFixed(2)} />
          <Metric label="Max Drawdown" value={`${data.max_drawdown_bps.toFixed(0)} bp`} />
          <Metric label="Exit z" value={data.exit_z.toFixed(1)} />
        </div>
      )}
      <p className="text-xs text-gray-500 mt-3">
        Entry when residual |z| &gt; {entryZ.toFixed(1)}; exit when z reverts to 0. PnL in bp of
        spread captured.
      </p>
    </div>
  );
}
