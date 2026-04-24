import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionToken = req.headers.get('X-Session-Token') ?? ''
  if (!sessionToken) return NextResponse.json({ error: 'Missing session token' }, { status: 400 })

  const { id } = await params
  const { error } = await createServerClient()
    .from('spread_alerts')
    .delete()
    .eq('id', id)
    .eq('session_token', sessionToken)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
