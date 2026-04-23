import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessionToken = req.headers.get('X-Session-Token') ?? ''
  if (!sessionToken) return NextResponse.json({ alerts: [] })

  const { data, error } = await createServerClient()
    .from('spread_alerts')
    .select('id, pair, threshold_pct, telegram_chat_id, last_fired_date, created_at')
    .eq('session_token', sessionToken)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const sessionToken = req.headers.get('X-Session-Token') ?? ''
  if (!sessionToken) return NextResponse.json({ error: 'Missing session token' }, { status: 400 })

  const body = await req.json()
  const { pair, threshold_pct, telegram_chat_id } = body as {
    pair: string
    threshold_pct: number
    telegram_chat_id: string
  }

  if (!['bajaj', 'grasim', 'both'].includes(pair)) {
    return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
  }
  if (typeof threshold_pct !== 'number') {
    return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 })
  }
  if (!telegram_chat_id || !/^-?\d+$/.test(telegram_chat_id.trim())) {
    return NextResponse.json({ error: 'Invalid Telegram chat ID (numbers only)' }, { status: 400 })
  }

  const { data, error } = await createServerClient()
    .from('spread_alerts')
    .insert({ session_token: sessionToken, pair, threshold_pct, telegram_chat_id: telegram_chat_id.trim() })
    .select('id, pair, threshold_pct, telegram_chat_id, last_fired_date, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alert: data }, { status: 201 })
}
