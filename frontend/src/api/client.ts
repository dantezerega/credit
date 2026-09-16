// Thin typed fetch wrapper around the backend API.
import type {
  Backtest,
  Bond,
  DashboardSummary,
  IssuerCurve,
  RVRow,
  SectorComparison,
  Signal,
  SpreadHistoryPoint,
} from "../types";

// Local dev proxies "/api" to the backend. On Vercel the FastAPI service is
// mounted under its routePrefix, so set VITE_API_BASE="/_/backend/api".
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  summary: () => get<DashboardSummary>("/dashboard/summary"),
  bonds: (params?: Record<string, string>) => get<Bond[]>("/bonds", params),
  issuers: () => get<string[]>("/issuers"),
  sectorsList: () => get<string[]>("/sectors/list"),
  cheapest: (limit = 20) => get<RVRow[]>("/rv/cheapest", { limit }),
  richest: (limit = 20) => get<RVRow[]>("/rv/richest", { limit }),
  topSignals: (limit = 10) => get<Signal[]>("/signals/top", { limit }),
  signals: () => get<Signal[]>("/signals"),
  issuerCurve: (issuer: string) => get<IssuerCurve>(`/issuer/${encodeURIComponent(issuer)}`),
  sectors: () => get<SectorComparison>("/sectors"),
  backtest: (entry_z = 2.0, exit_z = 0.0) =>
    get<Backtest>("/backtest", { entry_z, exit_z }),
  spreadHistory: (cusip: string) =>
    get<SpreadHistoryPoint[]>(`/spreads/history/${cusip}`),
  residualDistribution: () => get<number[]>("/residuals/distribution"),
};
