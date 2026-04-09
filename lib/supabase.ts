import { createClient } from '@supabase/supabase-js'
import type { EodPriceRow, ShareHistoryRow, TradingRules } from '@/types'
import { DEFAULT_RULES } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser / server-component read client (anon key, RLS disabled on these tables)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side write client — only use inside API route handlers
export function createServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------- Trading rules ----------

export async function fetchRules(): Promise<TradingRules> {
  const { data } = await supabase
    .from('trading_rules')
    .select('rule_key, rule_value')
  if (!data || data.length === 0) return { ...DEFAULT_RULES }
  const rules: TradingRules = { ...DEFAULT_RULES }
  const OP_KEYS = new Set(['exit_lo_op', 'exit_hi_op'])
  for (const row of data) {
    if (row.rule_key === 'z_override') {
      // 999 is sentinel for "no override"
      rules.z_override = Number(row.rule_value) === 999 ? null : Number(row.rule_value)
    } else if (OP_KEYS.has(row.rule_key)) {
      // String-valued operator fields
      ;(rules as unknown as Record<string, string>)[row.rule_key] = row.rule_value as string
    } else if (row.rule_key in rules) {
      (rules as unknown as Record<string, number>)[row.rule_key] = Number(row.rule_value)
    }
  }
  return rules
}

// ---------- Share history ----------

export async function fetchLatestShares(): Promise<{ fin: number; finsv: number }> {
  const { data } = await supabase
    .from('share_history')
    .select('company, shares, effective_date')
    .order('effective_date', { ascending: false })
  const fin   = data?.find((r) => r.company === 'BAJFINANCE')?.shares  ?? 0
  const finsv = data?.find((r) => r.company === 'BAJAJFINSV')?.shares ?? 0
  return { fin, finsv }
}

export async function fetchShareHistory(): Promise<ShareHistoryRow[]> {
  const { data } = await supabase
    .from('share_history')
    .select('*')
    .order('effective_date', { ascending: false })
  return data ?? []
}

// ---------- EOD prices ----------

// Paginated fetch — bypasses PostgREST's default 1000-row cap
export async function fetchAllEodPrices(): Promise<EodPriceRow[]> {
  const PAGE = 1000
  const all: EodPriceRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('eod_prices')
      .select('*')
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break // last page
    from += PAGE
  }
  return all
}
