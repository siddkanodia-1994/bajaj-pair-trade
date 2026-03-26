import { NextRequest, NextResponse } from 'next/server'
import { supabase, createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('stake_history')
    .select('*')
    .order('quarter_end_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stakes: data })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { quarter_end_date, stake_pct, source } = body as {
    quarter_end_date: string
    stake_pct: number
    source?: string
  }

  if (!quarter_end_date || !stake_pct) {
    return NextResponse.json({ error: 'quarter_end_date and stake_pct required' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('stake_history')
    .upsert({ quarter_end_date, stake_pct, source: source ?? null }, { onConflict: 'quarter_end_date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stake: data })
}

// UI-initiated update — no cron-secret required (internal tool)
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { quarter_end_date, stake_pct } = body as {
    quarter_end_date: string
    stake_pct: number
  }

  if (!quarter_end_date || stake_pct == null) {
    return NextResponse.json({ error: 'quarter_end_date and stake_pct required' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('stake_history')
    .upsert({ quarter_end_date, stake_pct }, { onConflict: 'quarter_end_date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stake: data })
}
