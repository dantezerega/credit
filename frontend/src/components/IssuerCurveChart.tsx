import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { IssuerCurve } from "../types";

interface Props {
  issuer: string | null;
}

// Interactive spread-curve viewer: actual points (scatter) vs fitted curve.
export function IssuerCurveChart({ issuer }: Props) {
  const { data, loading, error } = useApi<IssuerCurve | null>(
    () => (issuer ? api.issuerCurve(issuer) : Promise.resolve(null)),
    [issuer],
  );

  if (!issuer) return <div className="card text-gray-500">Select an issuer to view its spread curve.</div>;

  return (
    <div className="card">
      <div className="flex justify-between items-baseline mb-2">
        <h3 className="font-semibold">Issuer Curve — {issuer}</h3>
        {data && <span className="text-xs text-gray-500">fit: {data.method}</span>}
      </div>
      {loading && <div className="text-gray-500 text-sm">Loading…</div>}
      {error && <div className="text-rich text-sm">{error}</div>}
      {data && (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="x"
              name="Maturity"
              unit="y"
              stroke="#9ca3af"
              label={{ value: "Maturity (yrs)", position: "insideBottom", offset: -10, fill: "#9ca3af" }}
            />
            <YAxis
              type="number"
              stroke="#9ca3af"
              label={{ value: "Z-Spread (bp)", angle: -90, position: "insideLeft", fill: "#9ca3af" }}
            />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151" }}
              formatter={(v: number, n: string) => [`${v.toFixed(1)}`, n]}
            />
            {/* Fitted (model) curve. */}
            <Line
              data={data.fitted_tenors.map((t, i) => ({ x: t, fitted: data.fitted_spreads[i] }))}
              dataKey="fitted"
              stroke="#38bdf8"
              dot={false}
              name="Fitted"
              isAnimationActive={false}
            />
            {/* Actual observed spreads. */}
            <Scatter
              data={data.points.map((p) => ({
                x: p.maturity_years,
                actual: p.actual_spread,
                cusip: p.cusip,
                residual: p.residual,
              }))}
              dataKey="actual"
              fill="#f59e0b"
              name="Actual"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      {data && (
        <div className="mt-2 max-h-32 overflow-y-auto text-xs">
          <table className="w-full">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left">CUSIP</th>
                <th className="text-right">Mat</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Model</th>
                <th className="text-right">Resid</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p) => (
                <tr key={p.cusip} className="text-gray-300">
                  <td className="font-mono">{p.cusip}</td>
                  <td className="text-right">{p.maturity_years.toFixed(1)}</td>
                  <td className="text-right">{p.actual_spread.toFixed(0)}</td>
                  <td className="text-right text-gray-500">{p.model_spread.toFixed(0)}</td>
                  <td className={`text-right ${p.residual > 0 ? "badge-cheap" : "badge-rich"}`}>
                    {p.residual.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
