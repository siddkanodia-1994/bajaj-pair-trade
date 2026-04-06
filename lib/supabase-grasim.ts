import { supabase, createServerClient } from './supabase'
import type { TradingRules } from '@/types'
import { DEFAULT_RULES } from '@/types'
import type { GrasimEodRow, GrasimStakeRow, GrasimShareRow } from '@/types/grasim'

// ---------- EOD prices ----------

export async function fetchAllGrasimEodPrices(): Promise<GrasimEodRow[]> {
  const PAGE = 1000
  const all: GrasimEodRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('grasim_eod_prices')
      .select('*')
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as GrasimEodRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

// ---------- Stake history ----------

export async function fetchGrasimStakes(): Promise<GrasimStakeRow[]> {
  const { data, error } = await supabase
    .from('grasim_stake_history')
    .select('*')
    .order('quarter_end_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as GrasimStakeRow[]
}

// ---------- Share history ----------

export async function fetchGrasimShareHistory(): Promise<GrasimShareRow[]> {
  const { data, error } = await supabase
    .from('grasim_share_history')
    .select('*')
    .order('effective_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as GrasimShareRow[]
}

/**
 * Returns the latest share count per company (for live MCap computation).
 */
export async function fetchLatestGrasimShares(): Promise<Record<string, number>> {
  const rows = await fetchGrasimShareHistory()
  const seen = new Set<string>()
  const result: Record<string, number> = {}
  for (const row of rows) {
    if (!seen.has(row.company)) {
      result[row.company] = row.shares
      seen.add(row.company)
    }
  }
  return result
}

// ---------- Trading rules ----------

export async function fetchGrasimRules(): Promise<TradingRules> {
  const { data } = await supabase
    .from('grasim_trading_rules')
    .select('rule_key, rule_value')
  if (!data || data.length === 0) return { ...DEFAULT_RULES }
  const rules: TradingRules = { ...DEFAULT_RULES }
  for (const row of data) {
    if (row.rule_key === 'z_override') {
      rules.z_override = Number(row.rule_value) === 999 ? null : Number(row.rule_value)
    } else if (row.rule_key in rules) {
      (rules as unknown as Record<string, number>)[row.rule_key] = Number(row.rule_value)
    }
  }
  return rules
}

// ---------- Server-side write client (for cron routes) ----------

export { createServerClient }
