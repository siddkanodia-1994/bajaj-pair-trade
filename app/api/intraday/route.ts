import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')

  try {
    if (!date) {
      // Return list of available dates
      const { data, error } = await supabase
        .from('intraday_prices')
        .select('date')
        .order('date', { ascending: false })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const dates = [...new Set((data ?? []).map((r: { date: string }) => r.date))]
      return NextResponse.json({ availableDates: dates })
    }

    // Return ticks for the requested date
    const { data, error } = await supabase
      .from('intraday_prices')
      .select('tick_time, spread_pct')
      .eq('date', date)
      .order('tick_time', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ticks = (data ?? []).map((r: { tick_time: string; spread_pct: number }) => ({
      time: new Date(r.tick_time)
        .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }),
      spread_pct: r.spread_pct,
    }))

    return NextResponse.json({ ticks })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
