import { useEffect, useState } from "react";
import { BacktestPanel } from "./components/BacktestPanel";
import { IssuerCurveChart } from "./components/IssuerCurveChart";
import { IssuerSelector } from "./components/IssuerSelector";
import { Overview } from "./components/SummaryCards";
import { ResidualHistogram } from "./components/ResidualHistogram";
import { RVTable } from "./components/RVTable";
import { SectorPanel } from "./components/SectorPanel";
import { SignalsTable } from "./components/SignalsTable";
import { SpreadTimeSeries } from "./components/SpreadTimeSeries";
import { Section, cn } from "./components/ui";

const SECTIONS = [
  { id: "signals", label: "Signals" },
  { id: "cheap", label: "Cheap" },
  { id: "rich", label: "Rich" },
  { id: "curve", label: "Curve" },
  { id: "distribution", label: "Distribution" },
  { id: "sectors", label: "Sectors" },
  { id: "backtest", label: "Backtest" },
];

// A dot above the line and a dot below it — the residual, which is the whole
// subject of this dashboard, drawn as small as it will go.
function Mark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <line
        x1="2.5"
        y1="12"
        x2="21.5"
        y2="12"
        stroke="#1B2735"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="6" r="2.6" fill="#14A093" />
      <circle cx="16" cy="18" r="2.6" fill="#C13A57" />
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
      const line = 140; // just below the sticky bar
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

function TopBar({
  issuer,
  onIssuer,
}: {
  issuer: string | null;
  onIssuer: (i: string) => void;
}) {
  const active = useActiveSection(SECTIONS.map((s) => s.id));
  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-column items-center gap-6 px-6 md:px-10">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            Credit RV
          </span>
        </a>

        <nav className="hidden flex-1 items-center gap-1 xl:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13.5px] transition-colors duration-150",
                active === s.id
                  ? "bg-raised font-medium text-ink"
                  : "text-muted hover:text-ink",
              )}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 xl:ml-0">
          <span className="hidden text-[13px] text-faint sm:inline">Issuer</span>
          <IssuerSelector value={issuer} onChange={onIssuer} />
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [issuer, setIssuer] = useState<string | null>("EXXON MOBIL");

  return (
    <div className="min-h-screen bg-ground">
      <a
        href="#signals"
        className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to signals
      </a>

      <TopBar issuer={issuer} onIssuer={setIssuer} />

      <main id="top">
        <Overview />

        <div className="mx-auto max-w-column space-y-24 px-6 pb-24 pt-24 md:px-10 md:space-y-28">
          <Section
            id="signals"
            title="What the model would trade"
            lede="Bonds sitting more than two standard deviations off their own issuer curve, ranked by how far they have to travel to get back."
          >
            <SignalsTable onSelectIssuer={setIssuer} selected={issuer} />
          </Section>

          <Section
            id="cheap"
            title="Trading cheap to the curve"
            lede="The twenty widest residuals. A positive gap means the bond pays more spread than its issuer's curve implies, so you are paid more for the same credit risk."
          >
            <RVTable mode="cheapest" onSelectIssuer={setIssuer} selected={issuer} />
          </Section>

          <Section
            id="rich"
            title="Trading rich to the curve"
            lede="The twenty tightest residuals. A negative gap means the bond pays less than the curve implies, so you are giving up spread for nothing."
          >
            <RVTable mode="richest" onSelectIssuer={setIssuer} selected={issuer} />
          </Section>

          <Section
            id="curve"
            title="One issuer, close up"
            lede="Each dot is a bond. The line is the curve fitted through all of them. The vertical distance between the two is the residual everything else on this page is built from."
          >
            <div className="space-y-8">
              <IssuerCurveChart issuer={issuer} />
              <SpreadTimeSeries issuer={issuer} />
            </div>
          </Section>

          <Section
            id="distribution"
            title="How dislocated is the universe"
            lede="Residual z-scores across every bond tracked. The middle is noise; the tails are where the trades are."
          >
            <ResidualHistogram />
          </Section>

          <Section
            id="sectors"
            title="Sector relative value"
            lede="Average spread by sector, set against each sector's own history. This is the top-down view that says which part of the market to hunt in."
          >
            <SectorPanel />
          </Section>

          <Section
            id="backtest"
            title="Would it have worked"
            lede="Enter when a residual passes your threshold, exit when it returns to the curve. Results are in basis points of spread captured."
          >
            <BacktestPanel />
          </Section>
        </div>
      </main>

      <footer className="border-t border-hair bg-surface">
        <div className="mx-auto max-w-column px-6 py-10 md:px-10">
          <p className="max-w-prose font-serif text-[15px] leading-relaxed text-muted">
            Synthetic data stands in for TRACE, and the option-adjusted spread
            model is a simplified one. Built for research and teaching, not for
            trading.
          </p>
        </div>
      </footer>
    </div>
  );
}
