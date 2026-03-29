import { NextRequest, NextResponse } from 'next/server'
import { getDhanLivePrices } from '@/lib/dhan'
import { fetchLatestShares, createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000

export async function GET(req: NextRequest) {
  // Vercel cron passes Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [dhanPrices, shares] = await Promise.all([
      getDhanLivePrices(),
      fetchLatestShares(),
    ])

    if (!(dhanPrices.fin > 0 && dhanPrices.finsv > 0 && shares.fin > 0 && shares.finsv > 0)) {
      console.warn('[/api/cron/eod] Dhan prices unavailable — skipping EOD save')
      return NextResponse.json({ success: true, skipped: true, reason: 'dhan_unavailable' })
    }

    // IST date: UTC+5:30
    const now = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const istDate = new Date(now.getTime() + istOffset).toISOString().split('T')[0]

    const row = {
      date:        istDate,
      fin_price:   dhanPrices.fin,
      fin_mcap:    (dhanPrices.fin   * shares.fin)   / CRORE,
      finsv_price: dhanPrices.finsv,
      finsv_mcap:  (dhanPrices.finsv * shares.finsv) / CRORE,
      source:      'dhan',
    }

    const db = createServerClient()
    const { error } = await db
      .from('eod_prices')
      .upsert([row], { onConflict: 'date' })

    if (error) throw error

    return NextResponse.json({ success: true, date: istDate, source: 'dhan' })
  } catch (err) {
    console.error('[/api/cron/eod]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
