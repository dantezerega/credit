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
  PanelHeader,
  Select,
  axisProps,
  chart,
  fmtShortDate,
  tooltipProps,
} from "./ui";

interface Props {
  issuer: string | null;
}

const SERIES = [
  { key: "z_spread", label: "Z-spread", color: chart.ink, dash: undefined, width: 2.5 },
  { key: "g_spread", label: "G-spread", color: chart.cheap, dash: "1 6", width: 2.5 },
  { key: "oas", label: "OAS", color: chart.cobalt, dash: "7 5", width: 2 },
];

function yearsTo(maturity: string): string {
  const years = (new Date(maturity).getTime() - Date.now()) / 3.15576e10;
  return `${years.toFixed(0)}y`;
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

  return (
    <Panel>
      <PanelHeader
        title="Spread history"
        action={
          bonds && bonds.length > 0 ? (
            <div className="w-[240px]">
              <Select
                compact
                label="Bond"
                value={cusip ?? ""}
                onChange={setCusip}
                options={bonds.map((b) => ({
                  value: b.cusip,
                  label: `${b.cusip}  ${yearsTo(b.maturity)}`,
                }))}
              />
            </div>
          ) : undefined
        }
      />

      {!issuer && <Empty>Choose an issuer in the bar above.</Empty>}
      {issuer && loading && <Loading label="Loading history" />}
      {error && <ErrorNote message={error} />}
      {issuer && data && data.length === 0 && !loading && (
        <Empty>No price history stored for this bond.</Empty>
      )}

      {data && data.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-2">
                <svg width="18" height="8" aria-hidden="true">
                  <line
                    x1="0"
                    y1="4"
                    x2="18"
                    y2="4"
                    stroke={s.color}
                    strokeWidth="2.5"
                    strokeDasharray={s.dash}
                    strokeLinecap="round"
                  />
                </svg>
                {s.label}
              </span>
            ))}
            <span className="font-serif text-faint">
              On a bullet bond these three sit almost on top of each other.
            </span>
          </div>
          <div className="mt-5">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis
                  {...axisProps}
                  dataKey="trade_date"
                  minTickGap={48}
                  tickFormatter={fmtShortDate}
                />
                <YAxis
                  {...axisProps}
                  width={56}
                  label={{
                    value: "bp",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#61738A",
                    fontSize: 13,
                  }}
                />
                <Tooltip
                  {...tooltipProps}
                  labelFormatter={(d: string) => fmtShortDate(d)}
                  formatter={(v: number, n: string) => [`${v.toFixed(1)} bp`, n]}
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
        </>
      )}
    </Panel>
  );
}
