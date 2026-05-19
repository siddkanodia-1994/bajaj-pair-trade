import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  // Time-gate: only allow paste when token is near expiry (age ≥ 20h) or absent
  const { data: tokenRow } = await supabase
    .from('dhan_tokens')
    .select('renewed_at')
    .eq('id', 1)
    .single()

  if (tokenRow?.renewed_at) {
    const ageHours = (Date.now() - new Date(tokenRow.renewed_at).getTime()) / 3_600_000
    if (ageHours < 20) {
      return NextResponse.json(
        { error: 'Token is still valid — paste only allowed when less than 4 hours remaining' },
        { status: 403 }
      )
    }
  }

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

  return NextResponse.json({ success: true, renewed_at: renewedAt })
}
