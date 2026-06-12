import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { Signal } from "../types";

// Strength bar (1-100) rendered as a coloured meter.
function StrengthBar({ value }: { value: number }) {
  return (
    <div className="w-20 h-2 bg-gray-800 rounded">
      <div
        className="h-2 rounded bg-accent"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

// Top mean-reversion signals table.
export function SignalsTable({ onSelectIssuer }: { onSelectIssuer?: (i: string) => void }) {
  const { data, loading, error } = useApi<Signal[]>(() => api.topSignals(15), []);

  return (
    <div className="card overflow-x-auto">
      <h3 className="font-semibold mb-2">Top Mean-Reversion Signals</h3>
      {loading && <div className="text-gray-500 text-sm">Loading…</div>}
      {error && <div className="text-rich text-sm">{error}</div>}
      {data && data.length === 0 && (
        <div className="text-gray-500 text-sm">No active signals (no |z| &gt; 2 dislocations).</div>
      )}
      {data && data.length > 0 && (
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-gray-400 border-b border-gray-800">
            <tr>
              <th className="table-cell">Issuer</th>
              <th className="table-cell">Rating</th>
              <th className="table-cell">Signal</th>
              <th className="table-cell text-right">Z</th>
              <th className="table-cell text-right">Exp. Move</th>
              <th className="table-cell">Strength</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr
                key={s.cusip}
                className="border-b border-gray-900 hover:bg-panelLight cursor-pointer"
                onClick={() => onSelectIssuer?.(s.issuer)}
              >
                <td className="table-cell">{s.issuer}</td>
                <td className="table-cell">{s.rating}</td>
                <td className={`table-cell font-semibold ${s.direction === "BUY" ? "badge-cheap" : "badge-rich"}`}>
                  {s.direction === "BUY" ? "BUY CHEAP" : "SELL RICH"}
                </td>
                <td className="table-cell text-right">{s.z_score.toFixed(2)}</td>
                <td className="table-cell text-right">{s.expected_reversion_bps.toFixed(0)}bp</td>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <StrengthBar value={s.signal_strength} />
                    <span className="text-xs text-gray-400">{s.signal_strength}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
