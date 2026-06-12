import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { RVRow } from "../types";

interface Props {
  mode: "cheapest" | "richest";
  onSelectIssuer?: (issuer: string) => void;
}

// Top-20 rich/cheap ranking table (RV opportunities).
export function RVTable({ mode, onSelectIssuer }: Props) {
  const { data, loading, error } = useApi<RVRow[]>(
    () => (mode === "cheapest" ? api.cheapest(20) : api.richest(20)),
    [mode],
  );

  const title = mode === "cheapest" ? "Top 20 Cheapest Bonds" : "Top 20 Richest Bonds";

  return (
    <div className="card overflow-x-auto">
      <h3 className="font-semibold mb-2">{title}</h3>
      {loading && <div className="text-gray-500 text-sm">Loading…</div>}
      {error && <div className="text-rich text-sm">{error}</div>}
      {data && (
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-gray-400 border-b border-gray-800">
            <tr>
              <th className="table-cell">CUSIP</th>
              <th className="table-cell">Issuer</th>
              <th className="table-cell">Rating</th>
              <th className="table-cell">Maturity</th>
              <th className="table-cell text-right">Spread</th>
              <th className="table-cell text-right">Model</th>
              <th className="table-cell text-right">Resid</th>
              <th className="table-cell text-right">Z</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr
                key={r.cusip}
                className="border-b border-gray-900 hover:bg-panelLight cursor-pointer"
                onClick={() => onSelectIssuer?.(r.issuer)}
              >
                <td className="table-cell font-mono text-xs">{r.cusip}</td>
                <td className="table-cell">{r.issuer}</td>
                <td className="table-cell">{r.rating}</td>
                <td className="table-cell text-xs">{r.maturity}</td>
                <td className="table-cell text-right">{r.current_spread.toFixed(0)}</td>
                <td className="table-cell text-right text-gray-400">{r.model_spread.toFixed(0)}</td>
                <td className="table-cell text-right">{r.residual.toFixed(0)}</td>
                <td className={`table-cell text-right ${r.z_score > 0 ? "badge-cheap" : "badge-rich"}`}>
                  {r.z_score.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
