import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";

// Bins residual z-scores into a histogram to visualise the dislocation
// distribution across the universe (should be ~bell-shaped with fat tails).
function bin(values: number[], width = 0.5): { bucket: string; count: number; mid: number }[] {
  if (values.length === 0) return [];
  const min = Math.floor(Math.min(...values) / width) * width;
  const max = Math.ceil(Math.max(...values) / width) * width;
  const bins: Record<string, number> = {};
  for (let b = min; b < max; b += width) {
    bins[b.toFixed(1)] = 0;
  }
  for (const v of values) {
    const b = (Math.floor(v / width) * width).toFixed(1);
    bins[b] = (bins[b] ?? 0) + 1;
  }
  return Object.entries(bins).map(([k, count]) => ({
    bucket: k,
    mid: Number(k),
    count,
  }));
}

export function ResidualHistogram() {
  const { data, loading, error } = useApi<number[]>(() => api.residualDistribution(), []);
  const bars = data ? bin(data) : [];

  return (
    <div className="card">
      <h3 className="font-semibold mb-2">Residual Z-Score Distribution</h3>
      {loading && <div className="text-gray-500 text-sm">Loading…</div>}
      {error && <div className="text-rich text-sm">{error}</div>}
      {data && (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={bars} margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
            <CartesianGrid stroke="#1f2937" />
            <XAxis dataKey="bucket" stroke="#9ca3af" fontSize={11} />
            <YAxis stroke="#9ca3af" fontSize={11} />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }} />
            <Bar dataKey="count" fill="#38bdf8" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
