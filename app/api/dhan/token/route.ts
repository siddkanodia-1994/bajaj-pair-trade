import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies()
  if (cookieStore.get('bajaj_owner')?.value !== '1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
