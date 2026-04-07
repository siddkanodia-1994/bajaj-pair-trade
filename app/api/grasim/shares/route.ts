import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('grasim_share_history')
    .select('*')
    .order('effective_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

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
      .from('grasim_share_history')
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

export async function DELETE(req: NextRequest) {
  try {
    const { company, effective_date } = await req.json() as { company: string; effective_date: string }
    if (!company || !effective_date) return NextResponse.json({ error: 'company and effective_date required' }, { status: 400 })

    const db = createServerClient()
    const { error } = await db.from('grasim_share_history').delete().eq('company', company).eq('effective_date', effective_date)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
