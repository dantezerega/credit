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
  PanelHead,
  Spec,
  axisLabel,
  axisProps,
  chart,
  signed,
  tooltipProps,
} from "./ui";

interface Bucket {
  bucket: string;
  mid: number;
  count: number;
}

const WIDTH = 0.5; // bin width in standard deviations
const ENTRY = 2.0; // the threshold the signal engine trades

// Bins residual z-scores so the shape of the dislocation distribution is
// visible: a bell through the middle, and the fat tails that carry the trades.
function bin(values: number[], width = WIDTH): Bucket[] {
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

  // Inside the threshold the distribution is noise, so those bars are grey;
  // colour is spent only on the tails, which are the tradeable population.
  const n = data?.length ?? 0;
  const cheapTail = data ? data.filter((v) => v >= ENTRY).length : 0;
  const richTail = data ? data.filter((v) => v <= -ENTRY).length : 0;
  const mean = n ? data!.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n
    ? Math.sqrt(data!.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
    : 0;
  const has = (key: string) => bars.some((b) => b.bucket === key);

  return (
    <Panel>
      <PanelHead
        title="Standardised residuals"
        note={n ? `${n} bonds · bin ${WIDTH.toFixed(1)}σ` : undefined}
      />

      {loading && <Loading label="Binning residuals" />}
      {error && <ErrorNote message={error} />}
      {data && bars.length === 0 && <Empty>No residuals stored yet.</Empty>}

      {bars.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bars} margin={{ top: 10, right: 14, bottom: 24, left: 4 }}>
              <CartesianGrid stroke={chart.grid} strokeDasharray="2 3" vertical={false} />
              <XAxis
                {...axisProps}
                dataKey="bucket"
                interval={0}
                tickFormatter={(b: string) =>
                  Number.isInteger(Number(b)) ? signed(Number(b)) : ""
                }
                label={{
                  value: "RESIDUAL Z-SCORE (σ)",
                  position: "insideBottom",
                  offset: -12,
                  ...axisLabel,
                }}
              />
              <YAxis
                {...axisProps}
                width={48}
                allowDecimals={false}
                label={{
                  value: "BONDS",
                  angle: -90,
                  position: "insideLeft",
                  offset: 14,
                  ...axisLabel,
                }}
              />
              <Tooltip
                {...tooltipProps}
                cursor={{ fill: "rgba(18,28,39,0.04)" }}
                labelFormatter={(b: string) =>
                  `z ${Number(b).toFixed(1)} to ${(Number(b) + WIDTH).toFixed(1)}`
                }
                formatter={(v: number) => [
                  `${v} bonds · ${((v / n) * 100).toFixed(1)}%`,
                  "Count",
                ]}
              />
              {has("0.0") && (
                <ReferenceLine x="0.0" stroke={chart.axis} strokeDasharray="3 3" />
              )}
              {has("2.0") && (
                <ReferenceLine
                  x="2.0"
                  stroke={chart.cheap}
                  strokeDasharray="4 3"
                  label={{ value: "+2σ", position: "top", ...axisLabel, fill: chart.cheap }}
                />
              )}
              {has("-2.0") && (
                <ReferenceLine
                  x="-2.0"
                  stroke={chart.rich}
                  strokeDasharray="4 3"
                  label={{ value: "−2σ", position: "top", ...axisLabel, fill: chart.rich }}
                />
              )}
              <Bar dataKey="count" isAnimationActive={false}>
                {bars.map((b) => (
                  <Cell
                    key={b.bucket}
                    fill={
                      b.mid >= ENTRY
                        ? chart.cheap
                        : b.mid + WIDTH <= -ENTRY
                          ? chart.rich
                          : "#C7D2DE"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <Spec
            items={[
              ["Bonds", String(n)],
              ["Bin", `${WIDTH.toFixed(1)}σ`],
              ["Mean", `${signed(mean, 2)}σ`],
              ["Stdev", `${sd.toFixed(2)}σ`],
              ["Cheap tail", `${cheapTail} ≥ +2σ`],
              ["Rich tail", `${richTail} ≤ −2σ`],
            ]}
          />
        </>
      )}
    </Panel>
  );
}
