import {
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
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
  PanelHead,
  Signed,
  Spec,
  Td,
  Th,
  axisLabel,
  axisProps,
  chart,
  fmtDate,
  methodLabel,
  tooltipProps,
} from "./ui";

interface Props {
  issuer: string | null;
}

// The fitted curve is drawn in ink because the model is the neutral reference;
// only the observations carry colour, and only to show which side of the curve
// they fell on. Each observation is tied back to the curve by a whisker, so the
// residual is a length you can read off the chart rather than infer.
function Key() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
      <span className="flex items-center gap-2">
        <svg width="18" height="8" aria-hidden="true">
          <line x1="0" y1="4" x2="18" y2="4" stroke={chart.ink} strokeWidth="1.75" />
        </svg>
        Fitted curve
      </span>
      <span className="flex items-center gap-2">
        <span className="h-[7px] w-[7px] bg-cheapBright" />
        Cheap
      </span>
      <span className="flex items-center gap-2">
        <span className="h-[7px] w-[7px] bg-richBright" />
        Rich
      </span>
      <span className="flex items-center gap-2">
        <svg width="8" height="12" aria-hidden="true">
          <line x1="4" y1="0" x2="4" y2="12" stroke={chart.axis} strokeWidth="1" />
        </svg>
        Residual
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
        <PanelHead title="Issuer curve" />
        <Empty>Select an issuer in the bar above to fit its curve.</Empty>
      </Panel>
    );
  }

  const residuals = data ? data.points.map((p) => p.residual) : [];
  const max = residuals.length
    ? Math.max(...residuals.map((r) => Math.abs(r)), 1)
    : 1;
  // Fit quality, straight off the residuals the API returned.
  const rmse = residuals.length
    ? Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / residuals.length)
    : 0;
  const tenors = data ? data.points.map((p) => p.maturity_years) : [];

  return (
    <Panel>
      <PanelHead
        title={`${issuer} — Z-spread curve`}
        note={data ? `${methodLabel(data.method)} · ${fmtDate(data.trade_date)}` : undefined}
      />

      {loading && <Loading label="Fitting the curve" />}
      {error && <ErrorNote message={error} />}

      {data && (
        <>
          <Key />
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart margin={{ top: 10, right: 14, bottom: 26, left: 4 }}>
                <CartesianGrid stroke={chart.grid} strokeDasharray="2 3" />
                <XAxis
                  {...axisProps}
                  type="number"
                  dataKey="x"
                  name="Tenor"
                  unit="y"
                  label={{
                    value: "TENOR (YEARS)",
                    position: "insideBottom",
                    offset: -14,
                    ...axisLabel,
                  }}
                />
                <YAxis
                  {...axisProps}
                  type="number"
                  width={56}
                  // A credit curve never approaches zero spread, so a
                  // zero-based axis would flatten the shape that matters.
                  // Bounds are the data rounded out to the next 10 bp.
                  domain={[
                    (min: number) => Math.floor((min - 5) / 10) * 10,
                    (max: number) => Math.ceil((max + 5) / 10) * 10,
                  ]}
                  tickCount={6}
                  label={{
                    value: "Z-SPREAD (BP)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 12,
                    ...axisLabel,
                  }}
                />
                <Tooltip
                  {...tooltipProps}
                  formatter={(v: number, n: string) => [v.toFixed(2), n]}
                />
                <Line
                  data={data.fitted_tenors.map((t, i) => ({
                    x: t,
                    Fitted: data.fitted_spreads[i],
                  }))}
                  dataKey="Fitted"
                  stroke={chart.ink}
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
                <Scatter
                  data={data.points.map((p) => ({
                    x: p.maturity_years,
                    Actual: p.actual_spread,
                    cusip: p.cusip,
                    // Whisker back to the fitted curve: down when the bond
                    // trades cheap (actual above model), up when it trades rich.
                    stick:
                      p.residual >= 0
                        ? [p.residual, 0]
                        : [0, Math.abs(p.residual)],
                  }))}
                  dataKey="Actual"
                  shape="square"
                  isAnimationActive={false}
                >
                  <ErrorBar
                    dataKey="stick"
                    direction="y"
                    width={0}
                    strokeWidth={1}
                    stroke={chart.axis}
                  />
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

          <div className="mt-5 border-t border-hair pt-4">
            <PanelHead title="Curve constituents" note={`${data.points.length} bonds`} />
            <div className="scroll-slim -mx-1 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <Th>Cusip</Th>
                    <Th align="right">Tenor y</Th>
                    <Th align="right" group>
                      Z-spd bp
                    </Th>
                    <Th align="right">Model bp</Th>
                    <Th group>Resid bp</Th>
                    <Th align="right">Dev %</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.points.map((p) => (
                    <tr key={p.cusip} className="border-b border-hair last:border-0">
                      <Td num align="left" className="text-muted">
                        {p.cusip}
                      </Td>
                      <Td num>{p.maturity_years.toFixed(2)}</Td>
                      <Td num group>
                        {p.actual_spread.toFixed(2)}
                      </Td>
                      <Td num className="text-muted">
                        {p.model_spread.toFixed(2)}
                      </Td>
                      <Td group>
                        <div className="flex items-center gap-2.5">
                          <Deviation value={p.residual} max={max} />
                          <Signed value={p.residual} digits={2} />
                        </div>
                      </Td>
                      <Td num>
                        <Signed
                          value={(p.residual / p.model_spread) * 100}
                          digits={1}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Spec
            items={[
              ["Fit", methodLabel(data.method)],
              ["Points", String(data.points.length)],
              ["Rmse", `${rmse.toFixed(2)} BP`],
              ["Max |resid|", `${max.toFixed(2)} BP`],
              ["Tenor range", `${Math.min(...tenors).toFixed(1)}–${Math.max(...tenors).toFixed(1)}Y`],
              ["As of", fmtDate(data.trade_date)],
            ]}
          />
        </>
      )}
    </Panel>
  );
}
