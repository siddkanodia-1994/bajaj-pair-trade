import { supabase, fetchAllEodPrices, fetchRules } from '@/lib/supabase'
import { computeSpreadSeries } from '@/lib/spread-calculator'
import SpreadDashboard from '@/components/SpreadDashboard'
import { getDhanLivePrices } from '@/lib/dhan'
import { getApplicableStake } from '@/lib/spread-calculator'
import { fetchLatestShares } from '@/lib/supabase'
import type { LiveSpreadData, LiveQuote } from '@/types'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000

function isMarketOpen(): boolean {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const day = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const totalMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 30
}

export default async function Page() {
  const [prices, { data: stakes }, { data: eodRows }, shares, dhanPrices, rules] = await Promise.all([
    fetchAllEodPrices(),
    supabase.from('stake_history').select('*').order('quarter_end_date', { ascending: true }),
    supabase.from('eod_prices').select('*').order('date', { ascending: false }).limit(2),
    fetchLatestShares(),
    getDhanLivePrices(),
    fetchRules(),
  ])

  const spreadSeries = computeSpreadSeries(prices, stakes ?? [])

  let initialLiveData: LiveSpreadData | null = null
  try {
    const prevEod = eodRows?.[0] ?? null
    let fin: LiveQuote
    let finsv: LiveQuote

    if (isMarketOpen() && dhanPrices.fin > 0 && dhanPrices.finsv > 0 && shares.fin > 0 && shares.finsv > 0) {
      const finChangePct  = prevEod && prevEod.fin_price > 0   ? ((dhanPrices.fin   - prevEod.fin_price)   / prevEod.fin_price)   * 100 : 0
      const finsvChangePct = prevEod && prevEod.finsv_price > 0 ? ((dhanPrices.finsv - prevEod.finsv_price) / prevEod.finsv_price) * 100 : 0
      fin   = { ticker: 'BAJFINANCE',  price: dhanPrices.fin,   mcap: (dhanPrices.fin   * shares.fin)   / CRORE, change_pct: finChangePct,   last_updated: new Date().toISOString() }
      finsv = { ticker: 'BAJAJFINSV',  price: dhanPrices.finsv, mcap: (dhanPrices.finsv * shares.finsv) / CRORE, change_pct: finsvChangePct, last_updated: new Date().toISOString() }
    } else if (prevEod) {
      const eod2 = eodRows?.[1] ?? null
      const finChangePct  = eod2 && eod2.fin_price > 0   ? ((prevEod.fin_price   - eod2.fin_price)   / eod2.fin_price)   * 100 : 0
      const finsvChangePct = eod2 && eod2.finsv_price > 0 ? ((prevEod.finsv_price - eod2.finsv_price) / eod2.finsv_price) * 100 : 0
      fin   = { ticker: 'BAJFINANCE',  price: prevEod.fin_price,   mcap: prevEod.fin_mcap,   change_pct: finChangePct,   last_updated: prevEod.date }
      finsv = { ticker: 'BAJAJFINSV',  price: prevEod.finsv_price, mcap: prevEod.finsv_mcap, change_pct: finsvChangePct, last_updated: prevEod.date }
    } else {
      throw new Error('no data')
    }

    const today = new Date().toISOString().split('T')[0]
    const stake_pct = getApplicableStake(today, stakes ?? [])
    const stake_fraction = stake_pct / 100
    const underlying_stake_value = stake_fraction * fin.mcap
    const residual_value = finsv.mcap - underlying_stake_value
    const spread_pct = finsv.mcap > 0 ? (residual_value / finsv.mcap) * 100 : 0

    initialLiveData = { finsv, fin, stake_pct, underlying_stake_value, residual_value, spread_pct, as_of: new Date().toISOString() }
  } catch {
    // fall through — banner will fetch on mount
  }

  return (
    <SpreadDashboard
      spreadSeries={spreadSeries}
      stakes={stakes ?? []}
      initialLiveData={initialLiveData}
      rules={rules}
    />
  )
}
