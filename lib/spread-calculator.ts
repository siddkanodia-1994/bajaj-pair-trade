import type {
  EodPriceRow,
  StakeHistoryRow,
  SpreadPoint,
  WindowKey,
  WindowStats,
  ForwardReturnRow,
  ForwardReturnObservation,
  TradingRules,
} from '@/types'
import { WINDOW_MONTHS, WINDOW_KEYS, DEFAULT_RULES } from '@/types'

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

/**
 * Re-derives spread_pct and all 8 rolling windows for an existing SpreadPoint[]
 * using a new set of stakes. fin_mcap / finsv_mcap come from the existing series —
 * no DB round-trip needed. Pure function, safe to call in useMemo.
 */
export function recomputeSpreadSeries(
  series: SpreadPoint[],
  stakes: StakeHistoryRow[]
): SpreadPoint[] {
  if (series.length === 0) return series

  const rawPoints = series.map((p) => {
    const stake_pct = getApplicableStake(p.date, stakes)
    const underlying_stake_value = (stake_pct / 100) * p.fin_mcap
    const residual_value = p.finsv_mcap - underlying_stake_value
    const spread_pct = p.finsv_mcap > 0 ? (residual_value / p.finsv_mcap) * 100 : 0
    return { date: p.date, stake_pct, underlying_stake_value, residual_value, spread_pct, finsv_mcap: p.finsv_mcap, fin_mcap: p.fin_mcap }
  })

  const dates = rawPoints.map((p) => p.date)
  const spreadValues = rawPoints.map((p) => p.spread_pct)

  const windowStatsMap: Partial<Record<WindowKey, WindowStats[]>> = {}
  for (const key of WINDOW_KEYS) {
    const monthsOrAll: number | 'ALL' = key === 'ALL' ? 'ALL' : WINDOW_MONTHS[key]!
    windowStatsMap[key] = calendarRollingStats(dates, spreadValues, monthsOrAll)
  }

  return rawPoints.map((p, i) => {
    const windows = {} as Record<WindowKey, WindowStats>
    for (const key of WINDOW_KEYS) windows[key] = windowStatsMap[key]![i]
    return { ...p, windows }
  })
}

// ---------- Forward returns (exit-based) ----------

/** Add `days` calendar days to a YYYY-MM-DD date string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/** Calendar days between two YYYY-MM-DD strings. */
function calDaysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

/**
 * Map horizon → time stop (calendar days) from rules.
 * Horizons 5/20/40/60/90 map to time_stop_5d etc.
 */
function getTimeStop(horizon: number, rules: TradingRules): number {
  const map: Record<number, keyof TradingRules> = {
    5: 'time_stop_5d', 20: 'time_stop_20d', 40: 'time_stop_40d',
    60: 'time_stop_60d', 90: 'time_stop_90d',
  }
  const key = map[horizon]
  return key ? (rules[key] as number) : horizon
}

/**
 * Returns true if z is in the exit zone for the given direction.
 * Long exit zone: [exit_zone_lo, exit_zone_hi]
 * Short exit zone: [-exit_zone_hi, -exit_zone_lo]  (mirrored)
 */
function inExitZone(z: number, direction: 'long' | 'short', rules: TradingRules): boolean {
  if (direction === 'long') {
    return z >= rules.exit_zone_lo && z <= rules.exit_zone_hi
  }
  // short: mirrored
  return z >= -rules.exit_zone_hi && z <= -rules.exit_zone_lo
}

/**
 * Walk forward from entryIdx to find the exit point.
 * Exits when z-score enters exit zone (target) OR calendar days ≥ timeStop (time stop).
 * Returns null if we reach end of series without exit (open trade — excluded from stats).
 */
function findExit(
  series: SpreadPoint[],
  getZ: (p: SpreadPoint) => number | null,
  entryIdx: number,
  timeStop: number,
  direction: 'long' | 'short',
  rules: TradingRules
): { exitIdx: number; exit_reason: 'target' | 'time_stop' } | null {
  const entryDate = series[entryIdx].date
  for (let j = entryIdx + 1; j < series.length; j++) {
    const calDays = calDaysBetween(entryDate, series[j].date)
    const z = getZ(series[j])
    if (z != null && inExitZone(z, direction, rules)) {
      return { exitIdx: j, exit_reason: 'target' }
    }
    if (calDays >= timeStop) {
      return { exitIdx: j, exit_reason: 'time_stop' }
    }
  }
  return null // open trade
}

/**
 * Scans the series for analog entries matching currentZscore ± entry_band,
 * applies de-duplication (no new entry if trade open, unless z moved add_to_trade_gap further),
 * exits at z-score entering exit zone OR horizon time stop.
 */
