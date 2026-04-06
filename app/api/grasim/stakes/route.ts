import { NextRequest, NextResponse } from 'next/server'
import { supabase, createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('grasim_stake_history')
    .select('*')
    .order('quarter_end_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stakes: data })
}

// Body: { rows: { quarter_end_date: string; company: string; stake_pct: number }[] }
// UI-initiated — no cron-secret required
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      rows: { quarter_end_date: string; company: string; stake_pct: number }[]
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: 'rows array required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('grasim_stake_history')
      .upsert(
        body.rows.map((r) => ({
          quarter_end_date: r.quarter_end_date,
          company: r.company,
          stake_pct: r.stake_pct,
          source: 'manual',
        })),
        { onConflict: 'quarter_end_date,company' }
      )
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ stakes: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
