import { NextRequest, NextResponse } from 'next/server'
import { getHistoricalPrices } from '@/lib/yahoo-finance'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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
    // Fetch last 7 days to ensure we catch any missed days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)

    const rows = await getHistoricalPrices(startDate, endDate)

    const db = createServerClient()
    const { error } = await db
      .from('eod_prices')
      .upsert(rows, { onConflict: 'date' })

    if (error) throw error

    return NextResponse.json({ success: true, rows_upserted: rows.length })
  } catch (err) {
    console.error('[/api/cron/eod]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
