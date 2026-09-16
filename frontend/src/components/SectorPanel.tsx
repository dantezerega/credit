import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { SectorComparison } from "../types";
import {
  Empty,
  ErrorNote,
  Loading,
  Panel,
  PanelHeader,
  Signed,
  axisProps,
  chart,
  tooltipProps,
} from "./ui";

// Sector RV. Bars run horizontally so sector names read straight, and they are
// coloured by z-score rather than by size — the same cheap/rich axis as
// everywhere else on the page.
export function SectorPanel() {
  const { data, loading, error } = useApi<SectorComparison>(
    () => api.sectors(),
    [],
  );

  return (
    <Panel>
      <PanelHeader title="Spread by sector" note="Coloured by z-score" />

      {loading && <Loading label="Comparing sectors" />}
      {error && <ErrorNote message={error} />}

      {data && (
        <>
          <ResponsiveContainer
            width="100%"
            height={Math.max(220, data.sectors.length * 48 + 48)}
          >
            <BarChart
              data={data.sectors}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 24, left: 8 }}
            >
              <CartesianGrid stroke={chart.grid} horizontal={false} />
              <XAxis
                {...axisProps}
                type="number"
                label={{
                  value: "Average spread (bp)",
                  position: "insideBottom",
                  offset: -14,
                  fill: "#61738A",
                  fontSize: 13,
                }}
              />
              <YAxis
                {...axisProps}
                type="category"
                dataKey="sector"
                width={112}
              />
              <Tooltip
                {...tooltipProps}
                cursor={{ fill: "rgba(27,39,53,0.04)" }}
                formatter={(v: number) => [`${v.toFixed(0)} bp`, "Average spread"]}
              />
              <Bar dataKey="avg_spread" radius={[0, 4, 4, 0]} barSize={20}>
                {data.sectors.map((s) => (
                  <Cell
                    key={s.sector}
                    fill={s.z_score >= 0 ? chart.cheap : chart.rich}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-6 border-t border-hair pt-6">
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[14.5px]">
                <thead>
                  <tr className="border-b border-line text-[13px] font-semibold text-muted">
                    <th className="py-2.5 pr-4 text-left">Sector</th>
                    <th className="px-4 py-2.5 text-right">Average spread</th>
                    <th className="px-4 py-2.5 text-right">z</th>
                    <th className="px-4 py-2.5 text-right">Percentile</th>
                    <th className="py-2.5 pl-4 text-right">Bonds</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sectors.map((s) => (
                    <tr key={s.sector} className="border-b border-hair last:border-0">
                      <td className="py-3 pr-4 font-medium">{s.sector}</td>
                      <td className="num px-4 py-3 text-right">
                        {s.avg_spread.toFixed(0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Signed value={s.z_score} digits={2} />
                      </td>
                      <td className="num px-4 py-3 text-right text-muted">
                        {s.percentile.toFixed(0)}
                      </td>
                      <td className="num py-3 pl-4 text-right text-muted">
                        {s.n_bonds}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 border-t border-hair pt-6">
            <h4 className="mb-3 text-[15px] font-semibold">What stands out</h4>
            {data.narrative.length === 0 ? (
              <Empty>
                Sectors are broadly in line with each other. Nothing to call out
                today.
              </Empty>
            ) : (
              <ul className="divide-y divide-hair">
                {data.narrative.map((line, i) => (
                  <li
                    key={i}
                    className="py-3 font-serif text-[15.5px] leading-relaxed first:pt-0 last:pb-0"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
