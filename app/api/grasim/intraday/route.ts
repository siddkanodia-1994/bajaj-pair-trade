import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')

  try {
    if (!date) {
      const { data, error } = await supabase
        .from('grasim_intraday_prices')
        .select('date')
        .order('date', { ascending: false })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const dates = [...new Set((data ?? []).map((r: { date: string }) => r.date))]
      return NextResponse.json({ availableDates: dates })
    }

    const { data, error } = await supabase
      .from('grasim_intraday_prices')
      .select('tick_time, spread_pct, grasim_mcap, ultracemco_mcap, abcapital_mcap, idea_mcap, hindalco_mcap, abfrl_mcap, ablbl_mcap')
      .eq('date', date)
      .order('tick_time', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type IntradayRow = {
      tick_time: string
      spread_pct: number
      grasim_mcap: number | null
      ultracemco_mcap: number | null
      abcapital_mcap: number | null
      idea_mcap: number | null
      hindalco_mcap: number | null
      abfrl_mcap: number | null
      ablbl_mcap: number | null
    }

    const ticks = (data ?? []).map((r: IntradayRow) => ({
      time: new Date(r.tick_time)
        .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }),
      spread_pct:      r.spread_pct,
      grasim_mcap:     r.grasim_mcap,
      ultracemco_mcap: r.ultracemco_mcap,
      abcapital_mcap:  r.abcapital_mcap,
      idea_mcap:       r.idea_mcap,
      hindalco_mcap:   r.hindalco_mcap,
      abfrl_mcap:      r.abfrl_mcap,
      ablbl_mcap:      r.ablbl_mcap,
    }))

    return NextResponse.json({ ticks })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
