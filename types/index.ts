export type WindowKey = '3M' | '6M' | '1Y' | '2Y' | '3Y' | '4Y' | '5Y'

export const WINDOW_TRADING_DAYS: Record<WindowKey, number> = {
  '3M': 60,
  '6M': 126,
  '1Y': 252,
  '2Y': 504,
  '3Y': 756,
  '4Y': 1008,
  '5Y': 1260,
}

export const WINDOW_KEYS: WindowKey[] = ['3M', '6M', '1Y', '2Y', '3Y', '4Y', '5Y']

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
}
