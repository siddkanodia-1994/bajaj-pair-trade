import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM_EMAIL ?? 'alerts@bajaj-pair-trade.com'
const DASHBOARD_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bajaj-pair-trade.vercel.app'

export async function sendSpreadAlert(
  to: string,
  pair: string,
  threshold: number,
  currentSpread: number,
) {
  const pairLabel = pair === 'bajaj' ? 'Bajaj Pair Trade' : pair === 'grasim' ? 'Grasim Pair Trade' : 'Bajaj & Grasim Pair Trade'
  const subject = `[Alert] ${pairLabel} spread ≥ ${threshold.toFixed(2)}%`

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px;font-size:18px;color:#1e293b">Spread Alert Triggered</h2>
        <p style="margin:0 0 16px;color:#475569;font-size:14px">
          Your alert for <strong>${pairLabel}</strong> has fired.
        </p>
        <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px">Current Spread</div>
          <div style="font-size:28px;font-weight:700;color:#0f172a">${currentSpread.toFixed(2)}%</div>
          <div style="font-size:13px;color:#64748b;margin-top:8px">
            Alert threshold: ≥ ${threshold.toFixed(2)}%
          </div>
        </div>
        <a href="${DASHBOARD_URL}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px">
          View Dashboard →
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">
          Sent at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
        </p>
      </div>
    `,
  })
}
