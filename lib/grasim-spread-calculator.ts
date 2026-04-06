import type { SpreadPoint, WindowKey, WindowStats } from '@/types'
import { WINDOW_MONTHS, WINDOW_KEYS } from '@/types'
import { calendarRollingStats, getQuarterEndDate } from '@/lib/spread-calculator'
import type { GrasimEodRow, GrasimStakeRow, GrasimSubsidiary, GrasimRawPoint } from '@/types/grasim'

// Mapping from GrasimSubsidiary → field name in GrasimRawPoint
const MCAP_FIELD: Record<GrasimSubsidiary, keyof GrasimRawPoint> = {
  ULTRACEMCO: 'ultracemco_mcap',
  ABCAPITAL:  'abcapital_mcap',
  IDEA:       'idea_mcap',
  HINDALCO:   'hindalco_mcap',
  ABFRL:      'abfrl_mcap',
  ABLBL:      'ablbl_mcap',
}

/**
 * Returns stake % for each selected company on a given date.
 * Uses same quarter-end logic as getApplicableStake() in spread-calculator.ts.
 */
export function getApplicableGrasimStakes(
  date: string,
  stakes: GrasimStakeRow[],
  companies: GrasimSubsidiary[]
): Record<GrasimSubsidiary, number> {
  const result = {} as Record<GrasimSubsidiary, number>
  const quarterEnd = getQuarterEndDate(date)

  for (const company of companies) {
    const companyStakes = stakes.filter((s) => s.company === company)

    const exact = companyStakes.find((s) => s.quarter_end_date === quarterEnd)
    if (exact) { result[company] = exact.stake_pct; continue }

    const sorted = [...companyStakes].sort(
      (a, b) => new Date(b.quarter_end_date).getTime() - new Date(a.quarter_end_date).getTime()
    )
    const prior = sorted.find((s) => s.quarter_end_date < quarterEnd)
    if (prior) { result[company] = prior.stake_pct; continue }

    result[company] = sorted[sorted.length - 1]?.stake_pct ?? 0
  }
  return result
}

/**
 * Builds GrasimRawPoint[] from EOD rows — one row per date with all 7 MCap columns.
 * ablbl_mcap null → 0 (before demerger Jun 2025).
 */
export function computeGrasimRawPoints(eodRows: GrasimEodRow[]): GrasimRawPoint[] {
  return [...eodRows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date:            row.date,
      grasim_mcap:     row.grasim_mcap,
      grasim_price:    row.grasim_price,
      ultracemco_mcap: row.ultracemco_mcap,
      abcapital_mcap:  row.abcapital_mcap,
      idea_mcap:       row.idea_mcap,
      hindalco_mcap:   row.hindalco_mcap,
      abfrl_mcap:      row.abfrl_mcap,
      ablbl_mcap:      row.ablbl_mcap ?? 0,
    }))
}

function deriveBasePoints(
  rawPoints: GrasimRawPoint[],
  stakes: GrasimStakeRow[],
  selectedCompanies: GrasimSubsidiary[]
): Array<Omit<SpreadPoint, 'windows'>> {
  return rawPoints.map((p) => {
    const stakeMap = getApplicableGrasimStakes(p.date, stakes, selectedCompanies)

    let basket_mcap = 0
    for (const company of selectedCompanies) {
      const stakePct = stakeMap[company] ?? 0
      const mcap = p[MCAP_FIELD[company]] as number
      basket_mcap += (stakePct / 100) * (mcap ?? 0)
    }

    const residual_value = p.grasim_mcap - basket_mcap
    const spread_pct = p.grasim_mcap > 0 ? (residual_value / p.grasim_mcap) * 100 : 0

    return {
      date:                   p.date,
      stake_pct:              0,            // n/a for multi-subsidiary; use basket_mcap instead
      underlying_stake_value: basket_mcap,  // basket weighted MCap (₹ crore)
      residual_value,
      spread_pct,
      finsv_mcap:   p.grasim_mcap,  // parent = "finsv" slot — reuses existing chart components
      fin_mcap:     basket_mcap,    // basket  = "fin"   slot
      finsv_price:  p.grasim_price,
      fin_price:    0,              // no single subsidiary price in multi mode
    }
  })
}

/**
 * Full server-side computation: EOD raw points + stakes + selection → SpreadPoint[] with all windows.
 */
export function computeGrasimSpreadSeries(
  rawPoints: GrasimRawPoint[],
  stakes: GrasimStakeRow[],
  selectedCompanies: GrasimSubsidiary[]
): SpreadPoint[] {
  if (rawPoints.length === 0 || selectedCompanies.length === 0) return []

  const basePoints = deriveBasePoints(rawPoints, stakes, selectedCompanies)
  const dates        = basePoints.map((p) => p.date)
  const spreadValues = basePoints.map((p) => p.spread_pct)

  const windowStatsMap: Partial<Record<WindowKey, WindowStats[]>> = {}
  for (const key of WINDOW_KEYS) {
    const monthsOrAll: number | 'ALL' = key === 'ALL' ? 'ALL' : WINDOW_MONTHS[key]!
    windowStatsMap[key] = calendarRollingStats(dates, spreadValues, monthsOrAll)
  }

  return basePoints.map((p, i) => {
    const windows = {} as Record<WindowKey, WindowStats>
    for (const key of WINDOW_KEYS) windows[key] = windowStatsMap[key]![i]
    return { ...p, windows }
  })
}

/**
 * Client-side recomputation when dropdown selection changes.
 * Pure function, safe to call in useMemo. Identical to computeGrasimSpreadSeries.
 */
export const recomputeGrasimSpread = computeGrasimSpreadSeries
