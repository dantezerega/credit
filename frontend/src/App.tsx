import { useCallback, useEffect, useState } from "react";
import { BacktestPanel } from "./components/BacktestPanel";
import { BlotterHeader } from "./components/BlotterHeader";
import { IssuerCurveChart } from "./components/IssuerCurveChart";
import { IssuerSelector } from "./components/IssuerSelector";
import { ResidualHistogram } from "./components/ResidualHistogram";
import { RVTable } from "./components/RVTable";
import { SectorPanel } from "./components/SectorPanel";
import { SignalsTable } from "./components/SignalsTable";
import { SpreadTimeSeries } from "./components/SpreadTimeSeries";
import { Hotkey, Section, cn } from "./components/ui";

// Sections are numbered because the numbers are the shortcut that jumps to
// them, not because the page is a sequence.
const SECTIONS = [
  { id: "signals", label: "Signals" },
  { id: "cheap", label: "Cheap" },
  { id: "rich", label: "Rich" },
  { id: "curve", label: "Curve" },
  { id: "distribution", label: "Distribution" },
  { id: "sectors", label: "Sectors" },
  { id: "backtest", label: "Backtest" },
];

// A tick above the line and a tick below it — the residual, which is the whole
// subject of this dashboard, drawn as small as it will go.
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <line x1="2" y1="11" x2="20" y2="11" stroke="#121C27" strokeWidth="1.5" />
      <rect x="4.5" y="3.5" width="5" height="5" fill="#12A093" />
      <rect x="12.5" y="13.5" width="5" height="5" fill="#D9486A" />
    </svg>
  );
}

// Which section the reader is in. Computed straight from scroll position
// rather than from IntersectionObserver entries, so a jump to an anchor lands
// on the right link instead of keeping whatever was last observed.
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join(",");

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = 120; // just below the sticky bar
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // The last section is short enough that it may never cross the line.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8;
      setActive(atBottom ? ids[ids.length - 1] : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}

// Digits jump between sections. A screen this long is faster to drive from the
// keyboard, and the same digits are printed next to every heading so the
// shortcut is discoverable without a legend.
function useSectionKeys(ids: string[]) {
  const key = ids.join(",");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (t?.isContentEditable || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > ids.length) return;
      const el = document.getElementById(ids[n - 1]);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

function CommandBar({
  issuer,
  onIssuer,
}: {
  issuer: string | null;
  onIssuer: (i: string) => void;
}) {
  const active = useActiveSection(SECTIONS.map((s) => s.id));
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 shadow-bar backdrop-blur">
      <div className="mx-auto flex h-[52px] max-w-blotter items-center gap-5 px-5 md:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2">
          <Mark />
          <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.1em]">
            Credit RV
          </span>
        </a>

        <nav className="hidden flex-1 items-center gap-px xl:flex" aria-label="Sections">
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "flex items-baseline gap-1.5 rounded-chip px-2.5 py-1 font-mono text-[11.5px] uppercase tracking-[0.07em] transition-colors duration-150",
                active === s.id
                  ? "bg-ink text-white"
                  : "text-muted hover:bg-raised hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "text-[10px]",
                  active === s.id ? "text-white/55" : "text-faint",
                )}
              >
                {i + 1}
              </span>
              {s.label}
            </a>
          ))}
        </nav>

        <label className="ml-auto flex items-center gap-2 xl:ml-0">
          <span className="key hidden sm:inline">Issuer</span>
          <div className="w-[176px] sm:w-[210px]">
            <IssuerSelector value={issuer} onChange={onIssuer} />
          </div>
        </label>
      </div>
    </header>
  );
}

export default function App() {
  const [issuer, setIssuer] = useState<string | null>("EXXON MOBIL");
  useSectionKeys(SECTIONS.map((s) => s.id));

  // The issuer only drives the curve and history panels, which sit thousands of
  // pixels below the bar the picker lives in — so choosing one looked like it
  // did nothing at all. Carry the reader to what they just chose, unless it is
  // already in front of them.
  const selectIssuer = useCallback((next: string) => {
    setIssuer(next);
    const el = document.getElementById("curve");
    if (!el) return;
    const box = el.getBoundingClientRect();
    const alreadyInView = box.top < window.innerHeight - 160 && box.bottom > 160;
    // Instant, not smooth: this jump is several thousand pixels, and animating
    // it is a long disorienting blur rather than a helpful transition.
    if (!alreadyInView) el.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);

  return (
    <div className="min-h-screen bg-ground">
      <a
        href="#signals"
        className="sr-only focus:not-sr-only focus:absolute focus:left-5 focus:top-2.5 focus:z-50 focus:rounded-chip focus:bg-ink focus:px-3 focus:py-1.5 focus:font-mono focus:text-[12px] focus:uppercase focus:tracking-[0.06em] focus:text-white"
      >
        Skip to signals
      </a>

      <CommandBar issuer={issuer} onIssuer={selectIssuer} />

      <main id="top">
        <BlotterHeader />

        <div className="mx-auto max-w-blotter space-y-14 px-5 pb-16 pt-12 md:px-8">
          <Section
            id="signals"
            hotkey="1"
            title="Signals"
            note="Bonds more than 2σ off their own issuer curve, ranked by the spread move the model expects them to give back."
          >
            <SignalsTable onSelectIssuer={selectIssuer} selected={issuer} />
          </Section>

          <Section
            id="cheap"
            hotkey="2"
            title="Cheap to curve"
            note="The twenty widest residuals. A positive residual pays more spread than the issuer's curve implies, for the same credit risk."
          >
            <RVTable mode="cheapest" onSelectIssuer={selectIssuer} selected={issuer} />
          </Section>

          <Section
            id="rich"
            hotkey="3"
            title="Rich to curve"
            note="The twenty tightest residuals. A negative residual pays less spread than the curve implies, so the bond gives up carry for nothing."
          >
            <RVTable mode="richest" onSelectIssuer={selectIssuer} selected={issuer} />
          </Section>

          <Section
            id="curve"
            hotkey="4"
            title="Issuer curve"
            note="Observed Z-spreads against the curve fitted through them. The vertical gap is the residual every other panel is built from."
          >
            <div className="space-y-4">
              <IssuerCurveChart issuer={issuer} />
              <SpreadTimeSeries issuer={issuer} />
            </div>
          </Section>

          <Section
            id="distribution"
            hotkey="5"
            title="Residual distribution"
            note="Standardised residuals across the whole universe. The middle is noise; the tails past ±2σ are where the signals come from."
          >
            <ResidualHistogram />
          </Section>

          <Section
            id="sectors"
            hotkey="6"
            title="Sector relative value"
            note="Each sector's average Z-spread against the universe average, coloured by where that sector sits in its own history."
          >
            <SectorPanel />
          </Section>

          <Section
            id="backtest"
            hotkey="7"
            title="Backtest"
            note="Open at the entry threshold, close when the residual returns to the curve. Results are in basis points of spread captured."
          >
            <BacktestPanel />
          </Section>
        </div>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-blotter px-5 py-6 md:px-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <span className="key">Keys</span>
            <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-muted">
              <Hotkey>1</Hotkey>
              <span className="text-faint">–</span>
              <Hotkey>7</Hotkey>
              jump between sections
            </span>
          </div>
          <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-muted">
            Prices and spreads are synthetic, standing in for TRACE, and the OAS
            model is a closed-form simplification rather than a lattice. Research
            and teaching only — not investment advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
