// Typed mirrors of the backend Pydantic schemas (the API contract).

export interface Bond {
  cusip: string;
  issuer: string;
  sector: string;
  rating: string;
  coupon: number;
  maturity: string;
  issue_date: string;
  coupon_freq: number;
}

export interface RVRow {
  cusip: string;
  issuer: string;
  rating: string;
  sector: string;
  maturity: string;
  current_spread: number;
  model_spread: number;
  residual: number;
  z_score: number;
  percentile: number;
  classification: "CHEAP" | "RICH" | "FAIR";
}

export interface Signal {
  cusip: string;
  trade_date: string;
  direction: "BUY" | "SELL" | "FLAT";
  z_score: number;
  residual: number;
  expected_reversion_bps: number;
  signal_strength: number;
  issuer: string;
  rating: string;
  sector: string;
  maturity: string;
}

export interface DashboardSummary {
  as_of: string;
  total_bonds: number;
  active_signals: number;
  cheapest: RVRow | null;
  richest: RVRow | null;
}

export interface CurvePoint {
  cusip: string;
  maturity_years: number;
  actual_spread: number;
  model_spread: number;
  residual: number;
}

export interface IssuerCurve {
  issuer: string;
  trade_date: string;
  method: string;
  points: CurvePoint[];
  fitted_tenors: number[];
  fitted_spreads: number[];
}

export interface SectorStat {
  sector: string;
  avg_spread: number;
  z_score: number;
  percentile: number;
  n_bonds: number;
}

export interface SectorComparison {
  trade_date: string;
  sectors: SectorStat[];
  narrative: string[];
}

export interface Backtest {
  entry_z: number;
  exit_z: number;
  n_trades: number;
  hit_rate: number;
  avg_reversion_bps: number;
  sharpe: number;
  max_drawdown_bps: number;
}

export interface SpreadHistoryPoint {
  trade_date: string;
  g_spread: number;
  i_spread: number;
  z_spread: number;
  oas: number;
}

export interface Filters {
  issuer?: string;
  sector?: string;
  rating?: string;
}
