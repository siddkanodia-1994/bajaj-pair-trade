export type WindowKey = '3M' | '6M' | '1Y' | '2Y' | '3Y' | '4Y' | '5Y' | 'ALL'

export const WINDOW_TRADING_DAYS: Record<WindowKey, number> = {
  '3M': 60,
  '6M': 126,
  '1Y': 252,
  '2Y': 504,
  '3Y': 756,
  '4Y': 1008,
  '5Y': 1260,
  'ALL': 99999, // placeholder — calendar logic handles ALL separately
}

// Calendar months per window (used for exact date-anchored rolling windows)
export const WINDOW_MONTHS: Partial<Record<WindowKey, number>> = {
  '3M': 3,
  '6M': 6,
  '1Y': 12,
  '2Y': 24,
  '3Y': 36,
  '4Y': 48,
  '5Y': 60,
  // 'ALL' intentionally omitted — uses full dataset from first available date
}

export const WINDOW_KEYS: WindowKey[] = ['3M', '6M', '1Y', '2Y', '3Y', '4Y', '5Y', 'ALL']

export interface WindowStats {
  mean: number | null
  std: number | null
  zscore: number | null
  percentile_rank: number | null
  upper_1sd: number | null
  lower_1sd: number | null
  upper_2sd: number | null
  lower_2sd: number | null
}

export interface SpreadPoint {
  date: string
  stake_pct: number
  underlying_stake_value: number // stake_pct × fin_mcap (₹ crore)
  residual_value: number         // finsv_mcap − underlying_stake_value (₹ crore)
  spread_pct: number             // residual / finsv_mcap × 100
  finsv_mcap: number
  fin_mcap: number
  windows: Record<WindowKey, WindowStats>
}

export interface EodPriceRow {
  id: number
  date: string
  finsv_price: number
  finsv_mcap: number
  fin_price: number
  fin_mcap: number
}

export interface StakeHistoryRow {
  id: number
  quarter_end_date: string
  stake_pct: number
  source: string | null
}

export interface LiveQuote {
  ticker: string
  price: number
  mcap: number        // ₹ crore
  change_pct: number
  last_updated: string
}

export interface LiveSpreadData {
  finsv: LiveQuote
  fin: LiveQuote
  stake_pct: number
  underlying_stake_value: number
  residual_value: number
  spread_pct: number
  as_of: string
}

export type SignalType = 'STRONG_LONG' | 'LONG' | 'HOLD' | 'SHORT' | 'STRONG_SHORT'

export interface Signal {
  type: SignalType
  zscore: number
  label: string
  description: string
  tailwindColor: string
  hexColor: string
}

export interface ForwardReturnRow {
  horizon: number
  horizon_label: string
  avg_return: number | null
  median_return: number | null
  win_rate: number | null
  observations: number
  avg_days: number | null
}

export interface ForwardReturnObservation {
  entry_date: string
  entry_zscore: number | null
  entry_spread: number
  exit_date: string
  exit_zscore: number | null
  exit_spread: number
  return_pp: number
  calendar_days: number
  exit_reason: 'target' | 'time_stop' | 'hard_stop' | 'open'
}

// ── Trading rules (stored in DB, editable in Rules tab) ──────────────────────

export interface TradingRules {
  strong_long_threshold: number   // e.g. -1.5
  long_threshold: number          // e.g. -1.0
  short_threshold: number         // e.g.  1.0
  strong_short_threshold: number  // e.g.  1.5
  entry_band: number              // ±z-score band for analog matching, e.g. 0.25
  exit_zone_lo: number            // long exit zone lower bound, e.g. -0.5
  exit_zone_hi: number            // long exit zone upper bound, e.g.  0.0 (short mirrored)
  add_to_trade_gap: number        // SDs further to trigger 2nd observation, e.g. 0.5
  time_stop_5d: number
  time_stop_20d: number
  time_stop_40d: number
  time_stop_60d: number
  time_stop_90d: number
  hard_stop_z: number           // absolute Z threshold — exit if |Z| ≥ this on wrong side
  z_override: number | null     // owner-set Z-score override for analog observations (null = use computed)
}

export const DEFAULT_RULES: TradingRules = {
  strong_long_threshold: -1.5,
  long_threshold: -1.0,
  short_threshold: 1.0,
  strong_short_threshold: 1.5,
  entry_band: 0.25,
  exit_zone_lo: -0.5,
  exit_zone_hi: 0.0,
  add_to_trade_gap: 0.5,
  time_stop_5d: 5,
  time_stop_20d: 20,
  time_stop_40d: 40,
  time_stop_60d: 60,
  time_stop_90d: 90,
  hard_stop_z: 2.8,
  z_override: null,
}

export interface ShareHistoryRow {
  id: number
  company: string         // 'BAJFINANCE' | 'BAJAJFINSV'
  effective_date: string  // YYYY-MM-DD
  shares: number
  source: string | null
}

// ── Active Trade types ────────────────────────────────────────────────────────

export interface TradeTranche {
  id: number
  trade_group: string
  tranche_num: number
  direction: 'long' | 'short'
  window_key: string
  entry_date: string
  entry_spread: number
  entry_z: number | null
  size_label: string
  status: 'open' | 'closed'
  exit_date: string | null
  exit_spread: number | null
  exit_z: number | null
  exit_reason: 'target' | 'time_stop' | 'hard_stop' | 'manual' | null
  notes: string | null
  created_at: string
}

export type TradeSignalAction =
  | 'NEUTRAL' | 'WATCH' | 'ENTER' | 'ADD'
  | 'HOLD' | 'EXIT_TARGET' | 'EXIT_TIME' | 'EXIT_HARD_STOP'

export interface TradeSignal {
  action: TradeSignalAction
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical'
  label: string
  description: string
  tailwindColor: string
  bgClass: string
  borderClass: string
}
