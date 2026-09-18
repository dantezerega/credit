import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { SectorComparison, SectorStat } from "../types";
import {
  Empty,
  ErrorNote,
  Loading,
  Panel,
  PanelHead,
  Signed,
  Spec,
  Td,
  Th,
  axisLabel,
  axisProps,
  chart,
  fmtDate,
  signed,
  tooltipProps,
} from "./ui";

// Sector RV. Bars run horizontally so sector names read straight, and they
// measure each sector against the universe average rather than against zero —
// no sector trades anywhere near zero spread, so a zero-based bar would carry
// no information. Colour is the sector's own z-score, the same cheap/rich axis
// as everywhere else, and absolute levels are in the table below.
export function SectorPanel() {
  const { data, loading, error } = useApi<SectorComparison>(
    () => api.sectors(),
    [],
  );

  const bonds = data ? data.sectors.reduce((a, s) => a + s.n_bonds, 0) : 0;
  const mean =
    data && bonds
      ? data.sectors.reduce((a, s) => a + s.avg_spread * s.n_bonds, 0) / bonds
      : 0;
  const basis = data
    ? data.sectors.map((s) => ({ ...s, basis: s.avg_spread - mean }))
    : [];
  // Symmetric axis, rounded out to a round number of basis points, so a bar
  // left of the line is directly comparable with one to the right.
  const bound = basis.length
    ? Math.ceil(Math.max(...basis.map((b) => Math.abs(b.basis))) / 10) * 10
    : 10;

  return (
    <Panel>
      <PanelHead
        title="Sector Z-spread vs universe"
        note={data ? `${data.sectors.length} sectors · ${fmtDate(data.trade_date)}` : undefined}
      />

      {loading && <Loading label="Comparing sectors" />}
      {error && <ErrorNote message={error} />}

      {data && (
        <>
          <ResponsiveContainer
            width="100%"
            height={Math.max(200, basis.length * 42 + 52)}
          >
            <BarChart
              data={basis}
              layout="vertical"
              margin={{ top: 6, right: 18, bottom: 26, left: 4 }}
            >
              <CartesianGrid stroke={chart.grid} strokeDasharray="2 3" horizontal={false} />
              <XAxis
                {...axisProps}
                type="number"
                domain={[-bound, bound]}
                tickFormatter={(v: number) => signed(v, 0)}
                label={{
                  value: "Z-SPREAD VS UNIVERSE AVERAGE (BP)",
                  position: "insideBottom",
                  offset: -14,
                  ...axisLabel,
                }}
              />
              <YAxis
                {...axisProps}
                type="category"
                dataKey="sector"
                width={96}
                tick={{ ...axisProps.tick, fontSize: 11.5 }}
              />
              <Tooltip
                {...tooltipProps}
                cursor={{ fill: "rgba(18,28,39,0.04)" }}
                formatter={(v: number, _n: string, item: { payload?: SectorStat }) => [
                  `${signed(v, 2)} bp · avg ${item.payload?.avg_spread.toFixed(2) ?? "—"} bp`,
                  "Vs universe",
                ]}
              />
              <ReferenceLine x={0} stroke={chart.ink} strokeWidth={1} />
              <Bar dataKey="basis" barSize={16} isAnimationActive={false}>
                {basis.map((s) => (
                  <Cell
                    key={s.sector}
                    fill={s.z_score >= 0 ? chart.cheap : chart.rich}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 border-t border-hair pt-4">
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr>
                    <Th>Sector</Th>
                    <Th align="right">Avg bp</Th>
                    <Th align="right" group>
                      Vs universe bp
                    </Th>
                    <Th align="right">Z</Th>
                    <Th align="right">Pct</Th>
                    <Th align="right" group>
                      Bonds
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.sectors.map((s) => (
                    <tr key={s.sector} className="border-b border-hair last:border-0">
                      <Td className="font-medium">{s.sector}</Td>
                      <Td num>{s.avg_spread.toFixed(2)}</Td>
                      <Td num group>
                        <Signed value={s.avg_spread - mean} digits={2} />
                      </Td>
                      <Td num>
                        <Signed value={s.z_score} digits={2} />
                      </Td>
                      <Td num className="text-muted">
                        {s.percentile.toFixed(1)}
                      </Td>
                      <Td num group className="text-muted">
                        {s.n_bonds}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 border-t border-hair pt-4">
            <PanelHead title="Cross-sector read" />
            {data.narrative.length === 0 ? (
              <Empty>
                Sectors are in line with each other. Nothing to call out today.
              </Empty>
            ) : (
              <ul className="divide-y divide-hair">
                {data.narrative.map((line, i) => (
                  <li
                    key={i}
                    className="flex items-baseline gap-2.5 py-2 text-[12.5px] leading-relaxed first:pt-0 last:pb-0"
                  >
                    <span
                      className="mt-[6px] h-[6px] w-[6px] shrink-0 bg-cheapBright"
                      aria-hidden="true"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Spec
            items={[
              ["Universe", `${mean.toFixed(2)} BP AVG`],
              ["Bonds", String(bonds)],
              ["Z", "SECTOR AVG VS OWN HISTORY"],
              ["Pct", "RANK IN OWN HISTORY"],
              ["As of", fmtDate(data.trade_date)],
            ]}
          />
        </>
      )}
    </Panel>
  );
}
