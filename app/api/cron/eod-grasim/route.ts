import { NextRequest, NextResponse } from 'next/server'
import { getDhanGrasimPrices } from '@/lib/dhan-grasim'
import { fetchLatestGrasimShares, createServerClient } from '@/lib/supabase-grasim'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [dhanPrices, shares] = await Promise.all([
      getDhanGrasimPrices(),
      fetchLatestGrasimShares(),
    ])

    if (!(dhanPrices.GRASIM > 0)) {
      console.warn('[/api/cron/eod-grasim] Dhan prices unavailable — skipping')
      return NextResponse.json({ success: true, skipped: true, reason: 'dhan_unavailable' })
    }

    // IST date: UTC+5:30
    const now = new Date()
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]

    // shares are stored in Crores, so mcap (₹ Cr) = price × shares_in_Cr
    function mcap(price: number, company: string): number | null {
      const s = shares[company]
      return s && price > 0 ? price * s : null
    }

    const row = {
      date:             istDate,
      grasim_price:     dhanPrices.GRASIM,
      grasim_mcap:      mcap(dhanPrices.GRASIM, 'GRASIM'),
      grasim_shares:    shares['GRASIM'] ?? null,
      ultracemco_price: dhanPrices.ULTRACEMCO,
      ultracemco_mcap:  mcap(dhanPrices.ULTRACEMCO, 'ULTRACEMCO'),
      ultracemco_shares: shares['ULTRACEMCO'] ?? null,
      abcapital_price:  dhanPrices.ABCAPITAL,
      abcapital_mcap:   mcap(dhanPrices.ABCAPITAL, 'ABCAPITAL'),
      abcapital_shares: shares['ABCAPITAL'] ?? null,
      idea_price:       dhanPrices.IDEA,
      idea_mcap:        mcap(dhanPrices.IDEA, 'IDEA'),
      idea_shares:      shares['IDEA'] ?? null,
      hindalco_price:   dhanPrices.HINDALCO,
      hindalco_mcap:    mcap(dhanPrices.HINDALCO, 'HINDALCO'),
      hindalco_shares:  shares['HINDALCO'] ?? null,
      abfrl_price:      dhanPrices.ABFRL,
      abfrl_mcap:       mcap(dhanPrices.ABFRL, 'ABFRL'),
      abfrl_shares:     shares['ABFRL'] ?? null,
      ablbl_price:      dhanPrices.ABLBL > 0 ? dhanPrices.ABLBL : null,
      ablbl_mcap:       dhanPrices.ABLBL > 0 ? mcap(dhanPrices.ABLBL, 'ABLBL') : null,
      ablbl_shares:     shares['ABLBL'] ? shares['ABLBL'] : null,
      source:           'dhan',
    }

    const db = createServerClient()
    const { error } = await db
      .from('grasim_eod_prices')
      .upsert([row], { onConflict: 'date' })

    if (error) throw error

    return NextResponse.json({
      success: true,
      date: istDate,
      prices: {
        GRASIM: dhanPrices.GRASIM,
        ULTRACEMCO: dhanPrices.ULTRACEMCO,
        ABCAPITAL: dhanPrices.ABCAPITAL,
        IDEA: dhanPrices.IDEA,
        HINDALCO: dhanPrices.HINDALCO,
        ABFRL: dhanPrices.ABFRL,
        ABLBL: dhanPrices.ABLBL,
      },
    })
  } catch (err) {
    console.error('[/api/cron/eod-grasim]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
