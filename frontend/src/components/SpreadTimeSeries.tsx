import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { Bond, SpreadHistoryPoint } from "../types";

interface Props {
  issuer: string | null;
}

// Historical spread time series for a chosen bond of the selected issuer.
export function SpreadTimeSeries({ issuer }: Props) {
  const [cusip, setCusip] = useState<string | null>(null);
  const { data: bonds } = useApi<Bond[]>(
    () => (issuer ? api.bonds({ issuer }) : Promise.resolve([])),
    [issuer],
  );

  useEffect(() => {
    if (bonds && bonds.length > 0) setCusip(bonds[0].cusip);
  }, [bonds]);

  const { data, loading, error } = useApi<SpreadHistoryPoint[]>(
    () => (cusip ? api.spreadHistory(cusip) : Promise.resolve([])),
    [cusip],
  );

  return (
    <div className="card">
      <div className="flex justify-between items-baseline mb-2">
        <h3 className="font-semibold">Historical Spread Time Series</h3>
        {bonds && bonds.length > 0 && (
          <select
            className="bg-panelLight border border-gray-700 rounded text-xs px-2 py-1"
            value={cusip ?? ""}
            onChange={(e) => setCusip(e.target.value)}
          >
            {bonds.map((b) => (
              <option key={b.cusip} value={b.cusip}>
                {b.cusip} ({((new Date(b.maturity).getTime() - Date.now()) / 3.15e10).toFixed(0)}y)
              </option>
            ))}
          </select>
        )}
      </div>
      {!issuer && <div className="text-gray-500 text-sm">Select an issuer.</div>}
      {loading && <div className="text-gray-500 text-sm">Loading…</div>}
      {error && <div className="text-rich text-sm">{error}</div>}
      {data && data.length > 0 && (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
            <CartesianGrid stroke="#1f2937" />
            <XAxis dataKey="trade_date" stroke="#9ca3af" fontSize={10} minTickGap={40} />
            <YAxis stroke="#9ca3af" fontSize={11} />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }} />
            <Legend />
            <Line dataKey="z_spread" stroke="#38bdf8" dot={false} name="Z-Spread" isAnimationActive={false} />
            <Line dataKey="g_spread" stroke="#22c55e" dot={false} name="G-Spread" isAnimationActive={false} />
            <Line dataKey="oas" stroke="#f59e0b" dot={false} name="OAS" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
