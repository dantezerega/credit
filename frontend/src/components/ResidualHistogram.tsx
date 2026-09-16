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
import {
  Empty,
  ErrorNote,
  Loading,
  Panel,
  PanelHeader,
  axisProps,
  signed,
  chart,
  tooltipProps,
} from "./ui";

interface Bucket {
  bucket: string;
  mid: number;
  count: number;
}

// Bins residual z-scores so the shape of the dislocation distribution is
// visible: a bell through the middle, and the fat tails that carry the trades.
function bin(values: number[], width = 0.5): Bucket[] {
  if (values.length === 0) return [];
  const min = Math.floor(Math.min(...values) / width) * width;
  const max = Math.ceil(Math.max(...values) / width) * width;
  const bins: Record<string, number> = {};
  const steps = Math.round((max - min) / width);
  for (let i = 0; i <= steps; i++) {
    bins[(min + i * width).toFixed(1)] = 0;
  }
  for (const v of values) {
    const key = (Math.floor(v / width) * width).toFixed(1);
    bins[key] = (bins[key] ?? 0) + 1;
  }
  return Object.entries(bins)
    .map(([k, count]) => ({ bucket: k, mid: Number(k), count }))
    .sort((a, b) => a.mid - b.mid);
}

export function ResidualHistogram() {
  const { data, loading, error } = useApi<number[]>(
    () => api.residualDistribution(),
    [],
  );
  const bars = data ? bin(data) : [];

  return (
    <Panel>
      <PanelHeader
        title="Residual distribution"
        note={data ? `${data.length} bonds` : undefined}
      />

      {loading && <Loading label="Binning residuals" />}
      {error && <ErrorNote message={error} />}
      {data && bars.length === 0 && <Empty>No residuals stored yet.</Empty>}

      {bars.length > 0 && (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={bars} margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis
              {...axisProps}
              dataKey="bucket"
              interval={0}
              tickFormatter={(b: string) =>
                Number.isInteger(Number(b)) ? signed(Number(b)) : ""
              }
              label={{
                value: "Residual z-score",
                position: "insideBottom",
                offset: -14,
                fill: "#61738A",
                fontSize: 13,
              }}
            />
            <YAxis {...axisProps} width={48} allowDecimals={false} />
            <Tooltip
              {...tooltipProps}
              cursor={{ fill: "rgba(27,39,53,0.04)" }}
              labelFormatter={(b: string) => `z between ${b} and ${(Number(b) + 0.5).toFixed(1)}`}
              formatter={(v: number) => [`${v} bonds`, "Count"]}
            />
            <ReferenceLine x="0.0" stroke={chart.ink} strokeDasharray="3 3" />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {bars.map((b) => (
                <Cell
                  key={b.bucket}
                  fill={b.mid >= 0 ? chart.cheap : chart.rich}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
