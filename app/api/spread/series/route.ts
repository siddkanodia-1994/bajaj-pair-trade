import { NextResponse } from 'next/server'
import { supabase, fetchAllEodPrices } from '@/lib/supabase'
import { computeSpreadSeries } from '@/lib/spread-calculator'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [prices, { data: stakes, error: se }] = await Promise.all([
      fetchAllEodPrices(),
      supabase.from('stake_history').select('*').order('quarter_end_date', { ascending: true }),
    ])

    if (se) throw se

    const series = computeSpreadSeries(prices, stakes ?? [])

    return NextResponse.json({ series, count: series.length })
  } catch (err) {
    console.error('[/api/spread/series]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
