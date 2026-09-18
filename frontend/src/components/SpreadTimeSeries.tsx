import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { Bond, SpreadHistoryPoint } from "../types";
import {
  Empty,
  ErrorNote,
  Loading,
  Panel,
  PanelHead,
  Select,
  Spec,
  axisLabel,
  axisProps,
  chart,
  fmtShortDate,
  tooltipProps,
} from "./ui";

interface Props {
  issuer: string | null;
}

// Four measures of the same credit, so they are separated by dash pattern and
// weight rather than by colour — teal and rose are reserved for the cheap/rich
// axis and would mean nothing here.
const SERIES = [
  { key: "z_spread", label: "Z-spd", color: chart.ink, dash: undefined, width: 1.75 },
  { key: "g_spread", label: "G-spd", color: "#55677B", dash: "1 4", width: 1.5 },
  { key: "i_spread", label: "I-spd", color: "#8496A8", dash: "5 3", width: 1.5 },
  { key: "oas", label: "Oas", color: chart.cobalt, dash: "7 4", width: 1.5 },
];

function yearsTo(maturity: string): string {
  const years = (new Date(maturity).getTime() - Date.now()) / 3.15576e10;
  return `${years.toFixed(1)}y`;
}

// Historical spread series for one bond of the selected issuer.
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

  // Summary statistics of the Z-spread series, and the option cost the OAS
  // model is currently charging this bond.
  const z = data ? data.map((d) => d.z_spread) : [];
  const mean = z.length ? z.reduce((a, b) => a + b, 0) / z.length : 0;
  const sd = z.length
    ? Math.sqrt(z.reduce((a, b) => a + (b - mean) ** 2, 0) / z.length)
    : 0;
  const last = data && data.length ? data[data.length - 1] : null;

  return (
    <Panel>
      <PanelHead
        title="Spread history"
        note={cusip ?? undefined}
        action={
          bonds && bonds.length > 0 ? (
            <label className="flex items-center gap-2">
              <span className="key">Bond</span>
              <div className="w-[215px]">
                <Select
                  compact
                  label="Bond"
                  value={cusip ?? ""}
                  onChange={setCusip}
                  options={bonds.map((b) => ({
                    value: b.cusip,
                    label: `${b.cusip}  ${yearsTo(b.maturity)}  ${b.coupon.toFixed(2)}%`,
                  }))}
                />
              </div>
            </label>
          ) : undefined
        }
      />

      {!issuer && <Empty>Select an issuer above.</Empty>}
      {issuer && loading && <Loading label="Loading history" />}
      {error && <ErrorNote message={error} />}
      {issuer && data && data.length === 0 && !loading && (
        <Empty>No price history stored for this bond.</Empty>
      )}

      {data && data.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-2">
                <svg width="18" height="8" aria-hidden="true">
                  <line
                    x1="0"
                    y1="4"
                    x2="18"
                    y2="4"
                    stroke={s.color}
                    strokeWidth={s.width + 0.5}
                    strokeDasharray={s.dash}
                  />
                </svg>
                {s.label}
              </span>
            ))}
          </div>

          <div className="mt-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data} margin={{ top: 10, right: 14, bottom: 22, left: 4 }}>
                <CartesianGrid stroke={chart.grid} strokeDasharray="2 3" />
                <XAxis
                  {...axisProps}
                  dataKey="trade_date"
                  minTickGap={44}
                  tickFormatter={fmtShortDate}
                  label={{
                    value: "TRADE DATE (MM-DD)",
                    position: "insideBottom",
                    offset: -12,
                    ...axisLabel,
                  }}
                />
                <YAxis
                  {...axisProps}
                  width={52}
                  label={{
                    value: "SPREAD (BP)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 12,
                    ...axisLabel,
                  }}
                />
                <Tooltip
                  {...tooltipProps}
                  labelFormatter={(d: string) => String(d)}
                  formatter={(v: number, n: string) => [`${v.toFixed(2)} bp`, n]}
                />
                {SERIES.map((s) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.width}
                    strokeDasharray={s.dash}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Spec
            items={[
              ["Obs", String(data.length)],
              ["Z last", `${last ? last.z_spread.toFixed(2) : "—"} BP`],
              ["Z mean", `${mean.toFixed(2)} BP`],
              ["Z stdev", `${sd.toFixed(2)} BP`],
              [
                "Z range",
                `${Math.min(...z).toFixed(1)}–${Math.max(...z).toFixed(1)} BP`,
              ],
              [
                "Option cost",
                last ? `${(last.z_spread - last.oas).toFixed(2)} BP` : "—",
              ],
            ]}
          />
        </>
      )}
    </Panel>
  );
}
