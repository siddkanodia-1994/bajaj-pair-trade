import type {
  EodPriceRow,
  StakeHistoryRow,
  SpreadPoint,
  WindowKey,
  WindowStats,
  ForwardReturnRow,
  ForwardReturnObservation,
} from '@/types'
import { WINDOW_MONTHS, WINDOW_KEYS } from '@/types'

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

const NULL_STATS: WindowStats = {
  mean: null, std: null, zscore: null, percentile_rank: null,
  upper_1sd: null, lower_1sd: null, upper_2sd: null, lower_2sd: null,
}

function computeWindowStats(window: number[], v: number): WindowStats {
  if (window.length < 2) return NULL_STATS
  const mean = window.reduce((a, b) => a + b, 0) / window.length
  const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / (window.length - 1)
  const std = Math.sqrt(variance)
  const zscore = std > 0 ? (v - mean) / std : 0
  const below = window.filter((x) => x < v).length
  const percentile_rank = (below / window.length) * 100
  return {
    mean, std, zscore, percentile_rank,
    upper_1sd: mean + std,
    lower_1sd: mean - std,
    upper_2sd: mean + 2 * std,
    lower_2sd: mean - 2 * std,
  }
}

/** Subtract N calendar months from a YYYY-MM-DD date string. */
export function subtractMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}

/** First index in sorted `dates` where dates[j] >= target (binary search). */
function firstIndexOnOrAfter(dates: string[], target: string): number {
  let lo = 0, hi = dates.length - 1, result = dates.length
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (dates[mid] >= target) { result = mid; hi = mid - 1 }
    else lo = mid + 1
  }
  return result
}

/**
 * Calendar-anchored rolling statistics.
 * For each point i, the window spans from the first trading day on or after
 * (dates[i] − windowMonths) through dates[i].
 * Pass 'ALL' to use all available data from the very first point.
 */
export function calendarRollingStats(
  dates: string[],
  values: number[],
  windowMonths: number | 'ALL'
): WindowStats[] {
  return values.map((v, i) => {
    let j: number
    if (windowMonths === 'ALL') {
      j = 0
    } else {
      const startDate = subtractMonths(dates[i], windowMonths)
      if (dates[0] > startDate) return NULL_STATS  // not enough history yet
      j = firstIndexOnOrAfter(dates, startDate)
    }
    return computeWindowStats(values.slice(j, i + 1), v)
  })
}

/**
 * Fixed-window stats: compute a single mean/SD for the entire value set.
 * Returns z-score and percentile for `currentValue` against that fixed distribution.
 */
export function computeFixedWindowStats(
  values: number[],
  currentValue?: number
): WindowStats {
  if (values.length < 2) return NULL_STATS
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  const std = Math.sqrt(variance)
  const v = currentValue ?? mean
  const zscore = std > 0 ? (v - mean) / std : 0
  const below = values.filter((x) => x < v).length
  const percentile_rank = (below / values.length) * 100
  return {
    mean, std, zscore, percentile_rank,
    upper_1sd: mean + std,
    lower_1sd: mean - std,
    upper_2sd: mean + 2 * std,
    lower_2sd: mean - 2 * std,
  }
}

