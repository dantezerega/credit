// Shared instrument primitives.
//
// The organising idea: every headline number in credit RV is a *signed
// deviation from a fitted curve*. So the page's signature device is a bar that
// grows out of a zero line — right and teal when a bond trades cheap, left and
// rose when it trades rich. Unipolar quantities (conviction, counts) get a
// segmented meter instead, so the two are never confused.
//
// Everything numeric is set in mono and tabular so columns of figures align
// down the page; prose is the exception, not the rule, and is held to one line
// per section. Uppercase is confined to column keys and parameter strips: it
// is how instrument labelling reads, and it never appears above a heading.
import { useEffect, useState, type ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- formatting */

const MINUS = "−"; // true minus sign, not a hyphen

export function signed(value: number, digits = 0): string {
  const body = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${body}`;
  if (value < 0) return `${MINUS}${body}`;
  return body;
}

// ISO dates throughout. Locale dates are friendlier to read one at a time and
// worse to read in a column, which is how dates appear here.
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(5, 10);
}

// Curve-fit identifiers come off the API in snake_case; they belong in the
// parameter strips, where the house style is uppercase.
const METHOD_LABELS: Record<string, string> = {
  nelson_siegel: "NELSON-SIEGEL",
  cubic_spline: "CUBIC SPLINE",
  linear: "LINEAR",
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method.replace(/_/g, " ").toUpperCase();
}

/* ------------------------------------------------------------------- motion */

// Lets a bar animate out of the zero line once, on first paint.
function useGrow(target: number): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setW(target);
      return;
    }
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return w;
}

/* -------------------------------------------------------------------- chrome */

export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-panel border border-line bg-surface",
        padded && "p-5 md:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

// A section: short technical title, the shortcut that jumps here, one line
// defining what the figures are, then the panel.
export function Section({
  id,
  hotkey,
  title,
  note,
  action,
  children,
}: {
  id: string;
  hotkey?: string;
  title: string;
  note: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 border-b border-line pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-prose">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-[19px] font-medium leading-none tracking-[-0.01em]">
                {title}
              </h2>
              {hotkey && <Hotkey>{hotkey}</Hotkey>}
            </div>
            <p className="mt-2 text-read text-muted">{note}</p>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  note,
  action,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h3 className="font-mono text-[12px] font-semibold uppercase tracking-[0.07em]">
        {title}
      </h3>
      <div className="flex items-center gap-3">
        {note && <span className="font-mono text-[11.5px] text-faint">{note}</span>}
        {action}
      </div>
    </div>
  );
}

// The parameters that produced the numbers above it. Every panel carries one,
// because a residual is meaningless without the fit and window behind it.
export function Spec({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hair pt-3">
      {items.map(([k, v], i) => (
        <div
          key={k}
          className={cn(
            "flex items-baseline gap-1.5",
            i > 0 && "border-l border-hair pl-3",
          )}
        >
          <dt className="key">{k}</dt>
          <dd className="font-mono text-[11.5px] text-muted">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// A single readout: key above value. Used in the blotter header strip.
export function Field({
  k,
  v,
  unit,
  tone,
}: {
  k: string;
  v: string;
  unit?: string;
  tone?: "cheap" | "rich";
}) {
  return (
    <div>
      <p className="key">{k}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-[19px] font-medium leading-none",
          tone === "cheap" && "text-cheap",
          tone === "rich" && "text-rich",
        )}
      >
        {v}
        {unit && <span className="ml-1 text-[11.5px] font-normal text-faint">{unit}</span>}
      </p>
    </div>
  );
}

export function Hotkey({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-chip border border-hair bg-raised px-1.5 py-px font-mono text-[10.5px] font-medium text-faint">
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------- states */

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 font-mono text-[12px] uppercase tracking-[0.07em] text-faint">
      {label}
      <span className="caret inline-block h-[11px] w-[6px] bg-focus" />
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-panel border border-rich/35 bg-richWash px-4 py-3">
      <p className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-rich">
        Request failed
      </p>
      <p className="mt-1.5 break-words font-mono text-[12px] leading-relaxed text-rich/85">
        {message}
      </p>
      <p className="mt-2 text-[12.5px] text-muted">
        Start the API, then reload.
      </p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-line bg-raised px-4 py-6 text-[12.5px] text-muted">
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------- data */

// Zero-anchored bar for a signed quantity. Right of the tick = cheap. Square
// ends: this is a measurement, not a pill.
export function Deviation({
  value,
  max,
  width = 76,
}: {
  value: number;
  max: number;
  width?: number;
}) {
  const span = max > 0 ? Math.min(Math.abs(value) / max, 1) : 0;
  const pct = useGrow(span * 50);
  const positive = value >= 0;
  return (
    <div
      className="relative h-[8px] shrink-0 bg-sunken"
      style={{ width }}
      aria-hidden="true"
    >
      <div
        className={cn(
          "absolute top-0 h-[8px] transition-[width] duration-700 ease-out",
          positive ? "left-1/2 bg-cheapBright" : "right-1/2 bg-richBright",
        )}
        style={{ width: `${pct}%` }}
      />
      <div className="absolute inset-y-[-2px] left-1/2 w-px -translate-x-1/2 bg-ink/35" />
    </div>
  );
}

// Segmented meter for a 0–100 quantity that has no sign. Discrete cells read
// as a gauge; a smooth bar would read as another deviation.
export function Meter({ value, cells = 10 }: { value: number; cells?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const lit = useGrow(Math.round((clamped / 100) * cells));
  return (
    <div className="flex shrink-0 items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-[8px] w-[5px] transition-colors duration-500",
            i < lit ? "bg-ink/75" : "bg-sunken",
          )}
        />
      ))}
    </div>
  );
}

export function Signed({
  value,
  digits = 0,
  unit,
  className,
}: {
  value: number;
  digits?: number;
  unit?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono font-medium",
        value > 0 ? "text-cheap" : value < 0 ? "text-rich" : "text-muted",
        className,
      )}
    >
      {signed(value, digits)}
      {unit && <span className="text-[0.85em] font-normal text-faint">{unit}</span>}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "cheap" | "rich";
}) {
  const tones = {
    neutral: "border-hair bg-raised text-muted",
    cheap: "border-cheap/25 bg-cheapWash text-cheap",
    rich: "border-rich/25 bg-richWash text-rich",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-chip border px-1.5 py-[1px] font-mono text-[11px] font-medium uppercase tracking-[0.04em]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ controls */

export function Select({
  value,
  onChange,
  options,
  label,
  placeholder = "Select…",
  compact = false,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  placeholder?: string;
  compact?: boolean;
  inputRef?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <div className="relative">
      <select
        ref={inputRef}
        aria-label={label}
        className={cn(
          "w-full appearance-none rounded-chip border border-line bg-surface font-mono font-medium text-ink",
          "transition-colors duration-150 hover:border-ink/40",
          compact
            ? "py-1 pl-2.5 pr-7 text-[12px]"
            : "py-1.5 pl-3 pr-8 text-[12.5px]",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 12 12"
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-faint",
          compact ? "right-2 h-3 w-3" : "right-2.5 h-3 w-3",
        )}
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// Discrete parameter values get real buttons rather than a slider you nudge.
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex divide-x divide-line overflow-hidden rounded-chip border border-line"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-2.5 py-1 font-mono text-[12px] font-medium transition-colors duration-150",
              active
                ? "bg-ink text-white"
                : "bg-surface text-muted hover:bg-raised hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- tables */

export function Th({
  children,
  align = "left",
  group = false,
}: {
  children: ReactNode;
  align?: "left" | "right";
  group?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "key whitespace-nowrap border-b border-line px-3 py-2",
        align === "right" ? "text-right" : "text-left",
        group && "group-start",
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align,
  num = false,
  group = false,
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  num?: boolean;
  group?: boolean;
  className?: string;
}) {
  const side = align ?? (num ? "right" : "left");
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-[7px] text-cell",
        num && "font-mono",
        side === "right" ? "text-right" : "text-left",
        group && "group-start",
        className,
      )}
    >
      {children}
    </td>
  );
}

// A table row that selects an issuer. Clickable rows need keyboard parity.
export function SelectableRow({
  onSelect,
  selected,
  children,
}: {
  onSelect?: () => void;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <tr
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (!onSelect) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "border-b border-hair transition-colors duration-100 last:border-0",
        onSelect && "cursor-pointer hover:bg-raised",
        selected && "bg-cheapWash/60",
      )}
    >
      {children}
    </tr>
  );
}

/* -------------------------------------------------------------- chart tokens */

export const chart = {
  ink: "#121C27",
  cheap: "#12A093",
  rich: "#D9486A",
  cobalt: "#1F4FD8",
  grid: "#E1E8EF",
  axis: "#8496A8",
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

export const axisProps = {
  stroke: chart.axis,
  tickLine: false,
  axisLine: { stroke: chart.grid },
  tick: { fill: "#55677B", fontSize: 11, fontFamily: chart.mono },
} as const;

export const axisLabel = {
  fill: "#8496A8",
  fontSize: 10.5,
  fontFamily: chart.mono,
  letterSpacing: "0.08em",
} as const;

export const tooltipProps = {
  contentStyle: {
    background: "#FFFFFF",
    border: "1px solid #C7D2DE",
    borderRadius: 2,
    boxShadow: "none",
    padding: "8px 10px",
    fontSize: 11.5,
    fontFamily: chart.mono,
  },
  labelStyle: {
    color: "#121C27",
    fontWeight: 600,
    marginBottom: 4,
    fontFamily: chart.mono,
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  },
  itemStyle: { color: "#55677B", padding: 0, fontFamily: chart.mono },
  cursor: { stroke: "#C7D2DE", strokeWidth: 1, strokeDasharray: "3 3" },
} as const;
