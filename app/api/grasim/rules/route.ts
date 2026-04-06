import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-grasim'
import { fetchGrasimRules } from '@/lib/supabase-grasim'

export async function GET() {
  try {
    const rules = await fetchGrasimRules()
    return NextResponse.json(rules)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Body: Array<{ rule_key: string; rule_value: number }>
export async function PATCH(req: Request) {
  const cookieHeader = (req as import('next/server').NextRequest).cookies?.get?.('bajaj_owner')
  const isOwner = cookieHeader?.value === '1'
  if (!isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json() as { rule_key: string; rule_value: number }[]
    const db = createServerClient()

    const upserts = body.map((item) => ({
      rule_key: item.rule_key,
      rule_value: item.rule_value,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await db
      .from('grasim_trading_rules')
      .upsert(upserts, { onConflict: 'rule_key' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const updated = await fetchGrasimRules()
    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
