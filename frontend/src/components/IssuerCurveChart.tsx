import {
  CartesianGrid,
  Cell,
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
import {
  Deviation,
  Empty,
  ErrorNote,
  Loading,
  Panel,
  PanelHeader,
  Signed,
  Td,
  Th,
  axisProps,
  chart,
  methodLabel,
  tooltipProps,
} from "./ui";

interface Props {
  issuer: string | null;
}

// The fitted curve is drawn in ink because the model is the neutral reference;
// only the observations carry colour, and only to show which side they fell on.
function Key() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted">
      <span className="flex items-center gap-2">
        <svg width="18" height="8" aria-hidden="true">
          <line
            x1="0"
            y1="4"
            x2="18"
            y2="4"
            stroke={chart.ink}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Fitted curve
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-cheapBright" />
        Cheap to the curve
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-richBright" />
        Rich to the curve
      </span>
    </div>
  );
}

export function IssuerCurveChart({ issuer }: Props) {
  const { data, loading, error } = useApi<IssuerCurve | null>(
    () => (issuer ? api.issuerCurve(issuer) : Promise.resolve(null)),
    [issuer],
  );

  if (!issuer) {
    return (
      <Panel>
        <PanelHeader title="Issuer curve" />
        <Empty>Choose an issuer in the bar above to fit its curve.</Empty>
      </Panel>
    );
  }

  const max = data
    ? Math.max(...data.points.map((p) => Math.abs(p.residual)), 1)
    : 1;

  return (
    <Panel>
      <PanelHeader
        title={issuer}
        note={data ? `${methodLabel(data.method)} fit` : undefined}
      />

      {loading && <Loading label="Fitting the curve" />}
      {error && <ErrorNote message={error} />}

      {data && (
        <>
          <Key />
          <div className="mt-5">
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis
                  {...axisProps}
                  type="number"
                  dataKey="x"
                  name="Maturity"
                  unit="y"
                  label={{
                    value: "Years to maturity",
                    position: "insideBottom",
                    offset: -16,
                    fill: "#61738A",
                    fontSize: 13,
                  }}
                />
                <YAxis
                  {...axisProps}
                  type="number"
                  width={64}
                  label={{
                    value: "Z-spread (bp)",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#61738A",
                    fontSize: 13,
                  }}
                />
                <Tooltip
                  {...tooltipProps}
                  formatter={(v: number, n: string) => [v.toFixed(1), n]}
                />
                <Line
                  data={data.fitted_tenors.map((t, i) => ({
                    x: t,
                    Fitted: data.fitted_spreads[i],
                  }))}
                  dataKey="Fitted"
                  stroke={chart.ink}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Scatter
                  data={data.points.map((p) => ({
                    x: p.maturity_years,
                    Actual: p.actual_spread,
                    cusip: p.cusip,
                    residual: p.residual,
                  }))}
                  dataKey="Actual"
                  shape="circle"
                >
                  {data.points.map((p) => (
                    <Cell
                      key={p.cusip}
                      fill={p.residual >= 0 ? chart.cheap : chart.rich}
                    />
                  ))}
                </Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-8 border-t border-hair pt-6">
            <h4 className="mb-1 text-[15px] font-semibold">
              Every bond on this curve
            </h4>
            <p className="mb-4 max-w-prose font-serif text-[14.5px] text-muted">
              Actual spread against what the fitted curve says it should be.
            </p>
            <div className="scroll-slim -mx-2 overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse">
                <thead>
                  <tr>
                    <Th>CUSIP</Th>
                    <Th align="right">Maturity</Th>
                    <Th align="right">Actual</Th>
                    <Th align="right">Model</Th>
                    <Th>Off the curve</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.points.map((p) => (
                    <tr key={p.cusip} className="border-b border-hair last:border-0">
                      <Td className="font-mono text-[12.5px] text-muted">
                        {p.cusip}
                      </Td>
                      <Td align="right" className="num">
                        {p.maturity_years.toFixed(1)}
                        <span className="text-[0.85em] text-muted">y</span>
                      </Td>
                      <Td align="right" className="num">
                        {p.actual_spread.toFixed(0)}
                      </Td>
                      <Td align="right" className="num text-muted">
                        {p.model_spread.toFixed(0)}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Deviation value={p.residual} max={max} />
                          <Signed value={p.residual} unit=" bp" />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
