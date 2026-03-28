import { NextRequest, NextResponse } from 'next/server'
import { supabase, createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('active_trades')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trades: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    trade_group: string
    tranche_num: number
    direction: 'long' | 'short'
    window_key: string
    entry_date: string
    entry_spread: number
    entry_z: number | null
    size_label: string
    notes?: string
  }

  const { trade_group, tranche_num, direction, window_key, entry_date, entry_spread, entry_z, size_label, notes } = body

  if (!trade_group || !entry_date || entry_spread == null) {
    return NextResponse.json({ error: 'trade_group, entry_date, entry_spread required' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('active_trades')
    .insert({
      trade_group,
      tranche_num: tranche_num ?? 1,
      direction: direction ?? 'long',
      window_key: window_key ?? '2Y',
      entry_date,
      entry_spread,
      entry_z: entry_z ?? null,
      size_label: size_label ?? '50%',
      status: 'open',
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trade: data })
}
