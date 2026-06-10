import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { runBackfill } from '@/lib/backfill'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  let body: { access_token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = body.access_token?.trim()
  if (!token || !token.startsWith('eyJ')) {
    return NextResponse.json({ error: 'Invalid token — must be a JWT starting with eyJ' }, { status: 400 })
  }

  const renewedAt = new Date().toISOString()
  const { error } = await supabase.from('dhan_tokens').upsert({
    id: 1,
    access_token: token,
    renewed_at: renewedAt,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-backfill: check last ~10 trading days for EOD gaps caused by token expiry
  const toDate   = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const backfill = await runBackfill(fromDate, toDate).catch((e: unknown) => ({
    inserted: 0,
    dates: [] as string[],
    error: String(e),
  }))

  return NextResponse.json({ success: true, renewed_at: renewedAt, backfill })
}
