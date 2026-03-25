import { supabase, fetchAllEodPrices } from '@/lib/supabase'
import { computeSpreadSeries, getApplicableStake } from '@/lib/spread-calculator'
import { getLiveQuotes } from '@/lib/yahoo-finance'
import SpreadDashboard from '@/components/SpreadDashboard'
import type { LiveSpreadData } from '@/types'

export const dynamic = 'force-dynamic'

export default async function Page() {
  // Fetch prices, stakes, and live quote in parallel
  const [prices, { data: stakes }, liveResult] = await Promise.all([
    fetchAllEodPrices(),
    supabase.from('stake_history').select('*').order('quarter_end_date', { ascending: true }),
    getLiveQuotes().then(({ finsv, fin }) => ({
      finsv, fin, today: new Date().toISOString().split('T')[0],
    })).catch(() => null),
  ])

  const spreadSeries = computeSpreadSeries(prices, stakes ?? [])

  let initialLiveData: LiveSpreadData | null = null
  if (liveResult) {
    const stake_pct = getApplicableStake(liveResult.today, stakes ?? [])
    const stake_fraction = stake_pct / 100
    const underlying_stake_value = stake_fraction * liveResult.fin.mcap
    const residual_value = liveResult.finsv.mcap - underlying_stake_value
    const spread_pct =
      liveResult.finsv.mcap > 0 ? (residual_value / liveResult.finsv.mcap) * 100 : 0

    initialLiveData = {
      finsv: liveResult.finsv,
      fin: liveResult.fin,
      stake_pct,
      underlying_stake_value,
      residual_value,
      spread_pct,
      as_of: new Date().toISOString(),
    }
  }

  return (
    <SpreadDashboard
      spreadSeries={spreadSeries}
      stakes={stakes ?? []}
      initialLiveData={initialLiveData}
    />
  )
}
