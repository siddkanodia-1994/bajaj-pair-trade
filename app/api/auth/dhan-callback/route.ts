import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Dhan redirect callback — auto-saves the new access token to Supabase.
 *
 * Set this as the Redirect URL on dhanhq.co:
 *   https://bajaj-pair-trade-iyzo.vercel.app/api/auth/dhan-callback?secret=YOUR_SECRET
 *
 * After clicking "Generate API Key", Dhan appends ?access_token=... and redirects here.
 * The token is upserted into dhan_tokens (id=1) so the cron and live API pick it up immediately.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const accessToken = req.nextUrl.searchParams.get('access_token')

  if (!process.env.DHAN_CALLBACK_SECRET || secret !== process.env.DHAN_CALLBACK_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  if (!accessToken) {
    return new NextResponse('Missing access_token parameter', { status: 400 })
  }

  const { error } = await supabase.from('dhan_tokens').upsert({
    id: 1,
    access_token: accessToken,
    renewed_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[dhan-callback] Supabase upsert error:', error)
    return new NextResponse(html('error', error.message), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return new NextResponse(html('success'), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function html(status: 'success' | 'error', detail?: string) {
  if (status === 'success') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dhan Token Saved</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff">
<div style="text-align:center">
  <div style="font-size:3rem">&#10003;</div>
  <h2 style="color:#4ade80;margin:0.5rem 0">Dhan token saved</h2>
  <p style="color:#94a3b8">Token stored in Supabase. Live prices will use the new token immediately.</p>
  <p style="color:#64748b;font-size:0.85rem">You can close this tab.</p>
</div></body></html>`
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff">
<div style="text-align:center">
  <div style="font-size:3rem">&#10007;</div>
  <h2 style="color:#f87171;margin:0.5rem 0">Failed to save token</h2>
  <p style="color:#94a3b8">${detail ?? 'Unknown error'}</p>
</div></body></html>`
}
