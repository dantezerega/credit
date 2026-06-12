import { useState } from "react";
import { BacktestPanel } from "./components/BacktestPanel";
import { IssuerCurveChart } from "./components/IssuerCurveChart";
import { IssuerSelector } from "./components/IssuerSelector";
import { ResidualHistogram } from "./components/ResidualHistogram";
import { RVTable } from "./components/RVTable";
import { SectorPanel } from "./components/SectorPanel";
import { SignalsTable } from "./components/SignalsTable";
import { SpreadTimeSeries } from "./components/SpreadTimeSeries";
import { SummaryCards } from "./components/SummaryCards";

export default function App() {
  const [issuer, setIssuer] = useState<string | null>("EXXON MOBIL");

  return (
    <div className="min-h-screen p-6 max-w-[1600px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Credit Spread Relative Value Dashboard</h1>
          <p className="text-sm text-gray-400">
            Issuer-curve residuals · mean-reversion signals · sector RV · backtest
          </p>
        </div>
        <IssuerSelector value={issuer} onChange={setIssuer} />
      </header>

      <SummaryCards />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RVTable mode="cheapest" onSelectIssuer={setIssuer} />
        <RVTable mode="richest" onSelectIssuer={setIssuer} />
      </div>

      <SignalsTable onSelectIssuer={setIssuer} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <IssuerCurveChart issuer={issuer} />
        <SpreadTimeSeries issuer={issuer} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ResidualHistogram />
        <SectorPanel />
      </div>

      <BacktestPanel />

      <footer className="text-center text-xs text-gray-600 pt-4">
        Synthetic TRACE-substitute data · simplified OAS model · for research /
        educational use only.
      </footer>
    </div>
  );
}
