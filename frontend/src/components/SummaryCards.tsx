import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { RVRow } from "../types";
import {
  Button,
  Deviation,
  ErrorNote,
  Tag,
  cn,
  fmtDate,
  signed,
} from "./ui";

// The masthead. The most characteristic thing in this subject's world is a
// bond sitting off its own curve, so the two extremes lead the page rather
// than a row of identical stat cards.

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
      <div className="py-2">
        <p className="text-[13px] text-faint">{label}</p>
        <p className="mt-2 font-serif text-[15px] text-muted">
          Nothing stands out today.
        </p>
      </div>
    );
  }
  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <p className="text-[13px] text-faint">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="truncate text-[17px] font-semibold leading-snug">
              {row.issuer}
            </p>
            <Tag>{row.rating}</Tag>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="font-mono text-[12.5px]">{row.cusip}</span>
            <span>matures {fmtDate(row.maturity)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "num text-[40px] font-semibold leading-none tracking-[-0.02em]",
              tone === "cheap" ? "text-cheap" : "text-rich",
            )}
          >
            {signed(row.residual)}
          </p>
          <p className="mt-1.5 text-[12.5px] text-muted">
            basis points {tone === "cheap" ? "cheap" : "rich"}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Deviation value={row.residual} max={max} width={120} />
        <span className="num text-[13px] text-muted">
          {Math.abs(row.z_score).toFixed(1)}&#963; from its curve
        </span>
      </div>
    </div>
  );
}

function StripItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-0 py-1 sm:px-8 sm:first:pl-0">
      <p className="num text-[24px] font-semibold leading-none tracking-[-0.015em]">
        {value}
      </p>
      <p className="mt-2 text-[13px] text-muted">{label}</p>
    </div>
  );
}

export function Overview() {
  const { data, loading, error } = useApi(() => api.summary(), []);
  const max = data
    ? Math.max(
        Math.abs(data.cheapest?.residual ?? 0),
        Math.abs(data.richest?.residual ?? 0),
        1,
      )
    : 1;

  return (
    <div className="border-b border-hair bg-surface">
      <div className="mx-auto max-w-column px-6 pb-12 pt-16 md:px-10 md:pb-16 md:pt-24">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <h1 className="max-w-[14ch] text-[44px] font-semibold leading-[1.04] tracking-[-0.03em] md:text-[56px]">
              Where credit is mispriced today
            </h1>
            <p className="mt-6 max-w-prose font-serif text-[18px] leading-relaxed text-muted">
              {data ? `${data.total_bonds} investment-grade bonds` : "Every bond here"},
              each priced against the curve its own issuer trades on. The gap
              between the two is the residual, and residuals tend to close.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="#signals">See today's signals</Button>
              <Button href="#curve" variant="quiet">
                Look at a curve
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5">
            {error && <ErrorNote message={error} />}
            {loading && (
              <div className="space-y-6">
                {[0, 1].map((i) => (
                  <div key={i} className="animate-pulse space-y-3">
                    <div className="h-3 w-24 rounded bg-hair" />
                    <div className="h-5 w-40 rounded bg-hair" />
                    <div className="h-9 w-28 rounded bg-hair" />
                  </div>
                ))}
              </div>
            )}
            {data && (
              <div className="divide-y divide-hair rounded-2xl border border-hair bg-raised/60 px-6 py-5">
                <Extreme
                  label="Cheapest bond on the screen"
                  row={data.cheapest}
                  max={max}
                  tone="cheap"
                />
                <Extreme
                  label="Richest bond on the screen"
                  row={data.richest}
                  max={max}
                  tone="rich"
                />
              </div>
            )}
          </div>
        </div>

        {data && (
          <div className="mt-14 flex flex-col gap-6 border-t border-hair pt-8 sm:flex-row sm:divide-x sm:divide-hair">
            <StripItem value={String(data.total_bonds)} label="Bonds tracked" />
            <StripItem
              value={String(data.active_signals)}
              label="Active signals"
            />
            <StripItem value={fmtDate(data.as_of)} label="Priced as of" />
          </div>
        )}
      </div>
    </div>
  );
}
