import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { runBackfill } from '@/lib/backfill'

export const dynamic = 'force-dynamic'

function toResponse(result: Awaited<ReturnType<typeof runBackfill>>) {
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ success: true, inserted: result.inserted, dates: result.dates })
}

export async function GET(req: NextRequest) {
  const jar = await cookies()
  if (jar.get('bajaj_owner')?.value !== '1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const fromDate = searchParams.get('fromDate')
  const toDate   = searchParams.get('toDate')
  if (!fromDate || !toDate) {
    return NextResponse.json({ error: 'fromDate and toDate query params required (YYYY-MM-DD)' }, { status: 400 })
  }
  return toResponse(await runBackfill(fromDate, toDate))
}

export async function POST(req: NextRequest) {
  const jar = await cookies()
  if (jar.get('bajaj_owner')?.value !== '1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { fromDate?: string; toDate?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { fromDate, toDate } = body
  if (!fromDate || !toDate) {
    return NextResponse.json({ error: 'fromDate and toDate required (YYYY-MM-DD)' }, { status: 400 })
  }
  return toResponse(await runBackfill(fromDate, toDate))
}