/** @deprecated Use calendarRollingStats instead. Kept for reference. */
export function rollingWindowStats(values: number[], windowSize: number): WindowStats[] {
  return values.map((v, i) => {
    if (i < windowSize - 1) return NULL_STATS
    return computeWindowStats(values.slice(i - windowSize + 1, i + 1), v)
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

  const dates = sorted.map((r) => r.date)
  const spreadValues = rawPoints.map((p) => p.spread_pct)

  // 2. Compute calendar-anchored rolling stats for all windows (including ALL)
  const windowStatsMap: Partial<Record<WindowKey, WindowStats[]>> = {}
  for (const key of WINDOW_KEYS) {
    const monthsOrAll: number | 'ALL' = key === 'ALL' ? 'ALL' : WINDOW_MONTHS[key]!
    windowStatsMap[key] = calendarRollingStats(dates, spreadValues, monthsOrAll)
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

/** Add `days` calendar days to a YYYY-MM-DD date string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Given the full spread series and the current spread value,
 * find historical dates where spread was within ±0.25pp of current spread,
 * and compute the forward spread change at each horizon (calendar days).
 *
 * Forward return = exit_spread - entry_spread  (positive = spread widened)
 */
export function computeForwardReturns(
  series: SpreadPoint[],
  currentSpread: number,
  selectedWindow: WindowKey,
  horizons: number[] = [5, 20, 40, 60, 90]
): ForwardReturnRow[] {
  const SPREAD_BAND = 0.25
  const labels: Record<number, string> = {
    5: '5 Days', 20: '20 Days', 40: '40 Days', 60: '60 Days', 90: '90 Days',
  }

  const lastMean = series[series.length - 1]?.windows[selectedWindow]?.mean ?? null
  const expectedDirection = lastMean != null ? (currentSpread < lastMean ? 1 : -1) : 0

  return horizons.map((h) => {
    const returns: number[] = []

    for (let i = 0; i < series.length - 1; i++) {
      if (Math.abs(series[i].spread_pct - currentSpread) > SPREAD_BAND) continue
      const targetDate = addDays(series[i].date, h)
      const exitIdx = series.findIndex((p, j) => j > i && p.date >= targetDate)
      if (exitIdx === -1) continue
      returns.push(series[exitIdx].spread_pct - series[i].spread_pct)
    }

    if (returns.length === 0) {
      return { horizon: h, horizon_label: labels[h] ?? `${h}d`, avg_return: null, median_return: null, win_rate: null, observations: 0 }
    }

    const sorted = [...returns].sort((a, b) => a - b)
    const avg_return = returns.reduce((a, b) => a + b, 0) / returns.length
    const median_return = sorted[Math.floor(sorted.length / 2)]
    const wins = expectedDirection !== 0 ? returns.filter((r) => r * expectedDirection > 0).length : 0
    const win_rate = expectedDirection !== 0 ? (wins / returns.length) * 100 : null

    return { horizon: h, horizon_label: labels[h] ?? `${h}d`, avg_return, median_return, win_rate, observations: returns.length }
  })
}

/**
 * Returns all individual analog observations for a given horizon (calendar days).
 * Matches historical points where z-score is within ±0.25 of currentZscore.
 * Each row: entry date/z-score/spread, exit date/z-score/spread, return pp, calendar days held.
 */
export function getForwardReturnObservations(
  series: SpreadPoint[],
  currentZscore: number,
  selectedWindow: WindowKey,
  horizon: number
): ForwardReturnObservation[] {
  const ZSCORE_BAND = 0.25
  const results: ForwardReturnObservation[] = []

  for (let i = 0; i < series.length - 1; i++) {
    const entryZ = series[i].windows[selectedWindow]?.zscore
    if (entryZ == null) continue
    if (Math.abs(entryZ - currentZscore) > ZSCORE_BAND) continue
    const targetDate = addDays(series[i].date, horizon)
    const exitIdx = series.findIndex((p, j) => j > i && p.date >= targetDate)
    if (exitIdx === -1) continue
    const calendarDays = Math.round(
      (new Date(series[exitIdx].date).getTime() - new Date(series[i].date).getTime()) / 86_400_000
    )
    results.push({
      entry_date: series[i].date,
      entry_zscore: entryZ,
      entry_spread: series[i].spread_pct,
      exit_date: series[exitIdx].date,
      exit_zscore: series[exitIdx].windows[selectedWindow]?.zscore ?? null,
      exit_spread: series[exitIdx].spread_pct,
      return_pp: series[exitIdx].spread_pct - series[i].spread_pct,
      calendar_days: calendarDays,
    })
  }

  return results.sort((a, b) => a.entry_date.localeCompare(b.entry_date))
}
