import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { computeSpreadSeries } from '@/lib/spread-calculator'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [{ data: prices, error: pe }, { data: stakes, error: se }] = await Promise.all([
      supabase.from('eod_prices').select('*').order('date', { ascending: true }),
      supabase.from('stake_history').select('*').order('quarter_end_date', { ascending: true }),
    ])

    if (pe) throw pe
    if (se) throw se

    const series = computeSpreadSeries(prices ?? [], stakes ?? [])

    return NextResponse.json({ series, count: series.length })
  } catch (err) {
    console.error('[/api/spread/series]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
