import { NextRequest, NextResponse } from 'next/server'
import { getHistoricalPrices } from '@/lib/yahoo-finance'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min timeout for bulk seed

export async function POST(req: NextRequest) {
  // Protect with CRON_SECRET
  const secret = req.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const yearsBack = (body as { years?: number }).years ?? 6
    const endDate = new Date()
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - yearsBack)

    console.log(`[seed] Fetching prices from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)

    const rows = await getHistoricalPrices(startDate, endDate)
    console.log(`[seed] Got ${rows.length} rows from Yahoo Finance`)

    const supabase = createServerClient()

    // Upsert in batches of 500
    let inserted = 0
    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await supabase
        .from('eod_prices')
        .upsert(batch, { onConflict: 'date' })
      if (error) throw error
      inserted += batch.length
    }

    return NextResponse.json({ success: true, rows_inserted: inserted })
  } catch (err) {
    console.error('[/api/prices/seed]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
