import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Daily cron: renew the Dhan access token before it expires (24-hour lifetime).
 * Stores the new token in Supabase so all serverless instances pick it up immediately.
 * Schedule: 00:30 UTC = 06:00 IST, before market opens.
 *
 * Also callable manually:
 *   curl -H "Authorization: Bearer YOUR_SECRET" https://your-app.vercel.app/api/cron/renew-token
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get current active token: Supabase first, env var fallback
  let currentToken = process.env.DHAN_ACCESS_TOKEN ?? ''
  const { data: stored } = await supabase
    .from('dhan_tokens')
    .select('access_token')
    .eq('id', 1)
    .single()
  if (stored?.access_token) currentToken = stored.access_token

  const clientId = process.env.DHAN_CLIENT_ID ?? ''

  if (!currentToken || !clientId) {
    return NextResponse.json({ error: 'Missing DHAN_ACCESS_TOKEN or DHAN_CLIENT_ID' }, { status: 500 })
  }

  const res = await fetch('https://api.dhan.co/v2/RenewToken', {
    method: 'POST',
    headers: {
      'access-token': currentToken,
      'dhanClientId': clientId,  // RenewToken uses camelCase header per Dhan docs
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[renew-token] Dhan ${res.status}: ${body}`)
    return NextResponse.json({ error: `Dhan returned ${res.status}`, detail: body }, { status: 502 })
  }

  const json = await res.json()
  // Dhan docs don't show a clear response example; handle common field names
  const newToken =
    json.accessToken ??
    json.access_token ??
    json.data?.accessToken ??
    json.data?.access_token

  if (!newToken) {
    console.error('[renew-token] No token in Dhan response:', JSON.stringify(json))
    return NextResponse.json({ error: 'No token in response', raw: json }, { status: 502 })
  }

  await supabase.from('dhan_tokens').upsert({
    id: 1,
    access_token: newToken,
    renewed_at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true, renewed_at: new Date().toISOString() })
}
