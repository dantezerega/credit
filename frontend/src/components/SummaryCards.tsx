import { api } from "../api/client";
import { useApi } from "../hooks/useApi";

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

// Headline cards: total bonds, active signals, cheapest & richest bond.
export function SummaryCards() {
  const { data, loading, error } = useApi(() => api.summary(), []);

  if (loading) return <div className="text-gray-500">Loading summary…</div>;
  if (error || !data) return <div className="text-rich">Summary error: {error}</div>;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Total Bonds Tracked" value={String(data.total_bonds)} sub={`as of ${data.as_of}`} />
      <Card label="Active Signals" value={String(data.active_signals)} />
      <Card
        label="Cheapest Bond"
        value={data.cheapest ? data.cheapest.issuer : "—"}
        sub={data.cheapest ? `z ${data.cheapest.z_score.toFixed(2)} · ${data.cheapest.residual.toFixed(0)}bp` : ""}
      />
      <Card
        label="Richest Bond"
        value={data.richest ? data.richest.issuer : "—"}
        sub={data.richest ? `z ${data.richest.z_score.toFixed(2)} · ${data.richest.residual.toFixed(0)}bp` : ""}
      />
    </div>
  );
}
