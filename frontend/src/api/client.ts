// Thin typed fetch wrapper around the backend API.
//
// Two modes. Against a live backend the call is an ordinary request with a
// query string. Deployed without one (Vercel), the API is instead a tree of
// JSON files produced by backend/scripts/export_snapshot.py — and because
// static hosting ignores query strings, parameters have to move into the
// filename. The path rule below is mirrored exactly in that generator; change
// one and you must change the other.
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

type Params = Record<string, string | number>;

// Local dev proxies "/api" to the backend. The static build points this at the
// snapshot directory instead.
const BASE = import.meta.env.VITE_API_BASE ?? "/api";
const STATIC = import.meta.env.VITE_API_STATIC === "1";

/** Filename-safe form of one path segment or parameter value. */
function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** "/rv/cheapest" + {limit: 20} -> "/rv/cheapest__limit-20.json" */
function snapshotUrl(path: string, params?: Params): string {
  const query = params
    ? Object.keys(params)
        .sort()
        .map((k) => `${k}-${slug(String(params[k]))}`)
        .join(",")
    : "";
  const file = segments(path).map(slug).join("/");
  return `${BASE}/${file}${query ? `__${query}` : ""}.json`;
}

function liveUrl(path: string, params?: Params): string {
  const url = new URL(
    `${BASE}/${segments(path).map(encodeURIComponent).join("/")}`,
    window.location.origin,
  );
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function get<T>(path: string, params?: Params): Promise<T> {
  const target = STATIC ? snapshotUrl(path, params) : liveUrl(path, params);
  const res = await fetch(target);
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
  issuerCurve: (issuer: string) => get<IssuerCurve>(`/issuer/${issuer}`),
  sectors: () => get<SectorComparison>("/sectors"),
  backtest: (entry_z = 2.0, exit_z = 0.0) =>
    get<Backtest>("/backtest", { entry_z, exit_z }),
  spreadHistory: (cusip: string) =>
    get<SpreadHistoryPoint[]>(`/spreads/history/${cusip}`),
  residualDistribution: () => get<number[]>("/residuals/distribution"),
};
