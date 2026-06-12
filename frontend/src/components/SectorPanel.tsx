import { Cell, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { SectorComparison } from "../types";

// Sector relative value: average spread bar chart coloured by z-score, plus
// the desk-style narrative ("Energy 1.8σ cheap to Industrials").
export function SectorPanel() {
  const { data, loading, error } = useApi<SectorComparison>(() => api.sectors(), []);

  return (
    <div className="card">
      <h3 className="font-semibold mb-2">Sector Relative Value</h3>
      {loading && <div className="text-gray-500 text-sm">Loading…</div>}
      {error && <div className="text-rich text-sm">{error}</div>}
      {data && (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.sectors} margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
              <CartesianGrid stroke="#1f2937" />
              <XAxis dataKey="sector" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }} />
              <Bar dataKey="avg_spread" name="Avg Spread (bp)">
                {data.sectors.map((s) => (
                  <Cell key={s.sector} fill={s.z_score > 0 ? "#22c55e" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ul className="mt-3 space-y-1 text-sm">
            {data.narrative.length === 0 && (
              <li className="text-gray-500">Sectors broadly in line — no notable dislocations.</li>
            )}
            {data.narrative.map((line, i) => (
              <li key={i} className="text-gray-300">
                • {line}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
