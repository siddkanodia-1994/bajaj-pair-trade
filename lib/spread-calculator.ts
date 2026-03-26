import type {
  EodPriceRow,
  StakeHistoryRow,
  SpreadPoint,
  WindowKey,
  WindowStats,
  ForwardReturnRow,
} from '@/types'
import { WINDOW_TRADING_DAYS, WINDOW_KEYS } from '@/types'

// ---------- Stake lookup ----------

/**
 * Returns the quarter-end date (YYYY-MM-DD) for a given date.
 * Uses Indian FY quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar.
 */
export function getQuarterEndDate(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const month = d.getMonth() // 0-indexed
  const year = d.getFullYear()
  if (month <= 2)  return `${year}-03-31`  // Jan–Mar
  if (month <= 5)  return `${year}-06-30`  // Apr–Jun
  if (month <= 8)  return `${year}-09-30`  // Jul–Sep
  return `${year}-12-31`                   // Oct–Dec
}

/**
 * Returns the applicable stake % for a given date.
 * Logic: apply the stake disclosed at the END of the quarter the date falls in.
 * E.g. Jan 15 2025 → quarter ends Mar 31 2025 → use the Mar 2025 stake.
 * Fallback: most recent stake before the quarter end (for current/incomplete quarters).
 */
export function getApplicableStake(
  date: string,
  stakes: StakeHistoryRow[]
): number {
  const quarterEnd = getQuarterEndDate(date)

  // 1. Exact match for this quarter's end date
  const exact = stakes.find((s) => s.quarter_end_date === quarterEnd)
  if (exact) return exact.stake_pct

  // 2. Fallback: most recent disclosure before this quarter end
  const sorted = [...stakes].sort(
    (a, b) =>
      new Date(b.quarter_end_date).getTime() - new Date(a.quarter_end_date).getTime()
  )
  for (const s of sorted) {
    if (s.quarter_end_date < quarterEnd) return s.stake_pct
  }

  // 3. Ultimate fallback: oldest known stake
  return sorted[sorted.length - 1]?.stake_pct ?? 52
}

// ---------- Rolling statistics ----------

export function rollingWindowStats(values: number[], windowSize: number): WindowStats[] {
  return values.map((v, i) => {
    if (i < windowSize - 1) {
      return { mean: null, std: null, zscore: null, percentile_rank: null,
               upper_1sd: null, lower_1sd: null, upper_2sd: null, lower_2sd: null }
    }
    const window = values.slice(i - windowSize + 1, i + 1)
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / (window.length - 1)
    const std = Math.sqrt(variance)
    const zscore = std > 0 ? (v - mean) / std : 0

    // Percentile rank: % of window values below current value
    const below = window.filter(x => x < v).length
    const percentile_rank = (below / window.length) * 100

    return {
      mean,
      std,
      zscore,
      percentile_rank,
      upper_1sd: mean + std,
      lower_1sd: mean - std,
      upper_2sd: mean + 2 * std,
      lower_2sd: mean - 2 * std,
    }
  })
}

// ---------- Main computation ----------

export function computeSpreadSeries(
  prices: EodPriceRow[],
  stakes: StakeHistoryRow[]
): SpreadPoint[] {
  if (prices.length === 0) return []

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))

  // 1. Compute raw spread % for each date
  const rawPoints = sorted.map((row) => {
    const stake = getApplicableStake(row.date, stakes) / 100
    const underlying_stake_value = stake * row.fin_mcap
    const residual_value = row.finsv_mcap - underlying_stake_value
    const spread_pct =
      row.finsv_mcap > 0 ? (residual_value / row.finsv_mcap) * 100 : 0
    return {
      date: row.date,
      stake_pct: stake * 100,
      underlying_stake_value,
      residual_value,
      spread_pct,
      finsv_mcap: row.finsv_mcap,
      fin_mcap: row.fin_mcap,
    }
  })

  const spreadValues = rawPoints.map((p) => p.spread_pct)

  // 2. Compute rolling stats for all 7 windows
  const windowStatsMap: Partial<Record<WindowKey, WindowStats[]>> = {}
  for (const key of WINDOW_KEYS) {
    windowStatsMap[key] = rollingWindowStats(spreadValues, WINDOW_TRADING_DAYS[key])
  }

  // 3. Assemble final SpreadPoint objects
  return rawPoints.map((p, i) => {
    const windows = {} as Record<WindowKey, WindowStats>
    for (const key of WINDOW_KEYS) {
      windows[key] = windowStatsMap[key]![i]
    }
    return { ...p, windows }
  })
}

// ---------- Forward returns ----------

/**
 * Given the full spread series and a current z-score (for the selected window),
 * compute the expected forward spread change at each horizon.
 *
 * "Similar" historical setups = z-score within ±0.5 of current zscore.
 * Forward return = spread_pct[t+h] - spread_pct[t]  (positive = spread widened)
 */
export function computeForwardReturns(
  series: SpreadPoint[],
  currentZscore: number,
  selectedWindow: WindowKey,
  horizons: number[] = [5, 20, 60, 90]
): ForwardReturnRow[] {
  const ZSCORE_BAND = 0.75
  const labels: Record<number, string> = {
    5: '5 Days',
    20: '20 Days',
    60: '60 Days',
    90: '90 Days',
  }

  return horizons.map((h) => {
    const returns: number[] = []

    for (let i = 0; i < series.length - h; i++) {
      const z = series[i].windows[selectedWindow]?.zscore
      if (z === null) continue
      if (Math.abs(z - currentZscore) > ZSCORE_BAND) continue
      returns.push(series[i + h].spread_pct - series[i].spread_pct)
    }

    if (returns.length === 0) {
      return {
        horizon: h,
        horizon_label: labels[h] ?? `${h}d`,
        avg_return: null,
        median_return: null,
        win_rate: null,
        observations: 0,
      }
    }

    const sorted = [...returns].sort((a, b) => a - b)
    const avg_return = returns.reduce((a, b) => a + b, 0) / returns.length
    const median_return = sorted[Math.floor(sorted.length / 2)]
    // "Win" = spread moves in the expected direction
    const expectedDirection = currentZscore < 0 ? 1 : -1
    const wins = returns.filter((r) => r * expectedDirection > 0).length
    const win_rate = (wins / returns.length) * 100

    return {
      horizon: h,
      horizon_label: labels[h] ?? `${h}d`,
      avg_return,
      median_return,
      win_rate,
      observations: returns.length,
    }
  })
}
