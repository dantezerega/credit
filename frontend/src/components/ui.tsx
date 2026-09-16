// Shared design primitives.
//
// The organising idea: every headline number in credit RV is a *signed
// deviation from a fitted curve*. So the page's signature device is a bar that
// grows out of a zero line — right and teal when a bond trades cheap, left and
// rose when it trades rich. Unipolar quantities (conviction, counts) keep a
// plain left-anchored bar, so the two never get confused.
import { useEffect, useRef, useState, type ReactNode } from "react";

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

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Curve-fit identifiers come off the API in snake_case; nobody reads that.
const METHOD_LABELS: Record<string, string> = {
  nelson_siegel: "Nelson-Siegel",
  cubic_spline: "cubic spline",
  linear: "linear",
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method.replace(/_/g, " ");
}

export function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
        "bg-surface border border-hair rounded-2xl shadow-panel",
        padded && "p-6 md:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

// A section: heading, a plain-English line saying what you're looking at, then
// the panel. No eyebrow labels — the gloss does that job better.
export function Section({
  id,
  title,
  lede,
  action,
  children,
}: {
  id: string;
  title: string;
  lede: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-prose">
          <h2 className="text-[27px] leading-tight font-semibold tracking-[-0.015em]">
            {title}
          </h2>
          <p className="mt-2 font-serif text-[16px] leading-relaxed text-muted">
            {lede}
          </p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  note,
  action,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
      <div className="flex items-center gap-3">
        {note && <span className="text-[13px] text-faint">{note}</span>}
        {action}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- states */

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-[14px] text-faint">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-focus opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-focus" />
      </span>
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rich/25 bg-richWash px-5 py-4">
      <p className="text-[14px] font-medium text-rich">Couldn't load this.</p>
      <p className="mt-1 font-mono text-[12.5px] leading-relaxed text-rich/80">
        {message}
      </p>
      <p className="mt-2 text-[13px] text-muted">
        Check the API is running, then reload.
      </p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-raised px-5 py-8 text-center font-serif text-[15px] text-muted">
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------- data */

// Zero-anchored bar for a signed quantity. Right of the tick = cheap.
export function Deviation({
  value,
  max,
  width = 84,
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
      className="relative h-[7px] shrink-0 rounded-full bg-raised"
      style={{ width }}
      aria-hidden="true"
    >
      <div className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-line" />
      <div
        className={cn(
          "absolute top-0 h-[7px] transition-[width] duration-700 ease-out",
          positive
            ? "left-1/2 rounded-r-full bg-cheapBright"
            : "right-1/2 rounded-l-full bg-richBright",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Left-anchored bar for a 0–100 quantity that has no sign.
export function Meter({ value, width = 68 }: { value: number; width?: number }) {
  const pct = useGrow(Math.max(0, Math.min(100, value)));
  return (
    <div
      className="h-[7px] shrink-0 overflow-hidden rounded-full bg-raised"
      style={{ width }}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full bg-ink/70 transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
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
        "num font-medium",
        value > 0 ? "text-cheap" : value < 0 ? "text-rich" : "text-muted",
        className,
      )}
    >
      {signed(value, digits)}
      {unit && <span className="text-[0.85em] font-normal">{unit}</span>}
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
    neutral: "bg-raised text-muted border-hair",
    cheap: "bg-cheapWash text-cheap border-cheap/20",
    rich: "bg-richWash text-rich border-rich/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[12.5px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ controls */

export function Button({
  children,
  onClick,
  href,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "quiet";
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-[14.5px] font-medium transition-colors duration-150";
  const styles = {
    primary: "bg-ink text-white hover:bg-ink/85 active:bg-ink",
    quiet:
      "border border-line bg-surface text-ink hover:border-ink/35 hover:bg-raised",
  };
  const cls = cn(base, styles[variant]);
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  placeholder = "Choose…",
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        className={cn(
          "w-full appearance-none rounded-xl border border-line bg-surface font-medium text-ink",
          "transition-colors duration-150 hover:border-ink/35",
          compact
            ? "py-1.5 pl-3 pr-8 text-[13.5px]"
            : "py-2.5 pl-4 pr-10 text-[14.5px]",
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
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted",
          compact ? "right-2.5 h-3 w-3" : "right-3.5 h-3.5 w-3.5",
        )}
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// Discrete choices get real buttons rather than a slider you have to nudge.
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
      className="inline-flex rounded-xl border border-line bg-raised p-1"
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
              "num rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors duration-150",
              active
                ? "bg-surface text-ink shadow-bar"
                : "text-muted hover:text-ink",
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
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-line px-4 py-3 text-[13px] font-semibold text-muted",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-4 py-3.5 text-[14.5px]",
        align === "right" ? "text-right" : "text-left",
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
  const ref = useRef<HTMLTableRowElement>(null);
  return (
    <tr
      ref={ref}
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
        selected && "bg-cheapWash/45",
      )}
    >
      {children}
    </tr>
  );
}

/* -------------------------------------------------------------- chart tokens */

export const chart = {
  ink: "#1B2735",
  cheap: "#14A093",
  rich: "#D9486A",
  cobalt: "#2E62D8",
  grid: "#E6EBF1",
  axis: "#8A99AC",
};

export const axisProps = {
  stroke: chart.axis,
  fontSize: 12,
  tickLine: false,
  axisLine: false,
  tick: { fill: "#61738A" },
} as const;

export const tooltipProps = {
  contentStyle: {
    background: "#FFFFFF",
    border: "1px solid #E6EBF1",
    borderRadius: 12,
    boxShadow: "0 8px 28px -12px rgba(27,39,53,0.28)",
    padding: "10px 12px",
    fontSize: 13,
  },
  labelStyle: { color: "#1B2735", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "#61738A", padding: 0 },
  cursor: { stroke: "#D6DEE7", strokeWidth: 1 },
} as const;
