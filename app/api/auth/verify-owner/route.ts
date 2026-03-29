import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password: string }

  if (!password || password !== process.env.OWNER_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({
    ok: true,
    ownerToken: process.env.OWNER_SESSION_TOKEN ?? 'owner',
  })

  res.cookies.set('bajaj_owner', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  return res
}
