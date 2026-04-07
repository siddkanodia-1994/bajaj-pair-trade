import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data } = await supabase
    .from('dhan_tokens')
    .select('access_token, client_id, renewed_at')
    .eq('id', 1)
    .single()

  const token = data?.access_token ?? process.env.DHAN_ACCESS_TOKEN ?? ''
  const clientId = data?.client_id ?? process.env.DHAN_CLIENT_ID ?? ''

  const res = await fetch('https://api.dhan.co/v2/marketfeed/ltp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access-token': token,
      'client-id': clientId,
    },
    body: JSON.stringify({ NSE_EQ: [317, 16675] }),
    cache: 'no-store',
  })

  const body = await res.text()

  return NextResponse.json({
    http_status: res.status,
    client_id_used: clientId,
    token_length: token.length,
    token_prefix: token.slice(0, 30),
    renewed_at: data?.renewed_at,
    dhan_response: body,
  })
}
