import { NextRequest, NextResponse } from 'next/server'
import { getDhanGrasimPrices } from '@/lib/dhan-grasim'
import { fetchGrasimStakes, fetchLatestGrasimShares } from '@/lib/supabase-grasim'
import { supabase } from '@/lib/supabase'
import { getApplicableGrasimStakes } from '@/lib/grasim-spread-calculator'
import type { GrasimLiveData, GrasimLiveQuote, GrasimSubsidiary } from '@/types/grasim'
import { GRASIM_SUBSIDIARIES, GRASIM_DEFAULT_SELECTION } from '@/types/grasim'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000

/** NSE market hours: 9:15 AM – 3:30 PM IST, Mon–Fri */
function isMarketOpen(): boolean {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const day = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const totalMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 30
}

function parseCompanies(param: string | null): GrasimSubsidiary[] {
  if (!param) return GRASIM_DEFAULT_SELECTION
  const candidates = param.split(',').map((s) => s.trim().toUpperCase())
  return candidates.filter((c): c is GrasimSubsidiary =>
    (GRASIM_SUBSIDIARIES as readonly string[]).includes(c)
  )
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const selectedCompanies = parseCompanies(searchParams.get('companies'))

    const [dhanPrices, stakes, shares, { data: eodRows }] = await Promise.all([
      getDhanGrasimPrices(),
      fetchGrasimStakes(),
      fetchLatestGrasimShares(),
      supabase
        .from('grasim_eod_prices')
        .select('*')
        .order('date', { ascending: false })
        .limit(2),
    ])

    const prevEod = eodRows?.[0] ?? null
    const prevEod2 = eodRows?.[1] ?? null

    const marketOpen = isMarketOpen()
    const useLive    = marketOpen && dhanPrices.GRASIM > 0

    function buildQuote(
      ticker: string,
      livePrice: number,
      eodPrice: number,
      eodPrice2: number | null,
      liveShares: number,
      eodMcap: number
    ): GrasimLiveQuote {
      if (useLive && livePrice > 0 && liveShares > 0) {
        const changePct = eodPrice > 0 ? ((livePrice - eodPrice) / eodPrice) * 100 : 0
        return {
          ticker,
          price: livePrice,
          mcap: (livePrice * liveShares) / CRORE,
          change_pct: changePct,
          last_updated: new Date().toISOString(),
        }
      }
      // After-hours: use stored EOD MCap
      const changePct = eodPrice2 && eodPrice2 > 0 ? ((eodPrice - eodPrice2) / eodPrice2) * 100 : 0
      return {
        ticker,
        price: eodPrice,
        mcap: eodMcap,
        change_pct: changePct,
        last_updated: prevEod?.date ?? new Date().toISOString().split('T')[0],
      }
    }

    if (!prevEod) {
      return NextResponse.json({ error: 'No EOD data available' }, { status: 502 })
    }

    const grasim = buildQuote(
      'GRASIM', dhanPrices.GRASIM,
      prevEod.grasim_price, prevEod2?.grasim_price ?? null,
      shares['GRASIM'] ?? 0, prevEod.grasim_mcap
    )
    const ultracemco = buildQuote(
      'ULTRACEMCO', dhanPrices.ULTRACEMCO,
      prevEod.ultracemco_price, prevEod2?.ultracemco_price ?? null,
      shares['ULTRACEMCO'] ?? 0, prevEod.ultracemco_mcap
    )
    const abcapital = buildQuote(
      'ABCAPITAL', dhanPrices.ABCAPITAL,
      prevEod.abcapital_price, prevEod2?.abcapital_price ?? null,
      shares['ABCAPITAL'] ?? 0, prevEod.abcapital_mcap
    )
    const idea = buildQuote(
      'IDEA', dhanPrices.IDEA,
      prevEod.idea_price, prevEod2?.idea_price ?? null,
      shares['IDEA'] ?? 0, prevEod.idea_mcap
    )
    const hindalco = buildQuote(
      'HINDALCO', dhanPrices.HINDALCO,
      prevEod.hindalco_price, prevEod2?.hindalco_price ?? null,
      shares['HINDALCO'] ?? 0, prevEod.hindalco_mcap
    )
    const abfrl = buildQuote(
      'ABFRL', dhanPrices.ABFRL,
      prevEod.abfrl_price, prevEod2?.abfrl_price ?? null,
      shares['ABFRL'] ?? 0, prevEod.abfrl_mcap
    )
    const ablbl = buildQuote(
      'ABLBL', dhanPrices.ABLBL,
      prevEod.ablbl_price ?? 0, prevEod2?.ablbl_price ?? null,
      shares['ABLBL'] ?? 0, prevEod.ablbl_mcap ?? 0
    )

    const quoteMap: Record<GrasimSubsidiary, GrasimLiveQuote> = {
      ULTRACEMCO: ultracemco, ABCAPITAL: abcapital, IDEA: idea,
      HINDALCO: hindalco, ABFRL: abfrl, ABLBL: ablbl,
    }

    const today = new Date().toISOString().split('T')[0]
    const stakeMap = getApplicableGrasimStakes(today, stakes, selectedCompanies)

    let basket_mcap = 0
    for (const company of selectedCompanies) {
      const stakePct = stakeMap[company] ?? 0
      basket_mcap += (stakePct / 100) * quoteMap[company].mcap
    }

    const residual_value = grasim.mcap - basket_mcap
    const spread_pct = grasim.mcap > 0 ? (residual_value / grasim.mcap) * 100 : 0

    const payload: GrasimLiveData = {
      grasim, ultracemco, abcapital, idea, hindalco, abfrl, ablbl,
      selectedCompanies,
      basket_mcap,
      residual_value,
      spread_pct,
      as_of: new Date().toISOString(),
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/prices/live-grasim]', err)
    return NextResponse.json({ error: 'Failed to fetch live Grasim quotes' }, { status: 502 })
  }
}
