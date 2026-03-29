import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Yahoo Finance seeding is disabled. Historical data (1 Jan 2019 – 25 Mar 2026)
// is sourced from the PDF via scripts/seed_from_pdf.py.
export async function POST() {
  return NextResponse.json(
    { error: 'Yahoo Finance seeding is disabled. Use scripts/seed_from_pdf.py for historical data.' },
    { status: 405 }
  )
}
