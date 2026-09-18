import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { RVRow } from "../types";
import {
  Deviation,
  ErrorNote,
  Field,
  Spec,
  Tag,
  cn,
  fmtDate,
  signed,
} from "./ui";

// The header of the blotter. The most characteristic thing in this subject's
// world is a bond sitting off its own issuer curve, so the run's parameters and
// the day's two extremes stand where a hero would — no pitch, no call to
// action, just the state of the screen.

function Extreme({
  label,
  row,
  max,
  tone,
}: {
  label: string;
  row: RVRow | null;
  max: number;
  tone: "cheap" | "rich";
}) {
  if (!row) {
    return (
      <div className="px-5 py-4">
        <p className="key">{label}</p>
        <p className="mt-2 text-[12.5px] text-muted">
          No bond breaches the threshold today.
        </p>
      </div>
    );
  }
  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="key">{label}</p>
        <Tag tone={tone}>{row.classification}</Tag>
      </div>

      <div className="mt-3 flex items-end justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-[15px] font-medium">{row.issuer}</p>
            <Tag>{row.rating}</Tag>
          </div>
          <p className="mt-1.5 font-mono text-[11.5px] text-faint">
            {row.cusip} · MAT {fmtDate(row.maturity)} · {row.sector.toUpperCase()}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 font-mono text-[30px] font-medium leading-none tracking-[-0.01em]",
            tone === "cheap" ? "text-cheap" : "text-rich",
          )}
        >
          {signed(row.residual, 1)}
          <span className="ml-1 text-[11.5px] font-normal text-faint">BP</span>
        </p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Deviation value={row.residual} max={max} width={104} />
        <span className="font-mono text-[11.5px] text-muted">
          Z {signed(row.z_score, 2)}
        </span>
        <span className="font-mono text-[11.5px] text-faint">
          PCT {row.percentile.toFixed(1)}
        </span>
        <span className="font-mono text-[11.5px] text-faint">
          MDL {row.model_spread.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export function BlotterHeader() {
  const { data, loading, error } = useApi(() => api.summary(), []);
  const max = data
    ? Math.max(
        Math.abs(data.cheapest?.residual ?? 0),
        Math.abs(data.richest?.residual ?? 0),
        1,
      )
    : 1;

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto max-w-blotter px-5 pb-6 pt-7 md:px-8">
        <div className="max-w-prose">
          <h1 className="text-[23px] font-medium leading-tight tracking-[-0.015em]">
            Credit relative value
          </h1>
          <p className="mt-2 text-read text-muted">
            Every bond is priced against a curve fitted to its own issuer. The
            gap between the two is the residual, and residuals revert.
          </p>
        </div>

        {error && (
          <div className="mt-6">
            <ErrorNote message={error} />
          </div>
        )}

        {loading && (
          <div className="mt-6 grid gap-px border border-line bg-hair sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-surface px-5 py-4">
                <div className="h-2 w-16 bg-hair" />
                <div className="mt-3 h-4 w-20 bg-hair" />
              </div>
            ))}
          </div>
        )}

        {data && (
          <>
            <div className="mt-6 grid gap-px border border-line bg-hair sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-surface px-5 py-4">
                <Field k="As of" v={fmtDate(data.as_of)} />
              </div>
              <div className="bg-surface px-5 py-4">
                <Field k="Bonds priced" v={String(data.total_bonds)} />
              </div>
              <div className="bg-surface px-5 py-4">
                <Field
                  k="Signals live"
                  v={String(data.active_signals)}
                  unit={`OF ${data.total_bonds}`}
                />
              </div>
              <div className="bg-surface px-5 py-4">
                <Field k="Entry threshold" v="±2.00" unit="σ" />
              </div>
            </div>

            <div className="mt-px grid gap-px border border-line bg-hair lg:grid-cols-2">
              <div className="bg-surface">
                <Extreme
                  label="Widest residual on the screen"
                  row={data.cheapest}
                  max={max}
                  tone="cheap"
                />
              </div>
              <div className="bg-surface">
                <Extreme
                  label="Tightest residual on the screen"
                  row={data.richest}
                  max={max}
                  tone="rich"
                />
              </div>
            </div>

            <Spec
              items={[
                ["Curve fit", "NS → SPLINE → LINEAR"],
                ["Z window", "252D TRAILING"],
                ["Day count", "ACT/365"],
                ["Discounting", "ANNUAL COMP"],
                ["Spread basis", "Z-SPREAD, BP"],
                ["Source", "SYNTHETIC TRACE"],
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}
