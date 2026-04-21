import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessionToken = req.headers.get('X-Session-Token') ?? ''
  if (!sessionToken) return NextResponse.json({ alerts: [] })

  const { data, error } = await supabase
    .from('spread_alerts')
    .select('id, pair, threshold_pct, email, last_fired_date, created_at')
    .eq('session_token', sessionToken)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const sessionToken = req.headers.get('X-Session-Token') ?? ''
  if (!sessionToken) return NextResponse.json({ error: 'Missing session token' }, { status: 400 })

  const body = await req.json()
  const { pair, threshold_pct, email } = body as {
    pair: string
    threshold_pct: number
    email: string
  }

  if (!['bajaj', 'grasim', 'both'].includes(pair)) {
    return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
  }
  if (typeof threshold_pct !== 'number') {
    return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 })
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('spread_alerts')
    .insert({ session_token: sessionToken, pair, threshold_pct, email })
    .select('id, pair, threshold_pct, email, last_fired_date, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alert: data }, { status: 201 })
}