export function getExitBasedObservations(
  series: SpreadPoint[],
  currentZscore: number,
  selectedWindow: WindowKey,
  horizon: number,
  rollingMode: boolean,
  rules: TradingRules,
  fixedMean?: number,
  fixedStd?: number
): ForwardReturnObservation[] {
  const direction: 'long' | 'short' = currentZscore <= 0 ? 'long' : 'short'
  const timeStop = getTimeStop(horizon, rules)
  const results: ForwardReturnObservation[] = []

  const getZ = (point: SpreadPoint): number | null => {
    if (rollingMode) return point.windows[selectedWindow]?.zscore ?? null
    if (fixedMean == null || fixedStd == null || fixedStd === 0) return null
    return (point.spread_pct - fixedMean) / fixedStd
  }

  let lastExitIdx = -1         // index of the last closed trade's exit
  let lastEntryZ: number | null = null  // z-score at last accepted entry

  for (let i = 0; i < series.length - 1; i++) {
    const entryZ = getZ(series[i])
    if (entryZ == null) continue

    if (lastExitIdx >= i) {
      // Trade still open — add-to-trade path: skip entry band, only check gap
      if (lastEntryZ == null) continue
      const movedFurther = direction === 'long'
        ? entryZ <= lastEntryZ - rules.add_to_trade_gap
        : entryZ >= lastEntryZ + rules.add_to_trade_gap
      if (!movedFurther) continue
    } else {
      // Fresh entry — must be within entry band of current z-score
      if (Math.abs(entryZ - currentZscore) > rules.entry_band) continue
    }

    const exitResult = findExit(series, getZ, i, timeStop, direction, rules)
    if (exitResult == null) continue // open trade — skip

    const { exitIdx, exit_reason } = exitResult
    const exitPoint = series[exitIdx]
    const entryPoint = series[i]

    results.push({
      entry_date: entryPoint.date,
      entry_zscore: entryZ,
      entry_spread: entryPoint.spread_pct,
      exit_date: exitPoint.date,
      exit_zscore: getZ(exitPoint),
      exit_spread: exitPoint.spread_pct,
      return_pp: exitPoint.spread_pct - entryPoint.spread_pct,
      calendar_days: calDaysBetween(entryPoint.date, exitPoint.date),
      exit_reason,
    })

    lastExitIdx = exitIdx
    lastEntryZ = entryZ
  }

  return results.sort((a, b) => a.entry_date.localeCompare(b.entry_date))
}

/**
 * Aggregate stats across all horizons using exit-based observations.
 * Returns one ForwardReturnRow per horizon.
 */
export function computeForwardReturns(
  series: SpreadPoint[],
  currentZscore: number,
  selectedWindow: WindowKey,
  rollingMode: boolean,
  rules: TradingRules,
  fixedMean?: number,
  fixedStd?: number,
  horizons: number[] = [5, 20, 40, 60, 90]
): ForwardReturnRow[] {
  const labels: Record<number, string> = {
    5: '5 Days', 20: '20 Days', 40: '40 Days', 60: '60 Days', 90: '90 Days',
  }
  const expectedDirection = currentZscore < 0 ? 1 : currentZscore > 0 ? -1 : 0

  return horizons.map((h) => {
    const obs = getExitBasedObservations(
      series, currentZscore, selectedWindow, h, rollingMode, rules, fixedMean, fixedStd
    )
    if (obs.length === 0) {
      return { horizon: h, horizon_label: labels[h] ?? `${h}d`, avg_return: null, median_return: null, win_rate: null, observations: 0, avg_days: null }
    }
    const returns = obs.map((o) => o.return_pp)
    const sorted = [...returns].sort((a, b) => a - b)
    const avg_return = returns.reduce((a, b) => a + b, 0) / returns.length
    const median_return = sorted[Math.floor(sorted.length / 2)]
    const wins = expectedDirection !== 0 ? returns.filter((r) => r * expectedDirection > 0).length : 0
    const win_rate = expectedDirection !== 0 ? (wins / returns.length) * 100 : null
    const avg_days = obs.reduce((a, o) => a + o.calendar_days, 0) / obs.length

    return { horizon: h, horizon_label: labels[h] ?? `${h}d`, avg_return, median_return, win_rate, observations: obs.length, avg_days }
  })
}

/**
 * @deprecated Use getExitBasedObservations instead.
 * Kept temporarily for any callsites not yet migrated.
 */
export function getForwardReturnObservations(
  series: SpreadPoint[],
  currentZscore: number,
  selectedWindow: WindowKey,
  horizon: number,
  rollingMode: boolean,
  fixedMean?: number,
  fixedStd?: number
): ForwardReturnObservation[] {
  return getExitBasedObservations(
    series, currentZscore, selectedWindow, horizon, rollingMode, DEFAULT_RULES, fixedMean, fixedStd
  )
}
