import {
  fetchAllGrasimEodPrices,
  fetchGrasimStakes,
  fetchGrasimShareHistory,
  fetchGrasimRules,
  fetchLatestGrasimShares,
} from '@/lib/supabase-grasim'
import { getDhanGrasimPrices } from '@/lib/dhan-grasim'
import { computeGrasimRawPoints, computeGrasimSpreadSeries, getApplicableGrasimStakes } from '@/lib/grasim-spread-calculator'
import { GRASIM_DEFAULT_SELECTION } from '@/types/grasim'
import type { GrasimLiveData, GrasimLiveQuote, GrasimSubsidiary } from '@/types/grasim'
import { supabase } from '@/lib/supabase'
import GrasimDashboard from '@/components/GrasimDashboard'

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

export default async function GrasimPage() {
  const [eodRows, stakes, , rules, shares, dhanPrices, { data: recentEod }] = await Promise.all([
    fetchAllGrasimEodPrices(),
    fetchGrasimStakes(),
    fetchGrasimShareHistory(),
    fetchGrasimRules(),
    fetchLatestGrasimShares(),
    getDhanGrasimPrices(),
    supabase
      .from('grasim_eod_prices')
      .select('*')
      .order('date', { ascending: false })
      .limit(2),
  ])

  const rawPoints   = computeGrasimRawPoints(eodRows)
  const spreadSeries = computeGrasimSpreadSeries(rawPoints, stakes, GRASIM_DEFAULT_SELECTION)

  // Build initial live data (same logic as live-grasim route)
  let initialLiveData: GrasimLiveData | null = null
  try {
    const prevEod  = recentEod?.[0] ?? null
    const prevEod2 = recentEod?.[1] ?? null

    if (!prevEod) throw new Error('no eod data')

    const marketOpen = isMarketOpen() && dhanPrices.GRASIM > 0

    function buildQuote(
      ticker: string,
      dhanKey: keyof typeof dhanPrices,
      eodPrice: number,
      eodPrice2: number | null,
      shareCount: number,
      eodMcap: number
    ): GrasimLiveQuote {
      const livePrice = dhanPrices[dhanKey]
      if (marketOpen && livePrice > 0 && shareCount > 0) {
        return {
          ticker,
          price: livePrice,
          mcap: (livePrice * shareCount) / CRORE,
          change_pct: eodPrice > 0 ? ((livePrice - eodPrice) / eodPrice) * 100 : 0,
          last_updated: new Date().toISOString(),
        }
      }
      return {
        ticker,
        price: eodPrice,
        mcap: eodMcap,
        change_pct: eodPrice2 && eodPrice2 > 0 ? ((eodPrice - eodPrice2) / eodPrice2) * 100 : 0,
        last_updated: prevEod.date,
      }
    }

    const grasim     = buildQuote('GRASIM',     'GRASIM',     prevEod.grasim_price,     prevEod2?.grasim_price ?? null,     shares['GRASIM'] ?? 0,     prevEod.grasim_mcap)
    const ultracemco = buildQuote('ULTRACEMCO', 'ULTRACEMCO', prevEod.ultracemco_price, prevEod2?.ultracemco_price ?? null, shares['ULTRACEMCO'] ?? 0, prevEod.ultracemco_mcap)
    const abcapital  = buildQuote('ABCAPITAL',  'ABCAPITAL',  prevEod.abcapital_price,  prevEod2?.abcapital_price ?? null,  shares['ABCAPITAL'] ?? 0,  prevEod.abcapital_mcap)
    const idea       = buildQuote('IDEA',       'IDEA',       prevEod.idea_price,       prevEod2?.idea_price ?? null,       shares['IDEA'] ?? 0,       prevEod.idea_mcap)
    const hindalco   = buildQuote('HINDALCO',   'HINDALCO',   prevEod.hindalco_price,   prevEod2?.hindalco_price ?? null,   shares['HINDALCO'] ?? 0,   prevEod.hindalco_mcap)
    const abfrl      = buildQuote('ABFRL',      'ABFRL',      prevEod.abfrl_price,      prevEod2?.abfrl_price ?? null,      shares['ABFRL'] ?? 0,      prevEod.abfrl_mcap)
    const ablbl      = buildQuote('ABLBL',      'ABLBL',      prevEod.ablbl_price ?? 0, prevEod2?.ablbl_price ?? null,      shares['ABLBL'] ?? 0,      prevEod.ablbl_mcap ?? 0)

    const quoteMap: Record<GrasimSubsidiary, GrasimLiveQuote> = {
      ULTRACEMCO: ultracemco, ABCAPITAL: abcapital, IDEA: idea,
      HINDALCO: hindalco, ABFRL: abfrl, ABLBL: ablbl,
    }

    const today    = new Date().toISOString().split('T')[0]
    const stakeMap = getApplicableGrasimStakes(today, stakes, GRASIM_DEFAULT_SELECTION)

    let basket_mcap = 0
    for (const company of GRASIM_DEFAULT_SELECTION) {
      basket_mcap += ((stakeMap[company] ?? 0) / 100) * quoteMap[company].mcap
    }

    const residual_value = grasim.mcap - basket_mcap
    const spread_pct     = grasim.mcap > 0 ? (residual_value / grasim.mcap) * 100 : 0

    initialLiveData = {
      grasim, ultracemco, abcapital, idea, hindalco, abfrl, ablbl,
      selectedCompanies: GRASIM_DEFAULT_SELECTION,
      basket_mcap,
      residual_value,
      spread_pct,
      as_of: new Date().toISOString(),
    }
  } catch {
    // fall through — banner fetches on mount
  }

  return (
    <GrasimDashboard
        rawPoints={rawPoints}
        stakes={stakes}
        spreadSeries={spreadSeries}
        initialLiveData={initialLiveData}
        rules={rules}
      />
  )
}
