import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fetchRules } from '@/lib/supabase'

export async function GET() {
  try {
    const rules = await fetchRules()
    return NextResponse.json(rules)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Body: Array<{ rule_key: string; rule_value: number }>
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { rule_key: string; rule_value: number }[]
    const db = createServerClient()

    const upserts = body.map((item) => ({
      rule_key: item.rule_key,
      rule_value: item.rule_value,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await db
      .from('trading_rules')
      .upsert(upserts, { onConflict: 'rule_key' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const updated = await fetchRules()
    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
