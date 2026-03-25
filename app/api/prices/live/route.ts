import { NextResponse } from 'next/server'
import { getLiveQuotes } from '@/lib/yahoo-finance'
import { getApplicableStake } from '@/lib/spread-calculator'
import { supabase } from '@/lib/supabase'
import type { LiveSpreadData } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data: stakes } = await supabase
      .from('stake_history')
      .select('*')
      .order('quarter_end_date', { ascending: false })
      .limit(10)

    const { finsv, fin } = await getLiveQuotes()

    const today = new Date().toISOString().split('T')[0]
    const stake_pct = getApplicableStake(today, stakes ?? [])
    const stake_fraction = stake_pct / 100

    const underlying_stake_value = stake_fraction * fin.mcap
    const residual_value = finsv.mcap - underlying_stake_value
    const spread_pct = finsv.mcap > 0 ? (residual_value / finsv.mcap) * 100 : 0

    const payload: LiveSpreadData = {
      finsv,
      fin,
      stake_pct,
      underlying_stake_value,
      residual_value,
      spread_pct,
      as_of: new Date().toISOString(),
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/prices/live]', err)
    return NextResponse.json({ error: 'Failed to fetch live quotes' }, { status: 502 })
  }
}
