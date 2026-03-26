import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET — return all share_history rows
export async function GET() {
  const { data, error } = await supabase
    .from('share_history')
    .select('*')
    .order('effective_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — upsert a single row: { company, effective_date, shares, source? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      company: string
      effective_date: string
      shares: number
      source?: string
    }

    if (!body.company || !body.effective_date || !body.shares) {
      return NextResponse.json({ error: 'company, effective_date, shares required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('share_history')
      .upsert(
        {
          company:        body.company,
          effective_date: body.effective_date,
          shares:         body.shares,
          source:         body.source ?? 'manual',
        },
        { onConflict: 'company,effective_date' }
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE — remove a row by id
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json() as { id: number }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const db = createServerClient()
    const { error } = await db.from('share_history').delete().eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
