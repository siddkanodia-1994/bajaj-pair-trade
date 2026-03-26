import { supabase, fetchAllEodPrices, fetchLatestShares } from '@/lib/supabase'
import { computeSpreadSeries, getApplicableStake } from '@/lib/spread-calculator'
import { getDhanLivePrices } from '@/lib/dhan'
import { getLiveQuotes } from '@/lib/yahoo-finance'
import SpreadDashboard from '@/components/SpreadDashboard'
import type { LiveSpreadData, LiveQuote } from '@/types'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000

export default async function Page() {
  // Fetch prices, stakes, shares, and live quotes in parallel
  const [prices, { data: stakes }, shares, dhanPrices] = await Promise.all([
    fetchAllEodPrices(),
    supabase.from('stake_history').select('*').order('quarter_end_date', { ascending: true }),
    fetchLatestShares(),
    getDhanLivePrices(),
  ])

  const spreadSeries = computeSpreadSeries(prices, stakes ?? [])

  let initialLiveData: LiveSpreadData | null = null
  try {
    const today = new Date().toISOString().split('T')[0]
    let fin: LiveQuote
    let finsv: LiveQuote

    if (dhanPrices.fin > 0 && dhanPrices.finsv > 0 && shares.fin > 0 && shares.finsv > 0) {
      fin = {
        ticker: 'BAJFINANCE',
        price: dhanPrices.fin,
        mcap: (dhanPrices.fin * shares.fin) / CRORE,
        change_pct: 0,
        last_updated: new Date().toISOString(),
      }
      finsv = {
        ticker: 'BAJAJFINSV',
        price: dhanPrices.finsv,
        mcap: (dhanPrices.finsv * shares.finsv) / CRORE,
        change_pct: 0,
        last_updated: new Date().toISOString(),
      }
    } else {
      const yahoo = await getLiveQuotes()
      fin   = yahoo.fin
      finsv = yahoo.finsv
    }

    const stake_pct = getApplicableStake(today, stakes ?? [])
    const stake_fraction = stake_pct / 100
    const underlying_stake_value = stake_fraction * fin.mcap
    const residual_value = finsv.mcap - underlying_stake_value
    const spread_pct =
      finsv.mcap > 0 ? (residual_value / finsv.mcap) * 100 : 0

    initialLiveData = {
      finsv,
      fin,
      stake_pct,
      underlying_stake_value,
      residual_value,
      spread_pct,
      as_of: new Date().toISOString(),
    }
  } catch {
    // Live data unavailable — dashboard still loads with historical data
  }

  return (
    <SpreadDashboard
      spreadSeries={spreadSeries}
      stakes={stakes ?? []}
      initialLiveData={initialLiveData}
    />
  )
}
