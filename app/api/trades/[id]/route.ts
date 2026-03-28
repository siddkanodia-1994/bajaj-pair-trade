import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json() as {
    exit_date: string
    exit_spread: number
    exit_z: number | null
    exit_reason: 'target' | 'time_stop' | 'hard_stop' | 'manual'
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('active_trades')
    .update({
      status: 'closed',
      exit_date: body.exit_date,
      exit_spread: body.exit_spread,
      exit_z: body.exit_z ?? null,
      exit_reason: body.exit_reason,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trade: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('active_trades').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
