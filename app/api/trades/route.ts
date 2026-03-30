import { NextRequest, NextResponse } from 'next/server'
import { supabase, createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessionToken = req.headers.get('X-Session-Token') ?? ''
  const isOwner = req.cookies.get('bajaj_owner')?.value === '1'
  const ownerToken = process.env.OWNER_SESSION_TOKEN ?? 'owner'

  // Visitor trades (filtered by their session token)
  const { data: myTrades, error } = await supabase
    .from('active_trades')
    .select('*')
    .eq('session_token', sessionToken || '__none__')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If owner cookie is present, also return owner trades separately
  if (isOwner) {
    const { data: ownerTrades, error: ownerError } = await supabase
      .from('active_trades')
      .select('*')
      .eq('session_token', ownerToken)
      .order('created_at', { ascending: false })

    if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 500 })
    return NextResponse.json({ trades: myTrades ?? [], ownerTrades: ownerTrades ?? [] })
  }

  return NextResponse.json({ trades: myTrades ?? [] })
}

export async function POST(req: NextRequest) {
  const isOwner = req.cookies.get('bajaj_owner')?.value === '1'
  const ownerToken = process.env.OWNER_SESSION_TOKEN ?? 'owner'
  // If owner cookie is present, always write trades under the owner session token
  const sessionToken = isOwner ? ownerToken : (req.headers.get('X-Session-Token') ?? '')
  if (!sessionToken) {
    return NextResponse.json({ error: 'X-Session-Token header required' }, { status: 400 })
  }

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
      session_token: sessionToken,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trade: data })
}
